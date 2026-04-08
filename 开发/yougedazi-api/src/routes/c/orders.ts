import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireUser } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { orderService, calculateRenewal } from '../../services/order.service'
import { paymentService } from '../../services/payment.service'
import { pushBridgeService, PushEvent } from '../../services/push-bridge.service'
import { prisma } from '../../lib/prisma'
import { PUSH_EVENTS, CANCEL_FEE, CANCEL_FREE_PERIOD_MS, CANCEL_15MIN_MS } from '../../constants/order.js'
import { dispatchPushEvents } from '../../utils/push-helper.js'

const PAYMENT_NOTIFY_URL = `${process.env.API_BASE_URL || ''}/webhook/wx-pay`


// ============================================================
// Zod 输入验证 Schema
// ============================================================

const CreateOrderSchema = z.object({
  companion_id:  z.string().uuid().optional(),     // 指定单填，悬赏单不填
  service_id:    z.string().uuid(),
  order_type:    z.enum(['direct', 'reward']),
  duration:      z.number().int().min(1).max(24),  // 购买时长（小时）
  user_remark:   z.string().max(200).optional(),
})

const OrderListQuerySchema = z.object({
  status:    z.enum(['pending_payment', 'pending_accept', 'waiting_grab', 'accepted', 'serving', 'completed', 'cancelled']).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(10),
})

const RenewOrderSchema = z.object({
  added_hours: z.number().min(0.5).max(4),  // 续费时长：0.5-4小时（30-240分钟）
})

const ReviewOrderSchema = z.object({
  rating:  z.number().int().min(1).max(5),
  content: z.string().max(500).optional(),
  tags:    z.array(z.string().max(20)).max(5).optional(),
})

// ============================================================
// C端订单路由
// ============================================================

