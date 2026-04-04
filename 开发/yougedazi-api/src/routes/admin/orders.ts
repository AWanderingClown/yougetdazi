import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin, requireAdminRole } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { orderService } from '../../services/order.service'
import { pushBridgeService, PushEvent } from '../../services/push-bridge.service'
import { prisma } from '../../lib/prisma'

const AdminOrderQuerySchema = z.object({
  status:       z.string().optional(),
  user_id:      z.string().uuid().optional(),
  companion_id: z.string().uuid().optional(),
  order_no:     z.string().optional(),
  start_date:   z.string().optional(),
  end_date:     z.string().optional(),
  page:         z.coerce.number().int().min(1).default(1),
  page_size:    z.coerce.number().int().min(1).max(100).default(20),
})

export async function adminOrderRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/orders
   * Admin 订单列表（全量，多条件过滤）
   * 权限：所有 Admin 角色可查
   */
  app.get('/api/admin/orders', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = AdminOrderQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }

    const { status, user_id, companion_id, order_no, start_date, end_date, page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const where: Record<string, unknown> = {}
    if (status)       where.status       = status
    if (user_id)      where.user_id      = user_id
    if (companion_id) where.companion_id = companion_id
    if (order_no)     where.order_no     = { contains: order_no }
    if (start_date || end_date) {
      where.created_at = {
        ...(start_date ? { gte: new Date(start_date) } : {}),
        ...(end_date   ? { lte: new Date(end_date)   } : {}),
      }
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: page_size,
        orderBy: { created_at: 'desc' },
        include: {
          user:      { select: { id: true, nickname: true, avatar: true } },
          companion: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        total,
        page,
        page_size,
        list: orders,
      },
    })
  })

  /**
   * GET /api/admin/orders/:id
   * Admin 订单详情（含完整操作日志）
   */
  app.get<{ Params: { id: string } }>('/api/admin/orders/:id', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const { id } = request.params

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user:            { select: { id: true, nickname: true, avatar: true, phone: true } },
        companion:       { select: { id: true, nickname: true, avatar: true, phone: true } },
        operation_logs:  { orderBy: { created_at: 'asc' } },
        payment_records: { orderBy: { created_at: 'desc' } },
        renewals:        { orderBy: { created_at: 'asc' } },
      },
    })

    if (!order) {
      return reply.status(404).send({
        code:     ErrorCode.ORDER_NOT_FOUND,
        message:  '订单不存在',
        errorKey: 'ORDER_NOT_FOUND',
      })
    }

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    order,
    })
  })

  /**
   * POST /api/admin/orders/:id/force-cancel
   * 强制取消订单（任意非终态）
   * 权限：super_admin, operator
   */
  app.post<{ Params: { id: string } }>('/api/admin/orders/:id/force-cancel', {
    preHandler: [authenticateAdmin, requireAdminRole('super_admin', 'operator')],
  }, async (request, reply) => {
    const parseResult = z.object({
      reason:          z.string().min(5, '原因不少于5字'),
      refund_percent:  z.number().int().refine(v => [0, 50, 100].includes(v), '退款比例只能是 0/50/100'),
    }).safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }
    const { id } = request.params
    const { reason, refund_percent } = parseResult.data
    const adminId = request.currentAdmin!.id

    try {
      const result = await orderService.adminForceCancel(id, adminId, reason, refund_percent)
      
      // 转发推送事件给管理后台
      if (result && 'pushEvents' in result && Array.isArray(result.pushEvents)) {
        await pushBridgeService.sendPushEvents(result.pushEvents as PushEvent[], 'order_service')
      }
      
      return reply.status(200).send({
        code:    ErrorCode.SUCCESS,
        message: '订单已强制取消',
        data:    result,
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        const httpStatus = error.code === ErrorCode.ORDER_NOT_FOUND ? 404 : 400
        return reply.status(httpStatus).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      app.log.error(err, 'Admin 强制取消订单失败')
      return reply.status(500).send({
        code:     ErrorCode.INTERNAL_ERROR,
        message:  '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * POST /api/admin/orders/:id/force-complete
   * 强制完成订单（serving → completed）
   * 权限：super_admin, operator
   */
  app.post<{ Params: { id: string } }>('/api/admin/orders/:id/force-complete', {
    preHandler: [authenticateAdmin, requireAdminRole('super_admin', 'operator')],
  }, async (request, reply) => {
    const parseResult = z.object({
      reason: z.string().min(5, '原因不少于5字'),
    }).safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }
    const { id } = request.params
    const { reason } = parseResult.data
    const adminId = request.currentAdmin!.id

    try {
      const result = await orderService.adminForceComplete(id, adminId, reason)
      
      // 转发推送事件给管理后台
      if (result && 'pushEvents' in result && Array.isArray(result.pushEvents)) {
        await pushBridgeService.sendPushEvents(result.pushEvents as PushEvent[], 'order_service')
      }
      
      return reply.status(200).send({
        code:    ErrorCode.SUCCESS,
        message: '订单已强制完成',
        data:    null,
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        const httpStatus = error.code === ErrorCode.ORDER_NOT_FOUND ? 404 : 400
        return reply.status(httpStatus).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      app.log.error(err, 'Admin 强制完成订单失败')
      return reply.status(500).send({
        code:     ErrorCode.INTERNAL_ERROR,
        message:  '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * PATCH /api/admin/orders/:id/note
   * 修改订单 Admin 备注（不影响状态）
   * 权限：所有 Admin 角色
   */
  app.patch<{ Params: { id: string } }>('/api/admin/orders/:id/note', {
    preHandler: [authenticateAdmin, requireAdminRole('super_admin', 'operator')],
  }, async (request, reply) => {
    const parseResult = z.object({
      admin_note: z.string().max(500),
    }).safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ code: ErrorCode.VALIDATION_ERROR, message: '参数校验失败' })
    }
    const { id } = request.params
    const { admin_note } = parseResult.data

    const order = await prisma.order.findUnique({ where: { id }, select: { id: true } })
    if (!order) {
      return reply.status(404).send({
        code:     ErrorCode.ORDER_NOT_FOUND,
        message:  '订单不存在',
        errorKey: 'ORDER_NOT_FOUND',
      })
    }

    await prisma.order.update({
      where: { id },
      data:  { admin_note },
    })

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: '备注已更新',
      data:    null,
    })
  })
}
