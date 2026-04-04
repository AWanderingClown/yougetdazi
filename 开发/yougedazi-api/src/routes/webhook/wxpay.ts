import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { orderService, OrderError } from '../../services/order.service'
import { paymentService } from '../../services/payment.service'
import { pushBridgeService, PushEvent } from '../../services/push-bridge.service'
import { redis, RedisKey } from '../../lib/redis'
import { ErrorCode } from '../../types/index'
import { getWxPayInstance } from '../../lib/wxpay'

/**
 * 微信支付回调处理
 *
 * 幂等保证策略：
 * 1. payment_records.out_trade_no 有唯一约束 → 数据库层防重复
 * 2. 处理前先查 payment_records.status，如已是 'paid' 直接返回成功
 * 3. 整个回调处理包在 Prisma 事务中（更新支付记录 + 更新订单状态 + 写日志）
 * 4. 回调处理成功必须返回 200 + {"code":"SUCCESS","message":"成功"}
 *    否则微信会按指数退避重试（最多 15 次，持续 24h）
 *
 * 签名验证：
 * 使用 wechatpay-node-v3 的 verifySign() 验证回调签名
 * 必须在处理业务前验证，防止伪造回调
 */

// ============================================================
// Webhook 路由
// ============================================================

export async function webhookRoutes(app: FastifyInstance) {
  /**
   * POST /webhook/wx-pay
   * 微信支付统一回调
   *
   * 处理场景（通过 out_trade_no 前缀区分）：
   * - ORDER_xxx  → 订单首次支付
   * - RENEW_xxx  → 续费支付
   * - DEPOSIT_xxx → 保证金支付
   */
  app.post('/webhook/wx-pay', async (request, reply) => {
    const wxSuccess = { code: 'SUCCESS', message: '成功' }
    const wxFail = (msg: string) => ({ code: 'FAIL', message: msg })

    try {
      // ============================================================
      // Step 1: 验证微信签名（生产环境必须开启）
      // ============================================================
      const wxpay = getWxPayInstance()
      let callbackBody: Record<string, unknown>

      if (wxpay) {
        // 已配置微信支付证书：无论任何环境都必须验签
        const headers = request.headers as Record<string, string>
        const body = request.body as string

        // 验证签名
        const verified = wxpay.verifySign({
          headers,
          body,
        })

        if (!verified) {
          app.log.error('微信支付回调签名验证失败')
          return reply.status(401).send(wxFail('签名验证失败'))
        }

        app.log.info('微信支付回调签名验证通过')

        // 解析并解密
        callbackBody = typeof body === 'string' ? JSON.parse(body) : body

        if (callbackBody.resource) {
          const resource = callbackBody.resource as {
            ciphertext: string
            associated_data: string
            nonce: string
          }

          // AES-GCM 解密
          const decrypted = wxpay.decipher_gcm(
            resource.ciphertext,
            resource.associated_data,
            resource.nonce
          )

          callbackBody = JSON.parse(decrypted)
          app.log.info('微信支付回调解密成功')
        }
      } else {
        // 证书未配置时：生产环境直接拒绝，开发环境接受明文
        if (process.env.NODE_ENV === 'production') {
          app.log.error('生产环境微信支付证书未配置，拒绝回调')
          return reply.status(500).send(wxFail('服务配置错误'))
        }
        callbackBody = request.body as Record<string, unknown>
        app.log.warn('签名验证未启用（开发模式）')
      }

      // ============================================================
      // Step 2: 提取支付信息
      // ============================================================
      const outTradeNo = callbackBody.out_trade_no as string
      const paidAmount = Number(callbackBody.amount?.['total'] || callbackBody.amount?.['payer_total'] || 0)
      const wxTransactionId = callbackBody.transaction_id as string
      const tradeState = callbackBody.trade_state as string

      if (!outTradeNo) {
        app.log.error('webhook: 缺少 out_trade_no')
        return reply.status(200).send(wxFail('缺少 out_trade_no'))
      }

      // 只处理支付成功的回调
      if (tradeState && tradeState !== 'SUCCESS') {
        app.log.info(`支付状态非成功: ${tradeState}, out_trade_no: ${outTradeNo}`)
        return reply.status(200).send(wxSuccess)
      }

      app.log.info(`收到支付回调: ${outTradeNo}, 金额: ${paidAmount}分, 微信流水: ${wxTransactionId}`)

      // ============================================================
      // Step 3: 按业务场景分发处理
      // ============================================================
      let pushEvents: PushEvent[] = []

      if (outTradeNo.startsWith('ORDER_')) {
        // 订单首次支付
        const result = await orderService.handlePaymentSuccess(outTradeNo, paidAmount, wxTransactionId)
        if (result && 'pushEvents' in result && Array.isArray(result.pushEvents)) {
          pushEvents = result.pushEvents
        }
      } else if (outTradeNo.startsWith('RENEW_')) {
        // 续费支付
        await handleRenewalPayment(outTradeNo, paidAmount, wxTransactionId, app)
      } else if (outTradeNo.startsWith('DEPOSIT_')) {
        // 保证金支付
        await handleDepositPayment(outTradeNo, paidAmount, wxTransactionId, app)
      } else {
        app.log.warn(`webhook: 未知 out_trade_no 前缀: ${outTradeNo}`)
      }

      // Step 4: 转发推送事件给管理后台（由管理后台统一推送给B/C端）
      if (pushEvents.length > 0) {
        await pushBridgeService.sendPushEvents(pushEvents, 'payment_service')
      }

      return reply.status(200).send(wxSuccess)
    } catch (err: unknown) {
      const error = err as { name?: string; errorKey?: string; message?: string }
      app.log.error(err, '支付回调处理失败')

      // 金额不一致是伪造回调，返回成功避免微信重试（安全起见不暴露原因）
      if (error.name === 'OrderError' && error.errorKey === 'PAYMENT_AMOUNT_MISMATCH') {
        return reply.status(200).send(wxSuccess)
      }

      // 已处理过的回调，幂等返回
      if (error.name === 'OrderError' && error.errorKey === 'ALREADY_PAID') {
        return reply.status(200).send(wxSuccess)
      }

      // 已知业务错误（OrderError）：返回 SUCCESS，告知微信不重试
      // 未知错误（数据库故障等）：返回 500，让微信按指数退避重试
      if ((err as { name?: string }).name === 'OrderError') {
        return reply.status(200).send(wxSuccess)
      }
      return reply.status(500).send(wxFail('服务暂时不可用'))
    }
  })

  /**
   * POST /webhook/wx-refund
   * 微信退款结果回调
   */
  app.post('/webhook/wx-refund', async (request, reply) => {
    try {
      // 验证签名（与支付回调相同逻辑）
      const wxpay = getWxPayInstance()
      let callbackBody: Record<string, unknown>

      if (wxpay) {
        const headers = request.headers as Record<string, string>
        const body = request.body as string

        const verified = wxpay.verifySign({ headers, body })
        if (!verified) {
          app.log.error('微信退款回调签名验证失败')
          return reply.status(401).send({ code: 'FAIL', message: '签名验证失败' })
        }

        callbackBody = typeof body === 'string' ? JSON.parse(body) : body

        if (callbackBody.resource) {
          const resource = callbackBody.resource as {
            ciphertext: string
            associated_data: string
            nonce: string
          }
          const decrypted = wxpay.decipher_gcm(
            resource.ciphertext,
            resource.associated_data,
            resource.nonce
          )
          callbackBody = JSON.parse(decrypted)
        }
      } else {
        callbackBody = request.body as Record<string, unknown>
      }

      const outRefundNo = callbackBody.out_refund_no as string
      const refundId = callbackBody.refund_id as string
      const refundStatus = callbackBody.refund_status as string // SUCCESS / CLOSED / ABNORMAL

      if (!outRefundNo) {
        return reply.status(200).send({ code: 'SUCCESS', message: '成功' })
      }

      const refund = await prisma.refundRecord.findUnique({ where: { out_refund_no: outRefundNo } })
      if (!refund || refund.status === 'success') {
        // 已处理，幂等
        return reply.status(200).send({ code: 'SUCCESS', message: '成功' })
      }

      await prisma.refundRecord.update({
        where: { out_refund_no: outRefundNo },
        data: {
          status: refundStatus === 'SUCCESS' ? 'success' : 'failed',
          refund_id: refundId ?? null,
        },
      })

      app.log.info(`退款回调处理完成: ${outRefundNo}, 状态: ${refundStatus}`)
    } catch (err) {
      app.log.error(err, '退款回调处理失败')
    }

    return reply.status(200).send({ code: 'SUCCESS', message: '成功' })
  })

  /**
   * POST /webhook/wx-pay/test
   * 开发测试专用：模拟支付成功（生产环境禁用）
   */
  if (process.env.NODE_ENV !== 'production') {
    app.post('/webhook/wx-pay/test', async (request, reply) => {
      const body = request.body as { out_trade_no: string; amount?: number; transaction_id?: string }

      if (!body.out_trade_no) {
        return reply.status(400).send({ code: ErrorCode.VALIDATION_ERROR, message: '缺少 out_trade_no' })
      }

      try {
        if (body.out_trade_no.startsWith('ORDER_')) {
          // 订单支付测试
          const record = await prisma.paymentRecord.findUnique({
            where: { out_trade_no: body.out_trade_no },
          })
          if (!record) {
            return reply.status(404).send({ code: ErrorCode.NOT_FOUND, message: '支付记录不存在' })
          }

          const result = await orderService.handlePaymentSuccess(
            body.out_trade_no,
            body.amount ?? record.amount,
            body.transaction_id ?? `TEST_${Date.now()}`
          )

          // 发送 push 事件
          if (result && 'pushEvents' in result && Array.isArray(result.pushEvents)) {
            await pushBridgeService.sendPushEvents(result.pushEvents as PushEvent[], 'payment_service')
          }
        } else if (body.out_trade_no.startsWith('RENEW_')) {
          // 续费支付测试
          await handleRenewalPayment(
            body.out_trade_no,
            body.amount ?? 0,
            body.transaction_id ?? `TEST_${Date.now()}`,
            app
          )
        } else if (body.out_trade_no.startsWith('DEPOSIT_')) {
          // 保证金支付测试
          await handleDepositPayment(
            body.out_trade_no,
            body.amount ?? 0,
            body.transaction_id ?? `TEST_${Date.now()}`,
            app
          )
        }

        return reply.status(200).send({ code: ErrorCode.SUCCESS, message: '模拟支付成功' })
      } catch (err: unknown) {
        const error = err as { name?: string; message?: string }
        return reply.status(400).send({ code: ErrorCode.VALIDATION_ERROR, message: error.message })
      }
    })
  }
}

