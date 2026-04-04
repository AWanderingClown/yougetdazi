import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireUser } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

// ============================================================
// Zod 输入验证 Schema
// ============================================================

const NotificationListQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20),
  is_read:   z.enum(['true', 'false']).transform(val => val === 'true').optional(),
})

// ============================================================
// C端通知路由
// ============================================================

export async function cNotificationRoutes(app: FastifyInstance) {
  /**
   * GET /api/c/notifications
   * C端通知列表（订单状态变更、系统公告等）
   * 
   * 功能：
   * - 获取当前用户的系统通知
   * - 支持分页
   * - 按时间倒序排列
   * - 支持已读/未读筛选
   */
  app.get('/api/c/notifications', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const parseResult = NotificationListQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { page, page_size, is_read } = parseResult.data
    const userId = request.currentUser!.id
    const skip = (page - 1) * page_size

    // 构建查询条件
    const whereCondition: any = {
      user_id: userId,
    }

    if (is_read !== undefined) {
      whereCondition.is_read = is_read
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: whereCondition,
        orderBy: { created_at: 'desc' },
        skip,
        take: page_size,
      }),
      prisma.notification.count({
        where: whereCondition,
      }),
    ])

    const formattedNotifications = notifications.map(n => ({
      id:         n.id,
      type:       n.type,
      title:      n.title,
      content:    n.content,
      is_read:    n.is_read,
      related_id: n.related_id,
      created_at: n.created_at.toISOString(),
    }))

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    {
        list:      formattedNotifications,
        total,
        page,
        page_size,
        has_more:  skip + notifications.length < total,
      },
    })
  })

  /**
   * POST /api/c/notifications/:id/read
   * 标记通知已读
   */
  app.post<{ Params: { id: string } }>('/api/c/notifications/:id/read', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const { id } = request.params
    const userId = request.currentUser!.id

    // 验证通知归属
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        user_id: userId,
      },
    })

    if (!notification) {
      return reply.status(404).send({
        code:     ErrorCode.NOTIFICATION_NOT_FOUND,
        message:  '通知不存在',
        errorKey: 'NOTIFICATION_NOT_FOUND',
      })
    }

    // 标记已读
    await prisma.notification.update({
      where: { id },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    })

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: '标记已读成功',
      data:    null,
    })
  })

  /**
   * GET /api/c/notifications/unread-count
   * 获取未读通知数
   */
  app.get('/api/c/notifications/unread-count', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const userId = request.currentUser!.id

    const count = await prisma.notification.count({
      where: {
        user_id: userId,
        is_read: false,
      },
    })

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    { count },
    })
  })

  /**
   * POST /api/c/notifications/read-all
   * 标记所有通知已读
   */
  app.post('/api/c/notifications/read-all', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const userId = request.currentUser!.id

    const result = await prisma.notification.updateMany({
      where: {
        user_id: userId,
        is_read: false,
      },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    })

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: '全部标记已读成功',
      data:    { updated_count: result.count },
    })
  })
}
