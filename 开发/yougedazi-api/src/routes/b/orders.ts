import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Order } from '@prisma/client'
import { authenticate, requireCompanion } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { orderService } from '../../services/order.service'
import { pushBridgeService, PushEvent } from '../../services/push-bridge.service'
import { prisma } from '../../lib/prisma'
import { PUSH_EVENTS, CANCEL_FEE, CANCEL_FREE_PERIOD_MS, CANCEL_15MIN_MS } from '../../constants/order.js'
import { dispatchPushEvents } from '../../utils/push-helper.js'


const OrderListQuerySchema = z.object({
  status:    z.enum(['pending_accept', 'waiting_grab', 'accepted', 'serving', 'completed', 'cancelled']).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(10),
})

export async function bOrderRoutes(app: FastifyInstance) {
  /**
   * GET /api/b/orders
   * B端订单列表（自己接的单，含各状态）
   */
  app.get('/api/b/orders', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const parseResult = OrderListQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }
    const { status, page, page_size } = parseResult.data
    const companionId = request.currentUser!.id
    const skip = (page - 1) * page_size

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: {
          companion_id: companionId,
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
          user: {
            select: { id: true, nickname: true, avatar: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: page_size,
      }),
      prisma.order.count({
        where: {
          companion_id: companionId,
          ...(status ? { status } : {}),
        },
      }),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        list:      orders,
        total,
        page,
        page_size,
        has_more:  skip + orders.length < total,
      },
    })
  })

  /**
   * GET /api/b/orders/grab
   * 悬赏抢单列表（status = waiting_grab）
   */
  app.get('/api/b/orders/grab', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const grabOrders = await prisma.order.findMany({
      where: { status: 'waiting_grab' },
      select: {
        id:           true,
        order_no:     true,
        service_name: true,
        duration:     true,
        total_amount: true,
        user_remark:  true,
        created_at:   true,
        accept_deadline: true,
      },
      orderBy: { created_at: 'asc' },
      take: 50,
    })

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    { list: grabOrders },
    })
  })

  /**
   * GET /api/b/orders/:id
   * B端订单详情
   */
  app.get<{ Params: { id: string } }>('/api/b/orders/:id', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const { id } = request.params
    const companionId = request.currentUser!.id

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user:           { select: { id: true, nickname: true, avatar: true } },
        operation_logs: { orderBy: { created_at: 'asc' } },
      },
    })

    if (!order) {
      return reply.status(404).send({
        code:     ErrorCode.ORDER_NOT_FOUND,
        message:  '订单不存在',
        errorKey: 'ORDER_NOT_FOUND',
      })
    }

    // 防越权：
    // 1. 已有陪玩师的订单：只有该陪玩师本人可以查看完整详情
    // 2. 悬赏单（companion_id === null, status = waiting_grab）：任何陪玩师不能通过此接口查看，
    //    应通过 GET /api/b/orders/grab 查看对外公开的抢单信息
    if (order.companion_id !== null && order.companion_id !== companionId) {
      return reply.status(403).send({
        code:     ErrorCode.FORBIDDEN,
        message:  '无权查看此订单',
        errorKey: 'FORBIDDEN',
      })
    }

    if (order.companion_id === null) {
      return reply.status(403).send({
        code:     ErrorCode.FORBIDDEN,
        message:  '悬赏单请通过抢单列表查看',
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
   * POST /api/b/orders/:id/accept
   * 接受指定单
   * 状态机：pending_accept → accepted
   * 必须验证：order.companion_id === currentUser.id
   * 写 order_operation_logs
   */
  app.post<{ Params: { id: string } }>('/api/b/orders/:id/accept', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const { id } = request.params
    const companionId = request.currentUser!.id

    try {
      const result = await orderService.acceptOrder(id, companionId)
      await dispatchPushEvents(result)

      return reply.status(200).send({
        code:    ErrorCode.SUCCESS,
        message: '接单成功',
        data:    result,
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        const httpStatus = error.code === ErrorCode.FORBIDDEN ? 403 : error.code === ErrorCode.ORDER_NOT_FOUND ? 404 : 400
        return reply.status(httpStatus).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      app.log.error(err, '接单失败')
      return reply.status(500).send({
        code:     ErrorCode.INTERNAL_ERROR,
        message:  '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * POST /api/b/orders/:id/grab
   * 抢单（悬赏单）
   * 状态机：waiting_grab → accepted
   * 乐观锁：UPDATE orders SET companion_id=X, status='accepted' WHERE id=X AND status='waiting_grab'
   * 写 order_operation_logs
   */
  app.post<{ Params: { id: string } }>('/api/b/orders/:id/grab', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const { id } = request.params
    const companionId = request.currentUser!.id

    try {
      const result = await orderService.grabOrder(id, companionId)
      await dispatchPushEvents(result)

      return reply.status(200).send({
        code:    ErrorCode.SUCCESS,
        message: '抢单成功',
        data:    result,
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        const httpStatus = error.code === ErrorCode.ORDER_ALREADY_ACCEPTED ? 409 : 400
        return reply.status(httpStatus).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      app.log.error(err, '抢单失败')
      return reply.status(500).send({
        code:     ErrorCode.INTERNAL_ERROR,
        message:  '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * POST /api/b/orders/:id/start
   * 开始服务
   * 状态机：accepted → serving
   * 操作：
   * 1. 更新订单状态
   * 2. 写入 service_start_at，计算 service_end_at
   * 3. 在 Redis 写倒计时（key: order:timer:{orderId}，value: 剩余秒数）
   * 4. 创建 BullMQ Delayed Job（service_timeout，delay = duration * 3600 * 1000）
   * 5. 更新 companion.is_working = true
   * 6. 写 order_operation_logs
   */
  app.post<{ Params: { id: string } }>('/api/b/orders/:id/start', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const { id } = request.params
    const companionId = request.currentUser!.id
    const { event } = (request.body as { event?: string } | null) ?? {}

    try {
      const order = await prisma.order.findUnique({ where: { id } })
      if (!order) {
        return reply.status(404).send({
          code:     ErrorCode.ORDER_NOT_FOUND,
          message:  '订单不存在',
          errorKey: 'ORDER_NOT_FOUND',
        })
      }
      if (order.companion_id !== companionId) {
        return reply.status(403).send({
          code:     ErrorCode.FORBIDDEN,
          message:  '无权操作此订单',
          errorKey: 'FORBIDDEN',
        })
      }

      // 处理中间状态（preparing、departed）或直接开始服务
      let resultOrder: Order
      let message = '订单已更新'

      if (event === 'preparing' || event === 'departed') {
        // 更新为中间状态
        resultOrder = await prisma.order.update({
          where: { id },
          data: { status: event as 'preparing' | 'departed' },
        })
      } else {
        // 默认开始服务
        const serviceResult = await orderService.startService(id, companionId)
        // 后台发送推送事件，不阻塞响应
        void dispatchPushEvents(serviceResult).catch(err => {
          app.log.error(err, '分发推送事件失败')
        })
        const updated = await prisma.order.findUnique({ where: { id } })
        if (!updated) {
          return reply.status(404).send({
            code:     ErrorCode.ORDER_NOT_FOUND,
            message:  '订单不存在',
            errorKey: 'ORDER_NOT_FOUND',
          })
        }
        resultOrder = updated
        message = '服务已开始'
      }

      return reply.status(200).send({
        code:    ErrorCode.SUCCESS,
        message,
        data:    resultOrder,
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        const httpStatus = error.code === ErrorCode.FORBIDDEN ? 403 : error.code === ErrorCode.ORDER_NOT_FOUND ? 404 : 400
        return reply.status(httpStatus).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      app.log.error(err, '开始服务失败')
      return reply.status(500).send({
        code:     ErrorCode.INTERNAL_ERROR,
        message:  '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * POST /api/b/orders/:id/complete
   * 完成服务
   * 状态机：serving → completed
   * 操作：
   * 1. 更新订单状态，写 completed_at
   * 2. 删除 Redis 倒计时 key
   * 3. 取消 BullMQ 超时 Job
   * 4. 更新 companion.is_working = false
   * 5. 触发结算逻辑（写 settlements 表）
   * 6. 写 order_operation_logs
   */
  app.post<{ Params: { id: string } }>('/api/b/orders/:id/complete', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const { id } = request.params
    const companionId = request.currentUser!.id

    try {
      const result = await orderService.completeOrder(id, companionId, 'companion')
      await dispatchPushEvents(result)

      return reply.status(200).send({
        code:    ErrorCode.SUCCESS,
        message: '服务已完成',
        data:    result.order,
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        const httpStatus = error.code === ErrorCode.FORBIDDEN ? 403 : error.code === ErrorCode.ORDER_NOT_FOUND ? 404 : 400
        return reply.status(httpStatus).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      app.log.error(err, '完成订单失败')
      return reply.status(500).send({
        code:     ErrorCode.INTERNAL_ERROR,
        message:  '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * GET /api/b/orders/:id/timer
   * 获取订单服务剩余时间（从 Redis 读，权威时间源）
   * 返回：remaining_seconds
   */
  app.get<{ Params: { id: string } }>('/api/b/orders/:id/timer', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const { id } = request.params
    const companionId = request.currentUser!.id

    const order = await prisma.order.findUnique({
      where: { id },
      select: { companion_id: true },
    })
    if (!order || order.companion_id !== companionId) {
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
}