// ============================================================
// 业务处理函数
// ============================================================

/**
 * 处理续费支付成功
 */
async function handleRenewalPayment(
  outTradeNo: string,
  paidAmount: number,
  transactionId: string,
  app: FastifyInstance
) {
  // 1. 查找续费记录
  const renewal = await prisma.orderRenewal.findUnique({
    where: { out_trade_no: outTradeNo },
    include: { order: true },
  })

  if (!renewal) {
    throw new OrderError(ErrorCode.NOT_FOUND, 'RENEWAL_NOT_FOUND', '续费记录不存在')
  }

  // 2. 原子幂等锁：用 updateMany where transaction_id=null 抢占处理权
  //    两个并发回调只有一个能更新成功（数据库行锁保证），count=0 则已被处理
  const locked = await prisma.orderRenewal.updateMany({
    where: { id: renewal.id, transaction_id: null },
    data:  { transaction_id: transactionId },
  })
  if (locked.count === 0) {
    app.log.info(`续费已处理: ${outTradeNo}`)
    return
  }

  // 3. 验证金额
  if (paidAmount !== renewal.added_amount) {
    throw new OrderError(
      ErrorCode.VALIDATION_ERROR,
      'PAYMENT_AMOUNT_MISMATCH',
      `续费金额不一致: 期望 ${renewal.added_amount} 分, 实际 ${paidAmount} 分`
    )
  }

  // 4. 更新续费记录和订单
  await prisma.$transaction(async (tx) => {
    // 更新续费记录状态（transaction_id 已在事务外原子写入）
    await tx.orderRenewal.update({
      where: { id: renewal.id },
      data: {
        status: 'paid',
        paid_at: new Date(),
      },
    })

    // 创建续费支付记录
    await tx.paymentRecord.create({
      data: {
        order_id: renewal.order_id,
        out_trade_no: outTradeNo,
        transaction_id: transactionId,
        amount: paidAmount,
        status: 'paid',
        pay_time: new Date(),
      },
    })

    // 延长订单服务结束时间
    const currentEndAt = renewal.order.service_end_at ?? new Date()
    const addedMs = renewal.added_hours * 60 * 60 * 1000
    const newEndAt = new Date(currentEndAt.getTime() + addedMs)

    await tx.order.update({
      where: { id: renewal.order_id },
      data: {
        service_end_at: newEndAt,
        paid_amount: { increment: paidAmount },  // 累计支付金额
      },
    })

    // 写入操作日志
    await tx.orderOperationLog.create({
      data: {
        order_id: renewal.order_id,
        operator_type: 'system',
        action: 'renewal_paid',
        note: `续费成功，增加 ${renewal.added_hours} 小时，金额 ${paidAmount} 分，新结束时间: ${newEndAt.toISOString()}`,
        metadata: {
          renewal_id: renewal.id,
          added_hours: renewal.added_hours,
          paid_amount: paidAmount,
          transaction_id: transactionId,
        },
      },
    })
  })

  // 5. 更新 Redis 倒计时（延长）
  const orderId = renewal.order_id
  const remainingSeconds = Math.ceil(
    (new Date(renewal.order.service_end_at!).getTime() + renewal.added_hours * 60 * 60 * 1000 - Date.now()) / 1000
  )
  if (remainingSeconds > 0) {
    await redis.setex(RedisKey.orderTimer(orderId), remainingSeconds + 60, String(remainingSeconds))
  }

  app.log.info(`续费处理完成: ${outTradeNo}, 订单: ${renewal.order_id}`)
}

