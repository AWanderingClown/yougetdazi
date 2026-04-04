import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin, requireAdminRole } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

export async function adminStatsRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/stats
   * 平台统计概览
   * 实时数据直接从 DB 聚合（日后可加 Redis 缓存）
   */
  app.get('/api/admin/stats', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = z.object({
      days: z.coerce.number().int().min(1).max(90).default(7),
    }).safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }

    const { days } = parseResult.data
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const trendStart = new Date(todayStart)
    trendStart.setDate(trendStart.getDate() - (days - 1))

    const [
      totalUsers,
      totalCompanions,
      pendingAudit,
      servingOrders,
      todayOrders,
      todayCompleted,
      todayGMV,
      totalOrders,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.companion.count({ where: { audit_status: 'approved' } }),
      prisma.companion.count({ where: { audit_status: 'pending' } }),
      prisma.order.count({ where: { status: 'serving' } }),
      prisma.order.count({ where: { created_at: { gte: todayStart } } }),
      prisma.order.count({ where: { status: 'completed', completed_at: { gte: todayStart } } }),
      prisma.order.aggregate({
        where:   { status: 'completed', completed_at: { gte: todayStart } },
        _sum:    { paid_amount: true },
      }),
      prisma.order.count(),
    ])

    // 近 N 天趋势（按日聚合订单数 + GMV）
    const trend = await prisma.$queryRaw<Array<{ date: string; order_count: number; gmv: number }>>`
      SELECT
        DATE(created_at AT TIME ZONE 'Asia/Shanghai') AS date,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN paid_amount ELSE 0 END), 0)::int AS gmv
      FROM orders
      WHERE created_at >= ${trendStart}
      GROUP BY 1
      ORDER BY 1 ASC
    `

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        realtime: {
          serving_orders: servingOrders,
          pending_audit:  pendingAudit,
        },
        today: {
          order_count:     todayOrders,
          completed_count: todayCompleted,
          gmv:             todayGMV._sum.paid_amount ?? 0,
        },
        totals: {
          users:       totalUsers,
          companions:  totalCompanions,
          orders:      totalOrders,
        },
        trend,
      },
    })
  })

  /**
   * GET /api/admin/platform-configs
   * 平台配置列表
   */
  app.get('/api/admin/platform-configs', {
    preHandler: [authenticateAdmin],
  }, async (_request, reply) => {
    const configs = await prisma.platformConfig.findMany({
      orderBy: { config_key: 'asc' },
    })
    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    configs,
    })
  })

  /**
   * PUT /api/admin/platform-configs/:key
   * 更新平台配置（upsert）
   * 权限：super_admin
   */
  app.put<{ Params: { key: string } }>('/api/admin/platform-configs/:key', {
    preHandler: [authenticateAdmin, requireAdminRole('super_admin', 'operator')],
  }, async (request, reply) => {
    const parseResult = z.object({
      config_value: z.any(),
      description:  z.string().max(200).optional(),
    }).safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }

    const { key } = request.params
    const { config_value, description } = parseResult.data

    const config = await prisma.platformConfig.upsert({
      where:  { config_key: key },
      update: {
        config_value,
        ...(description !== undefined ? { description } : {}),
      },
      create: {
        config_key:   key,
        config_value,
        description,
      },
    })

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: '配置已更新',
      data:    config,
    })
  })

  /**
   * GET /api/admin/announcements
   * Admin 公告列表（全量，含未激活）
   */
  app.get('/api/admin/announcements', {
    preHandler: [authenticateAdmin],
  }, async (_request, reply) => {
    const announcements = await prisma.announcement.findMany({
      orderBy: { created_at: 'desc' },
    })
    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    announcements,
    })
  })

  /**
   * POST /api/admin/announcements
   * 创建公告
   */
  app.post('/api/admin/announcements', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = z.object({
      title:           z.string().min(2).max(100),
      content:         z.string().min(1).max(5000),
      target_audience: z.enum(['all', 'user', 'companion']).default('all'),
      is_active:       z.boolean().default(true),
      published_at:    z.string().datetime().optional(),
      expires_at:      z.string().datetime().optional(),
    }).safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const data = parseResult.data

    const announcement = await prisma.announcement.create({
      data: {
        title:           data.title,
        content:         data.content,
        target_audience: data.target_audience,
        is_active:       data.is_active,
        published_at:    data.published_at ? new Date(data.published_at) : new Date(),
        expires_at:      data.expires_at   ? new Date(data.expires_at)   : null,
      },
    })

    return reply.status(201).send({
      code:    ErrorCode.SUCCESS,
      message: '公告创建成功',
      data:    announcement,
    })
  })
}
