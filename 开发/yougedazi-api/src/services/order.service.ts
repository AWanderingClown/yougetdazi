import { prisma } from '../lib/prisma'
import { redis, RedisKey } from '../lib/redis'
import { orderTimeoutQueue } from '../lib/bullmq'
import dayjs from 'dayjs'
import {
  OrderStatus,
  ORDER_STATUS_TRANSITIONS,
  OperatorType,
  ErrorCode,
} from '../types/index'
import type { PushEvent } from './push-bridge.service'
import { paymentService } from './payment.service'

export type { PushEvent }

// ============================================================
// 自定义错误类
// ============================================================

export class OrderError extends Error {
  constructor(
    public readonly code: number,
    public readonly errorKey: string,
    message: string
  ) {
    super(message)
    this.name = 'OrderError'
  }
}

// ============================================================
// 状态机验证工具
// ============================================================

function assertValidTransition(
  current: OrderStatus,
  target: OrderStatus,
  context: string
): void {
  const allowed = ORDER_STATUS_TRANSITIONS[current]
  if (!allowed.includes(target)) {
    throw new OrderError(
      ErrorCode.ORDER_STATUS_INVALID,
      'ORDER_STATUS_INVALID',
      `${context}: 订单状态 ${current} 不能流转到 ${target}，允许流转：${allowed.join(', ') || '无（终态）'}`
    )
  }
}

// ============================================================
// 写操作日志（所有状态变更必须调用，不可省略）
// ============================================================

// 原子锁：将 companion.is_working 从 false 翻转为 true，count=0 说明已有进行中订单
// 必须在 prisma.$transaction 回调内调用，利用事务隔离保证原子性
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function acquireCompanionLock(tx: TxClient, companionId: string): Promise<void> {
  const lock = await tx.companion.updateMany({
    where: { id: companionId, is_working: false },
    data:  { is_working: true },
  })
  if (lock.count === 0) {
    throw new OrderError(ErrorCode.COMPANION_WORKING, 'COMPANION_WORKING', '当前有进行中的订单，服务完成后才能接新单')
  }
}

async function writeOperationLog(params: {
  orderId:      string
  operatorType: OperatorType
  operatorId?:  string
  action:       string
  fromStatus?:  OrderStatus
  toStatus?:    OrderStatus
  note?:        string
  metadata?:    Record<string, unknown>
}) {
  await prisma.orderOperationLog.create({
    data: {
      order_id:      params.orderId,
      operator_type: params.operatorType,
      operator_id:   params.operatorId ?? null,
      action:        params.action,
      from_status:   params.fromStatus ?? null,
      to_status:     params.toStatus ?? null,
      note:          params.note ?? null,
      metadata:      params.metadata ?? null,
    },
  })
}

// ============================================================
// 订单号生成（YGZ + 日期 + 8位随机十六进制，无 Redis 依赖）
// 数据库 order_no 字段有 @unique 约束，极低碰撞概率（16^8 ≈ 42亿/天）
// ============================================================

function generateOrderNo(): string {
  const dateStr = dayjs().format('YYYYMMDD')
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  return `YGZ${dateStr}${random}`
}

// ============================================================
// OrderService
// ============================================================