/**
 * 处理保证金支付成功
 */
async function handleDepositPayment(
  outTradeNo: string,
  paidAmount: number,
  transactionId: string,
  app: FastifyInstance
) {
  // 查找保证金缴纳记录
  const transaction = await prisma.depositTransaction.findUnique({
    where: { out_trade_no: outTradeNo },
    include: { companion: true },
  })

  if (!transaction) {
    throw new OrderError(ErrorCode.NOT_FOUND, 'DEPOSIT_NOT_FOUND', '保证金缴纳记录不存在')
  }

  // 幂等检查
  if (transaction.transaction_id) {
    app.log.info(`保证金已处理: ${outTradeNo}`)
    return
  }

  // 验证金额
  if (paidAmount !== transaction.amount) {
    throw new OrderError(
      ErrorCode.VALIDATION_ERROR,
      'PAYMENT_AMOUNT_MISMATCH',
      `保证金金额不一致: 期望 ${transaction.amount} 分, 实际 ${paidAmount} 分`
    )
  }

  // 预先读取保证金档位配置（在事务外，避免事务内做慢查询）
  const depositConfig = await prisma.platformConfig.findUnique({ where: { config_key: 'deposit_rules' } })

  // 更新保证金记录和陪玩师信息
  await prisma.$transaction(async (tx) => {
    // 更新交易记录
    await tx.depositTransaction.update({
      where: { id: transaction.id },
      data: { transaction_id: transactionId },
    })

    // 原子累加保证金余额（避免并发丢金额），并读回最新值
    const updated = await tx.companion.update({
      where: { id: transaction.companion_id },
      data:  { deposited_amount: { increment: paidAmount } },
      select: { deposited_amount: true },
    })

    // 根据最新余额和后台配置计算档位
    const depositLevel = calculateDepositLevelFromConfig(updated.deposited_amount, depositConfig)

    await tx.companion.update({
      where: { id: transaction.companion_id },
      data:  { deposit_level: depositLevel },
    })
  })

  app.log.info(`保证金缴纳完成: ${outTradeNo}, 陪玩师: ${transaction.companion_id}, 金额: ${paidAmount}分`)
}

/**
 * 根据保证金金额和后台配置计算等级
 * 配置从 platform_configs.deposit_rules 读取，不写死
 * 格式：{ levels: [{ level, amount, max_orders }] }
 */
function calculateDepositLevelFromConfig(
  amount: number,
  config: { config_value: unknown } | null
): 'none' | 'basic' | 'premium' {
  try {
    const levels = (config?.config_value as any)?.levels
    if (Array.isArray(levels)) {
      // 从高到低匹配，找到满足条件的最高档
      const sorted = [...levels].sort((a, b) => b.amount - a.amount)
      for (const lvl of sorted) {
        if (amount >= lvl.amount && lvl.level !== 'none') {
          return lvl.level as 'none' | 'basic' | 'premium'
        }
      }
    }
  } catch {
    // 配置读取失败，使用兜底逻辑
  }
  // 兜底：与 seed.ts 默认值保持一致
  if (amount >= 50000) return 'premium'  // 500元
  if (amount >= 20000) return 'basic'    // 200元
  return 'none'
}