export async function cOrderRoutes(app: FastifyInstance) {
  /**
   * POST /api/c/orders
   * 创建订单
   * 流程：验价 → 创建 pending_payment 订单 → 调微信预支付 → 返回 prepay 参数
   */
  app.post('/api/c/orders', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const parseResult = CreateOrderSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }
    const userId = request.currentUser!.id
    try {
      const [result, user] = await Promise.all([
        orderService.createOrder(userId, parseResult.data),
        prisma.user.findUnique({ where: { id: userId }, select: { openid: true } }),
      ])

      if (!user?.openid) {
        return reply.status(400).send({
          code:     ErrorCode.VALIDATION_ERROR,
          message:  '用户未绑定微信',
          errorKey: 'USER_NOT_BOUND',
        })
      }
      const paymentParams = await paymentService.createWxPayOrder({
        outTradeNo:  result.out_trade_no,
        description: result.order.service_name,
        amount:      result.total_amount,
        openid:      user.openid,
        notifyUrl:   PAYMENT_NOTIFY_URL,
      })

      return reply.status(201).send({
        code:    ErrorCode.SUCCESS,
        message: '订单创建成功',
        data:    {
          order:          result.order,
          total_amount:   result.total_amount,
          payment_params: paymentParams,
        },
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        const statusMap: Record<number, number> = {
          [ErrorCode.NOT_FOUND]:             404,
          [ErrorCode.COMPANION_NOT_AUDITED]: 403,
          [ErrorCode.COMPANION_OFFLINE]:     409,
        }
        const httpStatus = statusMap[error.code ?? 0] ?? 400
        return reply.status(httpStatus).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      app.log.error(err, '创建订单失败')
      return reply.status(500).send({
        code:     ErrorCode.INTERNAL_ERROR,
        message:  '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * GET /api/c/orders
   * C端订单列表（分页，按状态过滤）
   */
  app.get('/api/c/orders', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const parseResult = OrderListQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }
    const { status, page, page_size } = parseResult.data
    const userId = request.currentUser!.id
    const skip = (page - 1) * page_size

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: {
          user_id: userId,
          ...(status ? { status } : {}),
        },
        select: {
          id:           true,
          order_no:     true,
          status:       true,
          service_name: true,
          duration:     true,
          total_amount: true,
          created_at:   true,
          companion: {
            select: { id: true, nickname: true, avatar: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: page_size,
      }),
      prisma.order.count({
        where: {
          user_id: userId,
          ...(status ? { status } : {}),
        },
      }),
    ])

    const FIFTEEN_MIN_MS = 15 * 60 * 1000

    const ordersWithTimeStatus = orders.map(order => {
      const timeStatus = {
        exceeded_15_minutes: false
      }
      if (order.status === 'pending_payment') {
        const elapsed = Date.now() - new Date(order.created_at).getTime()
        timeStatus.exceeded_15_minutes = elapsed > FIFTEEN_MIN_MS
      }
      return {
        ...order,
        time_status: timeStatus
      }
    })

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        list:      ordersWithTimeStatus,
        total,
        page,
        page_size,
        has_more:  skip + orders.length < total,
      },
    })
  })

  /**
   * GET /api/c/orders/:id
   * C端订单详情
   */
  app.get<{ Params: { id: string } }>('/api/c/orders/:id', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const { id } = request.params
    const userId = request.currentUser!.id

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        companion:      { select: { id: true, nickname: true, avatar: true } },
        operation_logs: { orderBy: { created_at: 'asc' } },
        payment_records: {
          select: { out_trade_no: true, amount: true, status: true, pay_time: true },
          where:  { status: 'paid' },
        },
        renewals: {
          select: { added_hours: true, added_amount: true, status: true, created_at: true },
          orderBy: { created_at: 'asc' },
        },
        review: true,
      },
    })

    if (!order) {
      return reply.status(404).send({
        code:     ErrorCode.ORDER_NOT_FOUND,
        message:  '订单不存在',
        errorKey: 'ORDER_NOT_FOUND',
      })
    }

    // 防越权：只能看自己的订单
    if (order.user_id !== userId) {
      return reply.status(403).send({
        code:     ErrorCode.FORBIDDEN,
        message:  '无权查看此订单',
        errorKey: 'FORBIDDEN',
      })
    }

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    order,
    })
  })

  /**
   * POST /api/c/orders/:id/cancel
   * C端取消订单
   * 规则：
   * - pending_payment → cancelled：无需退款
   * - pending_accept → cancelled：全额退款
   * - 其他状态：禁止（返回 ORDER_CANCEL_FORBIDDEN）
   * 退款金额必须在服务端计算，不接受前端传值
   */
  app.post<{ Params: { id: string } }>('/api/c/orders/:id/cancel', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const { id } = request.params
    const userId = request.currentUser!.id

    // 先验证订单归属（防越权），再交给 Service 处理
    const order = await prisma.order.findUnique({ where: { id }, select: { user_id: true } })
    if (!order) {
      return reply.status(404).send({
        code:     ErrorCode.ORDER_NOT_FOUND,
        message:  '订单不存在',
        errorKey: 'ORDER_NOT_FOUND',
      })
    }
    if (order.user_id !== userId) {
      return reply.status(403).send({
        code:     ErrorCode.FORBIDDEN,
        message:  '无权操作此订单',
        errorKey: 'FORBIDDEN',
      })
    }

    try {
      const result = await orderService.cancelOrder(id, 'user', userId, '用户主动取消')
      await dispatchPushEvents(result)

      return reply.status(200).send({
        code:    ErrorCode.SUCCESS,
        message: '订单已取消',
        data:    result.order,
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        return reply.status(400).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      app.log.error(err, '取消订单失败')
      return reply.status(500).send({
        code:     ErrorCode.INTERNAL_ERROR,
        message:  '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * GET /api/c/orders/:id/timer
   * 获取订单服务剩余时间（从 Redis 读，权威时间源）
   * 返回：remaining_seconds
   */
  app.get<{ Params: { id: string } }>('/api/c/orders/:id/timer', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const { id } = request.params
    const userId = request.currentUser!.id

    // 验证订单归属（防越权）
    const order = await prisma.order.findUnique({ where: { id }, select: { user_id: true, status: true } })
    if (!order || order.user_id !== userId) {
      return reply.status(404).send({
        code:     ErrorCode.ORDER_NOT_FOUND,
        message:  '订单不存在',
        errorKey: 'ORDER_NOT_FOUND',
      })
    }

    const result = await orderService.getOrderTimer(id)
    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    result,
    })
  })

  /**
   * POST /api/c/orders/:id/renew
   * C端续费（延长服务时长）
   * 
   * 流程：
   * 1. 验证原订单状态为 serving
   * 2. 验证续费时长在 0.5-4 小时之间
   * 3. 计算金额（基于订单快照时薪 × 续费时长）
   * 4. 创建续费记录
   * 5. 调用微信支付获取 prepay 参数
   * 6. 返回支付参数
   * 
   * 支付成功后：Webhook 会延长 Redis 倒计时 + 更新 order.service_end_at
   */
  app.post<{ Params: { id: string } }>('/api/c/orders/:id/renew', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const { id } = request.params
    const userId = request.currentUser!.id

    // Step 1: 参数验证
    const parseResult = RenewOrderSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { added_hours } = parseResult.data

    try {
      // Step 2: 验证订单归属和状态
      const order = await prisma.order.findUnique({
        where: { id },
        select: {
          id: true,
          user_id: true,
          status: true,
          hourly_price: true,
          service_end_at: true,
        },
      })

      if (!order) {
        return reply.status(404).send({
          code: ErrorCode.ORDER_NOT_FOUND,
          message: '订单不存在',
          errorKey: 'ORDER_NOT_FOUND',
        })
      }

      // 防越权
      if (order.user_id !== userId) {
        return reply.status(403).send({
          code: ErrorCode.FORBIDDEN,
          message: '无权操作此订单',
          errorKey: 'FORBIDDEN',
        })
      }

      // 验证订单状态必须为 serving
      if (order.status !== 'serving') {
        return reply.status(400).send({
          code: ErrorCode.ORDER_STATUS_INVALID,
          message: '只有服务中的订单可以续费',
          errorKey: 'ORDER_NOT_SERVING',
        })
      }

      // Step 3: 计算续费金额（服务端权威计算，业务规则封装在 calculateRenewal）
      const { normalizedHours, amount: addedAmount } = calculateRenewal(order.hourly_price, added_hours)

      // Step 4: 创建续费记录
      const outTradeNo = `RENEW_${crypto.randomUUID().replace(/-/g, '')}`

      const renewal = await prisma.orderRenewal.create({
        data: {
          order_id: id,
          added_hours: normalizedHours,
          added_amount: addedAmount,
          out_trade_no: outTradeNo,
          status: 'pending',
        },
      })

      // Step 5: 获取用户 OpenID
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { openid: true },
      })

      if (!user?.openid) {
        return reply.status(400).send({
          code: ErrorCode.VALIDATION_ERROR,
          message: '用户未绑定微信',
          errorKey: 'USER_NOT_BOUND',
        })
      }

      // Step 6: 调用微信支付创建预支付订单
      const paymentParams = await paymentService.createWxPayOrder({
        outTradeNo,
        description: `订单续费 ${added_hours}小时`,
        amount: addedAmount,
        openid: user.openid,
        notifyUrl: PAYMENT_NOTIFY_URL,
      })

      app.log.info(`续费订单创建: ${outTradeNo}, 订单: ${id}, 金额: ${addedAmount}分, 时长: ${added_hours}h`)

      // Step 7: 返回支付参数
      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: '续费订单创建成功',
        data: {
          renewal_id: renewal.id,
          added_hours: added_hours,
          amount: addedAmount,
          payment_params: paymentParams,
        },
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        return reply.status(400).send({
          code: error.code,
          message: error.message,
          errorKey: error.errorKey,
        })
      }
      app.log.error(err, '创建续费订单失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * POST /api/c/orders/:id/review
   * C端提交订单评价
   * 规则：
   * - 订单状态必须为 completed
   * - 每个订单只能评价一次
   * - 评价后自动更新陪玩师平均评分
   */
  app.post<{ Params: { id: string } }>('/api/c/orders/:id/review', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const { id } = request.params
    const userId = request.currentUser!.id

    // Step 1: 验证请求体
    const parseResult = ReviewOrderSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { rating, content } = parseResult.data

    try {
      // Step 2: 验证订单存在且属于当前用户
      const order = await prisma.order.findUnique({
        where: { id },
        select: { id: true, user_id: true, companion_id: true, status: true },
      })

      if (!order) {
        return reply.status(404).send({
          code:     ErrorCode.ORDER_NOT_FOUND,
          message:  '订单不存在',
          errorKey: 'ORDER_NOT_FOUND',
        })
      }

      if (order.user_id !== userId) {
        return reply.status(403).send({
          code:     ErrorCode.FORBIDDEN,
          message:  '无权操作此订单',
          errorKey: 'FORBIDDEN',
        })
      }

      // Step 3: 验证订单状态为 completed
      if (order.status !== 'completed') {
        return reply.status(400).send({
          code:     ErrorCode.ORDER_STATUS_INVALID,
          message:  '只有已完成的订单可以评价',
          errorKey: 'ORDER_NOT_COMPLETED',
        })
      }

      // Step 4: 检查是否已评价
      const existing = await prisma.review.findUnique({
        where: { order_id: id },
      })
      if (existing) {
        return reply.status(400).send({
          code:     ErrorCode.VALIDATION_ERROR,
          message:  '已评价过此订单',
          errorKey: 'REVIEW_ALREADY_EXISTS',
        })
      }

      // Step 5: 创建评价记录
      await prisma.review.create({
        data: {
          order_id:     id,
          user_id:      userId,
          companion_id: order.companion_id!,
          rating,
          content:      content ?? null,
        },
      })

      // Step 6: 更新陪玩师平均评分
      const agg = await prisma.review.aggregate({
        where: { companion_id: order.companion_id! },
        _avg:  { rating: true },
      })
      const avgRating = agg._avg.rating ?? 5.0

      await prisma.companion.update({
        where: { id: order.companion_id! },
        data:  { rating: avgRating },
      })

      // Step 7: 获取刚创建的评价记录
      const review = await prisma.review.findUnique({
        where: { order_id: id },
      })

      app.log.info(`订单评价创建: 订单 ${id}, 用户 ${userId}, 评分 ${rating}`)

      return reply.status(201).send({
        code:    ErrorCode.SUCCESS,
        message: '评价成功',
        data:    { review },
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        return reply.status(400).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      app.log.error(err, '提交评价失败')
      return reply.status(500).send({
        code:     ErrorCode.INTERNAL_ERROR,
        message:  '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * GET /api/c/orders/:id/cancel-preview
   * 取消订单预览 - 查询能否取消及退款金额
   * 退款金额由服务端计算，前端只负责展示
   */
  app.get<{ Params: { id: string } }>('/api/c/orders/:id/cancel-preview', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const { id } = request.params
    const userId = request.currentUser!.id

    try {
      // Step 1: 验证订单存在且属于当前用户
      const order = await prisma.order.findUnique({
        where: { id },
        select: {
          id: true,
          user_id: true,
          status: true,
          total_amount: true,
          paid_amount: true,
          service_start_at: true,
          payment_records: {
            where: { status: 'paid' },
            select: { amount: true },
          },
        },
      })

      if (!order) {
        return reply.status(404).send({
          code:     ErrorCode.ORDER_NOT_FOUND,
          message:  '订单不存在',
          errorKey: 'ORDER_NOT_FOUND',
        })
      }

      // 防越权
      if (order.user_id !== userId) {
        return reply.status(403).send({
          code:     ErrorCode.FORBIDDEN,
          message:  '无权操作此订单',
          errorKey: 'FORBIDDEN',
        })
      }

      // Step 2: 检查能否取消
      let canCancel = false
      let refundAmount = 0
      let cancelReason = ''

      switch (order.status) {
        case 'pending_payment':
          canCancel = true
          refundAmount = 0
          cancelReason = '订单未支付，取消后无退款'
          break

        case 'pending_accept':
        case 'waiting_grab':
          canCancel = true
          // 计算实际已支付金额
          refundAmount = order.payment_records.reduce((sum, r) => sum + r.amount, 0)
          cancelReason = '搭子未接单，取消后将全额退款'
          break

        case 'accepted': {
          // 已接单：2分钟内全额退款，超过2分钟扣除50元
          const paidAmount = order.payment_records.reduce((sum, r) => sum + r.amount, 0)
          
          // 查询接单时间（从操作日志中获取）
          const acceptLog = await prisma.orderOperationLog.findFirst({
            where: {
              order_id: id,
              action: { in: ['accept_order', 'grab_order'] }
            },
            orderBy: { created_at: 'desc' },
            select: { created_at: true }
          })
          
          const acceptedAt = acceptLog?.created_at
          
          if (acceptedAt) {
            const timeSinceAccept = Date.now() - acceptedAt.getTime()
            if (timeSinceAccept <= CANCEL_FREE_PERIOD_MS) {
              // 2分钟内：全额退款
              canCancel = true
              refundAmount = paidAmount
              cancelReason = '接单后2分钟内取消，将全额退款'
            } else {
              // 超过2分钟：扣除50元
              canCancel = true
              refundAmount = Math.max(0, paidAmount - CANCEL_FEE)
              cancelReason = '接单超过2分钟，取消将扣除50元违约金'
            }
          } else {
            // 异常情况：找不到接单记录，默认全额退款
            canCancel = true
            refundAmount = paidAmount
            cancelReason = '接单信息异常，允许全额退款'
          }
          break
        }

        case 'serving':
          if (order.service_start_at) {
            const serviceDuration = Date.now() - order.service_start_at.getTime()
            if (serviceDuration <= CANCEL_15MIN_MS) {
              canCancel = true
              const paidAmount = order.payment_records.reduce((sum, r) => sum + r.amount, 0)
              refundAmount = Math.max(0, paidAmount - CANCEL_FEE)
              cancelReason = '服务进行中（≤15分钟），取消将扣除50元违约金'
            } else {
              canCancel = false
              cancelReason = '服务已超过15分钟，无法取消'
            }
          } else {
            // 异常情况：没有服务开始时间，允许取消
            canCancel = true
            refundAmount = order.payment_records.reduce((sum, r) => sum + r.amount, 0)
            cancelReason = '服务信息异常，允许全额退款'
          }
          break

        default:
          canCancel = false
          cancelReason = '当前订单状态不支持取消'
      }

      // Step 3: 返回预览信息
      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: {
          can_cancel: canCancel,
          refund_amount: refundAmount,
          cancel_reason: cancelReason,
          order_status: order.status,
        },
      })
    } catch (err: unknown) {
      app.log.error(err, '查询取消预览失败')
      return reply.status(500).send({
        code:     ErrorCode.INTERNAL_ERROR,
        message:  '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })
}