export class OrderService {
  /**
   * 创建订单
   * 1. 查询服务快照（锁定当时价格）
   * 2. 计算总金额（服务端，不信任前端）
   * 3. 创建订单（status: pending_payment）
   * 4. 创建 PaymentRecord（out_trade_no = ORDER_${uuid}）
   * 5. 写操作日志
   * 6. 创建支付超时 BullMQ Job（delay: 15min）
   * 7. 推送通知（指定单 → 通知陪玩师，悬赏单 → 广播）
   * 返回订单 + PaymentRecord（供前端发起微信支付）
   */
  async createOrder(
    userId: string,
    data: {
      companion_id?:  string
      service_id:     string
      order_type:     'direct' | 'reward'
      duration:       number
      user_remark?:   string
    }
  ) {
    // 1. 查询服务快照
    const service = await prisma.companionService.findUnique({
      where: { id: data.service_id },
      include: { companion: { select: { id: true, audit_status: true, is_online: true } } },
    })

    if (!service || !service.is_active) {
      throw new OrderError(ErrorCode.NOT_FOUND, 'SERVICE_NOT_FOUND', '服务项目不存在或已下架')
    }
    if (service.companion.audit_status !== 'approved') {
      throw new OrderError(ErrorCode.COMPANION_NOT_AUDITED, 'COMPANION_NOT_AUDITED', '陪玩师尚未通过审核')
    }
    if (data.order_type === 'direct' && !service.companion.is_online) {
      throw new OrderError(ErrorCode.COMPANION_OFFLINE, 'COMPANION_OFFLINE', '该陪玩师当前不在线')
    }

    // 2. 服务端计算金额（分）
    const totalAmount = service.hourly_price * data.duration

    // 3. 生成订单
    const orderNo = generateOrderNo()
    const outTradeNo = `ORDER_${crypto.randomUUID().replace(/-/g, '')}`

    const paymentDeadline = new Date(Date.now() + 15 * 60 * 1000) // 15min

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          order_no:          orderNo,
          user_id:           userId,
          companion_id:      data.order_type === 'direct' ? service.companion_id : null,
          service_id:        data.service_id,
          order_type:        data.order_type,
          status:            'pending_payment',
          service_name:      service.service_name,
          hourly_price:      service.hourly_price,
          duration:          data.duration,
          total_amount:      totalAmount,
          user_remark:       data.user_remark ?? null,
          payment_deadline:  paymentDeadline,
        },
      })

      await tx.paymentRecord.create({
        data: {
          order_id:     newOrder.id,
          out_trade_no: outTradeNo,
          amount:       totalAmount,
          status:       'pending',
        },
      })

      await tx.orderOperationLog.create({
        data: {
          order_id:      newOrder.id,
          operator_type: 'user',
          operator_id:   userId,
          action:        'create_order',
          from_status:   null,
          to_status:     newOrder.status,
          note:          `创建订单，类型：${data.order_type}，时长：${data.duration}h，金额：${totalAmount}分`,
        },
      })

      return newOrder
    })

    // 4. 创建支付超时 Job（15分钟）
    await orderTimeoutQueue.add(
      'payment_timeout',
      { orderId: order.id, orderNo },
      {
        delay:   15 * 60 * 1000,  // 15分钟支付超时
        jobId:   `payment_timeout_${order.id}`,
      }
    )

    return { order, out_trade_no: outTradeNo, total_amount: totalAmount }
  }

  /**
   * 支付成功后处理（由 Webhook 调用）
   * 1. 更新 PaymentRecord.status = 'paid'
   * 2. 更新订单状态：pending_payment → pending_accept（指定单）或 waiting_grab（悬赏单）
   * 3. 取消 payment_timeout Job（支付成功，不应再超时取消）
   * 4. 创建 accept_timeout Job（15min）
   * 5. 推送通知
   */
  async handlePaymentSuccess(
    outTradeNo:    string,
    paidAmount:    number,
    wxTransactionId: string
  ) {
    // 幂等检查
    const record = await prisma.paymentRecord.findUnique({
      where:   { out_trade_no: outTradeNo },
      include: { order: true },
    })
    if (!record) {
      throw new OrderError(ErrorCode.NOT_FOUND, 'PAYMENT_NOT_FOUND', '支付记录不存在')
    }
    if (record.status === 'paid') {
      return // 已处理，幂等返回
    }

    // 金额验证（防止伪造回调少付）
    if (paidAmount !== record.amount) {
      throw new OrderError(
        ErrorCode.VALIDATION_ERROR,
        'PAYMENT_AMOUNT_MISMATCH',
        `支付金额不一致：期望 ${record.amount} 分，实际 ${paidAmount} 分`
      )
    }

    const order = record.order
    const newStatus = order.order_type === 'reward' ? 'waiting_grab' : 'pending_accept'
    const acceptDeadline = new Date(Date.now() + 15 * 60 * 1000)

    await prisma.$transaction(async (tx) => {
      await tx.paymentRecord.update({
        where: { out_trade_no: outTradeNo },
        data: {
          status:         'paid',
          pay_time:       new Date(),
          transaction_id: wxTransactionId,
          amount:         paidAmount,
        },
      })

      await tx.order.update({
        where: { id: order.id },
        data: {
          status:           newStatus,
          paid_amount:      paidAmount,
          accept_deadline:  acceptDeadline,
        },
      })

      await tx.orderOperationLog.create({
        data: {
          order_id:      order.id,
          operator_type: 'system',
          action:        'payment_success',
          from_status:   'pending_payment',
          to_status:     newStatus,
          note:          `支付成功，微信流水号：${wxTransactionId}，金额：${paidAmount}分`,
        },
      })
    })

    // 取消支付超时 Job
    const paymentJob = await orderTimeoutQueue.getJob(`payment_timeout_${order.id}`)
    if (paymentJob) await paymentJob.remove()

    // 创建接单超时 Job（15min）
    await orderTimeoutQueue.add(
      'accept_timeout',
      { orderId: order.id, orderNo: order.order_no },
      {
        delay: 15 * 60 * 1000,
        jobId: `accept_timeout_${order.id}`,
      }
    )

    // 收集推送事件（由管理后台统一推送）
    const pushEvents: PushEvent[] = []

    if (order.order_type === 'direct' && order.companion_id) {
      // 指定单：通知对应陪玩师
      pushEvents.push({
        type: 'new_order',
        targetType: 'companion',
        targetId: order.companion_id,
        payload: {
          orderId:     order.id,
          orderNo:     order.order_no,
          serviceName: order.service_name,
          duration:    order.duration,
          totalAmount: order.total_amount,
        }
      })
    } else {
      // 悬赏单：广播给所有在线陪玩师
      pushEvents.push({
        type: 'new_reward_order',
        targetType: 'broadcast',
        targetId: 'companions_online',
        payload: {
          orderId:        order.id,
          orderNo:        order.order_no,
          serviceName:    order.service_name,
          duration:       order.duration,
          totalAmount:    order.total_amount,
          acceptDeadline: acceptDeadline.toISOString(),
        }
      })
    }

    // C端用户支付成功通知
    pushEvents.push({
      type: 'order_status_changed',
      targetType: 'user',
      targetId: order.user_id,
      payload: {
        orderId:    order.id,
        orderNo:    order.order_no,
        fromStatus: 'pending_payment',
        toStatus:   newStatus,
        message:    '支付成功，等待陪玩师接单',
      }
    })

    return { order, pushEvents }
  }

  /**
   * 接单（指定单）
   * 状态机：pending_accept → accepted
   * 验证：order.companion_id === companionId
   */
  async acceptOrder(orderId: string, companionId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) {
      throw new OrderError(ErrorCode.ORDER_NOT_FOUND, 'ORDER_NOT_FOUND', '订单不存在')
    }
    if (order.companion_id !== companionId) {
      throw new OrderError(ErrorCode.FORBIDDEN, 'FORBIDDEN', '无权操作此订单')
    }

    assertValidTransition(order.status as OrderStatus, 'accepted', 'acceptOrder')

    const updated = await prisma.$transaction(async (tx) => {
      await acquireCompanionLock(tx, companionId)

      const result = await tx.order.update({
        where: { id: orderId },
        data:  { status: 'accepted' },
      })
      await tx.orderOperationLog.create({
        data: {
          order_id:      orderId,
          operator_type: 'companion',
          operator_id:   companionId,
          action:        'accept_order',
          from_status:   order.status,
          to_status:     'accepted',
        },
      })
      return result
    })

    // 取消待接单超时 Job
    const job = await orderTimeoutQueue.getJob(`accept_timeout_${orderId}`)
    if (job) await job.remove()

    // 收集推送事件
    const pushEvents: PushEvent[] = []

    // 通知 C端用户陪玩师已接单
    pushEvents.push({
      type: 'order_status_changed',
      targetType: 'user',
      targetId: order.user_id,
      payload: {
        orderId:    order.id,
        orderNo:    order.order_no,
        fromStatus: 'pending_accept',
        toStatus:   'accepted',
        message:    '陪玩师已接单，等待出发',
      }
    })

    return { ...updated, pushEvents }
  }

  /**
   * 抢单（悬赏单）
   * 状态机：waiting_grab → accepted
   * 乐观锁：通过 Prisma updateMany + where status=waiting_grab 实现
   */
  async grabOrder(orderId: string, companionId: string) {
    // 乐观锁 + 操作日志同在一个事务：要么全部成功，要么全部回滚
    const order = await prisma.$transaction(async (tx) => {
      await acquireCompanionLock(tx, companionId)

      const result = await tx.order.updateMany({
        where: {
          id:     orderId,
          status: 'waiting_grab',
        },
        data: {
          status:       'accepted',
          companion_id: companionId,
        },
      })

      if (result.count === 0) {
        throw new OrderError(ErrorCode.ORDER_ALREADY_ACCEPTED, 'ORDER_ALREADY_ACCEPTED', '订单已被抢，请查看其他订单')
      }

      await tx.orderOperationLog.create({
        data: {
          order_id:      orderId,
          operator_type: 'companion',
          operator_id:   companionId,
          action:        'grab_order',
          from_status:   'waiting_grab',
          to_status:     'accepted',
        },
      })

      return tx.order.findUnique({ where: { id: orderId } })
    })

    // 取消待接单超时 Job（悬赏单抢成功后不应再超时取消）
    const job = await orderTimeoutQueue.getJob(`accept_timeout_${orderId}`)
    if (job) await job.remove()

    // 收集推送事件
    const pushEvents: PushEvent[] = []

    // 通知 C端用户悬赏单被接
    if (order) {
      pushEvents.push({
        type: 'order_status_changed',
        targetType: 'user',
        targetId: order.user_id,
        payload: {
          orderId:    order.id,
          orderNo:    order.order_no,
          fromStatus: 'waiting_grab',
          toStatus:   'accepted',
          message:    '陪玩师已抢单，等待出发',
        }
      })
    }

    return { ...order, pushEvents }
  }

  /**
   * 开始服务
   * 状态机：accepted → serving
   * 关键操作：
   * 1. 写 Redis 倒计时（权威时间源）
   * 2. 创建 BullMQ service_timeout Delayed Job
   * 3. 更新 companion.is_working = true
   * 4. 更新 Redis stats:serving_orders INCR
   * 5. 推送通知
   */
  async startService(orderId: string, companionId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) {
      throw new OrderError(ErrorCode.ORDER_NOT_FOUND, 'ORDER_NOT_FOUND', '订单不存在')
    }
    if (order.companion_id !== companionId) {
      throw new OrderError(ErrorCode.FORBIDDEN, 'FORBIDDEN', '无权操作此订单')
    }

    assertValidTransition(order.status as OrderStatus, 'serving', 'startService')

    const totalSeconds = order.duration * 3600
    const serviceStartAt = new Date()
    const serviceEndAt   = new Date(serviceStartAt.getTime() + totalSeconds * 1000)

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status:           'serving',
          service_start_at: serviceStartAt,
          service_end_at:   serviceEndAt,
        },
      })
      await tx.companion.update({
        where: { id: companionId },
        data:  { is_working: true },
      })
      await tx.orderOperationLog.create({
        data: {
          order_id:      orderId,
          operator_type: 'companion',
          operator_id:   companionId,
          action:        'start_service',
          from_status:   'accepted',
          to_status:     'serving',
          note:          `服务开始，预计时长 ${order.duration}h，结束时间：${serviceEndAt.toISOString()}`,
        },
      })
    })

    await Promise.all([
      redis.setex(RedisKey.orderTimer(orderId), totalSeconds + 60, String(totalSeconds)),
      orderTimeoutQueue.add('service_timeout', { orderId, companionId }, {
        delay: totalSeconds * 1000,
        jobId: `service_timeout_${orderId}`,
      }),
      redis.incr(RedisKey.statsServingOrders()),
    ])

    // 收集推送事件
    const pushEvents: PushEvent[] = []

    // 通知 C端用户服务已开始
    pushEvents.push({
      type: 'order_status_changed',
      targetType: 'user',
      targetId: order.user_id,
      payload: {
        orderId:    order.id,
        orderNo:    order.order_no,
        fromStatus: 'accepted',
        toStatus:   'serving',
        message:    `服务已开始，预计结束时间：${serviceEndAt.toLocaleString('zh-CN')}`,
      }
    })

    return { started_at: serviceStartAt, ends_at: serviceEndAt, remaining_seconds: totalSeconds, pushEvents }
  }

  /**
   * 完成订单
   * 状态机：serving → completed
   * 操作：
   * 1. 清理 Redis 倒计时
   * 2. 取消 BullMQ 超时 Job
   * 3. 更新 companion.is_working = false
   * 4. 实时统计 DECR
   * 5. 触发结算（TODO: PaymentService.settle）
   * 6. 推送通知
   */
  async completeOrder(orderId: string, operatorId: string, operatorType: OperatorType = 'companion', note?: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) {
      throw new OrderError(ErrorCode.ORDER_NOT_FOUND, 'ORDER_NOT_FOUND', '订单不存在')
    }

    // companion 操作时验证归属
    if (operatorType === 'companion' && order.companion_id !== operatorId) {
      throw new OrderError(ErrorCode.FORBIDDEN, 'FORBIDDEN', '无权操作此订单')
    }

    assertValidTransition(order.status as OrderStatus, 'completed', 'completeOrder')

    const completedAt = new Date()

    // 事务前预取结算所需数据（避免在事务内做慢查询）
    let companionIncome = 0
    let userNickname = '匿名用户'
    if (order.companion_id) {
      const [feeConfig, user] = await Promise.all([
        prisma.platformConfig.findUnique({ where: { config_key: 'fee_rate' } }),
        prisma.user.findUnique({ where: { id: order.user_id }, select: { nickname: true } }),
      ])
      const platformFeeRate = (feeConfig?.config_value as { value?: number } | null)?.value ?? 0.2
      companionIncome = Math.floor(order.total_amount * (1 - platformFeeRate))
      userNickname = user?.nickname || '匿名用户'
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status:       'completed',
          completed_at: completedAt,
        },
      })

      if (order.companion_id) {
        await tx.companion.update({
          where: { id: order.companion_id },
          data:  { is_working: false, total_orders: { increment: 1 } },
        })
      }

      await tx.orderOperationLog.create({
        data: {
          order_id:      orderId,
          operator_type: operatorType,
          operator_id:   operatorId,
          action:        operatorType === 'admin' ? 'force_complete' : 'complete_order',
          from_status:   'serving',
          to_status:     'completed',
          note:          operatorType === 'admin' ? (note ?? 'Admin 强制完成订单') : undefined,
        },
      })

      // 结算记录与订单状态变更同在一个事务：要么全部成功，要么全部回滚
      if (order.companion_id && companionIncome > 0) {
        const updated = await tx.companion.update({
          where:  { id: order.companion_id },
          data:   { deposited_amount: { increment: companionIncome } },
          select: { deposited_amount: true },
        })
        await tx.settlement.create({
          data: {
            companion_id:   order.companion_id,
            order_id:       order.id,
            type:           'order_income',
            amount:         companionIncome,
            description:    `订单${order.order_no}收入结算`,
            balance_before: updated.deposited_amount - companionIncome,
            balance_after:  updated.deposited_amount,
            order_no:       order.order_no,
            service_name:   order.service_name,
            customer_name:  userNickname,
            duration:       order.duration,
          },
        })
      }
    })

    await Promise.all([
      redis.del(RedisKey.orderTimer(orderId)),
      orderTimeoutQueue.getJob(`service_timeout_${orderId}`).then(job => job?.remove()),
      redis.decr(RedisKey.statsServingOrders()),
    ])

    // 收集推送事件
    const pushEvents: PushEvent[] = []

    // 通知 C端用户订单完成
    pushEvents.push({
      type: 'order_status_changed',
      targetType: 'user',
      targetId: order.user_id,
      payload: {
        orderId:    order.id,
        orderNo:    order.order_no,
        fromStatus: 'serving',
        toStatus:   'completed',
        message:    '订单已完成',
      }
    })

    // 通知 B端搭子订单完成（系统/Admin 操作时）
    if (operatorType !== 'companion' && order.companion_id) {
      pushEvents.push({
        type: 'companion_order_status_changed',
        targetType: 'companion',
        targetId: order.companion_id,
        payload: {
          orderId:    order.id,
          orderNo:    order.order_no,
          fromStatus: 'serving',
          toStatus:   'completed',
          message:    operatorType === 'admin' ? 'Admin 已强制完成订单' : '服务时长到期，订单自动完成',
        }
      })
    }

    // 24h 自动好评任务（review 表建好后激活）
    await orderTimeoutQueue.add(
      'auto_review',
      { orderId, userId: order.user_id, companionId: order.companion_id },
      {
        delay:  24 * 60 * 60 * 1000,  // 24h
        jobId:  `auto_review_${orderId}`,
      }
    )

    return { pushEvents }
  }

  /**
   * 取消订单
   * 支持所有非终态 → cancelled
   * 退款金额在服务端计算，规则：
   * - pending_payment: 无需退款（未支付）
   * - pending_accept / waiting_grab: 全额退款（用户取消，或超时）
   * - accepted: 全额退款
   * - serving: 按剩余比例退款（TODO: 具体规则从 platform_configs 读）
   * - admin 强制取消：按传入 refund_percent 退款
   */
  async cancelOrder(
    orderId: string,
    cancelBy: OperatorType,
    operatorId: string,
    reason: string,
    refundPercent?: number
  ) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payment_records: true }, // 查询所有支付记录，不只是已支付的
    })

    if (!order) {
      throw new OrderError(ErrorCode.ORDER_NOT_FOUND, 'ORDER_NOT_FOUND', '订单不存在')
    }

    assertValidTransition(order.status as OrderStatus, 'cancelled', 'cancelOrder')

    // 计算退款金额（服务端权威）
    // 只计算已支付(paid)状态的支付记录金额
    const paidAmount = order.payment_records
      .filter(r => r.status === 'paid')
      .reduce((sum, r) => sum + r.amount, 0)
    let refundAmount = 0

    if (cancelBy === 'admin' && refundPercent !== undefined) {
      refundAmount = Math.floor(paidAmount * refundPercent / 100)
    } else {
      if (order.status === 'pending_payment') {
        refundAmount = 0
      } else if (['pending_accept', 'waiting_grab', 'accepted'].includes(order.status)) {
        refundAmount = paidAmount
      } else if (order.status === 'serving') {
        // 服务中取消：≤15分钟扣50元违约金，>15分钟不可取消（canCancelOrder已拦截）
        const serviceStartAt = order.service_start_at
        if (serviceStartAt) {
          const serviceDuration = Date.now() - serviceStartAt.getTime()
          const FIFTEEN_MINUTES = 15 * 60 * 1000
          const CANCEL_FEE = 5000  // 50元 = 5000分

          if (serviceDuration <= FIFTEEN_MINUTES) {
            refundAmount = Math.max(0, paidAmount - CANCEL_FEE)
          } else {
            // 超过15分钟理论上不会走到这里（canCancelOrder会拦截）
            refundAmount = 0
          }
        } else {
          // 异常情况：没有服务开始时间，全额退款
          refundAmount = paidAmount
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status:        'cancelled',
          cancelled_at:  new Date(),
          cancel_reason: reason,
          cancel_by:     cancelBy,
          refund_amount: refundAmount,
        },
      })

      await tx.orderOperationLog.create({
        data: {
          order_id:      orderId,
          operator_type: cancelBy,
          operator_id:   operatorId,
          action:        'cancel_order',
          from_status:   order.status as OrderStatus,
          to_status:     'cancelled',
          note:          reason,
          metadata:      { refund_amount: refundAmount, paid_amount: paidAmount },
        },
      })

      if (['accepted', 'serving'].includes(order.status) && order.companion_id) {
        await tx.companion.update({
          where: { id: order.companion_id },
          data:  { is_working: false },
        })
      }
    })

    await Promise.all([
      redis.del(RedisKey.orderTimer(orderId)),
      orderTimeoutQueue.getJob(`payment_timeout_${orderId}`).then((j: { remove(): Promise<void> } | undefined) => j?.remove()),
      orderTimeoutQueue.getJob(`accept_timeout_${orderId}`).then((j: { remove(): Promise<void> } | undefined) => j?.remove()),
      orderTimeoutQueue.getJob(`service_timeout_${orderId}`).then((j: { remove(): Promise<void> } | undefined) => j?.remove()),
    ])

    if (order.status === 'serving') {
      await redis.decr(RedisKey.statsServingOrders())
    }

    // 收集推送事件
    const pushEvents: PushEvent[] = []

    // 通知 C端用户
    pushEvents.push({
      type: 'order_status_changed',
      targetType: 'user',
      targetId: order.user_id,
      payload: {
        orderId:    order.id,
        orderNo:    order.order_no,
        fromStatus: order.status,
        toStatus:   'cancelled',
        message:    refundAmount > 0
          ? `订单已取消，将退款 ${(refundAmount / 100).toFixed(2)} 元`
          : '订单已取消',
      }
    })

    // 通知 B端陪玩师（已接单以后取消才需要通知）
    if (['accepted', 'serving'].includes(order.status) && order.companion_id) {
      pushEvents.push({
        type: 'companion_order_status_changed',
        targetType: 'companion',
        targetId: order.companion_id,
        payload: {
          orderId:    order.id,
          orderNo:    order.order_no,
          fromStatus: order.status,
          toStatus:   'cancelled',
          message:    cancelBy === 'admin' ? 'Admin 已强制取消订单' : '订单已取消',
        }
      })
    }

    // 有退款金额时触发微信退款
    // 订单可能有多笔支付记录（初次支付 + 续费），需按比例分摊退款，
    // 否则单笔退款金额可能超过该笔支付原始金额导致微信拒单
    if (refundAmount > 0 && paidAmount > 0) {
      const paidRecords = order.payment_records.filter(r => r.status === 'paid')
      let distributed = 0
      for (let i = 0; i < paidRecords.length; i++) {
        const rec    = paidRecords[i]
        const isLast = i === paidRecords.length - 1
        // 最后一笔用差值补齐，避免分摊取整累计误差
        const share  = isLast
          ? refundAmount - distributed
          : Math.floor(rec.amount / paidAmount * refundAmount)
        distributed += share
        if (share <= 0) continue
        void paymentService.refund({
          paymentId:      rec.id,
          outTradeNo:     rec.out_trade_no,
          originalAmount: rec.amount,
          refundAmount:   share,
          reason:         reason,
        }).catch(err => {
          console.error(`[OrderService] 退款失败，订单 ${orderId} / 支付记录 ${rec.id}:`, err)
        })
      }
    }

    return { refund_amount: refundAmount, pushEvents }
  }

  /**
   * Admin 强制取消
   */
  async adminForceCancel(
    orderId: string,
    adminId: string,
    reason: string,
    refundPercent: number
  ) {
    return this.cancelOrder(orderId, 'admin', adminId, reason, refundPercent)
  }

  /**
   * Admin 强制完成
   */
  async adminForceComplete(orderId: string, adminId: string, reason: string) {
    return this.completeOrder(orderId, adminId, 'admin', reason)
  }

  /**
   * 获取订单剩余时间（从 Redis 读，权威时间源）
   * 前端只做展示，不做判断
   */
  async getOrderTimer(orderId: string): Promise<{ remaining_seconds: number | null }> {
    const ttl = await redis.ttl(RedisKey.orderTimer(orderId))
    return { remaining_seconds: ttl > 0 ? ttl : null }
  }

}

export const orderService = new OrderService()

/**
 * 续费金额计算（业务规则：时长取 0.5 精度，金额向下取整到分）
 */
export function calculateRenewal(hourlyPrice: number, addedHours: number): {
  normalizedHours: number
  amount: number
} {
  const normalizedHours = Math.round(addedHours * 2) / 2
  const amount = Math.round(hourlyPrice * normalizedHours)
  return { normalizedHours, amount }
}
