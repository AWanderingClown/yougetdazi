import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireUser } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'


// ============================================================
// Zod 输入验证 Schema
// ============================================================

const CompanionListQuerySchema = z.object({
  page:         z.coerce.number().int().min(1).default(1),
  page_size:    z.coerce.number().int().min(1).max(20).default(10),
  is_online:    z.enum(['true', 'false']).optional(),  // 在线状态筛选
  service_id:   z.string().uuid().optional(),          // 服务类型筛选
  min_price:    z.coerce.number().int().min(0).optional(),
  max_price:    z.coerce.number().int().min(0).optional(),
  sort_by:      z.enum(['rating', 'orders', 'price_asc', 'price_desc']).default('rating'),
})

// ============================================================
// 服务层：陪玩师查询逻辑
// ============================================================

/**
 * 构建陪玩师列表查询条件
 */
function buildCompanionWhereClause(params: z.infer<typeof CompanionListQuerySchema>) {
  const where: Record<string, unknown> = {
    audit_status: 'approved',  // 只返回审核通过的
  }

  // 在线状态筛选
  if (params.is_online !== undefined) {
    where.is_online = params.is_online === 'true'
  }

  // 服务类型 + 价格区间筛选
  if (params.service_id || params.min_price !== undefined || params.max_price !== undefined) {
    where.services = {
      some: {
        is_active: true,
        ...(params.service_id ? { id: params.service_id } : {}),
        ...(params.min_price !== undefined ? { hourly_price: { gte: params.min_price } } : {}),
        ...(params.max_price !== undefined ? { hourly_price: { lte: params.max_price } } : {}),
      },
    }
  }

  return where
}

/**
 * 构建排序条件
 */
function buildOrderBy(sortBy: string) {
  switch (sortBy) {
    case 'rating':
      return [{ rating: 'desc' as const }, { total_orders: 'desc' as const }]
    case 'orders':
      return [{ total_orders: 'desc' as const }, { rating: 'desc' as const }]
    case 'price_asc':
      return [{ services: { _min: { hourly_price: 'asc' as const } } }]
    case 'price_desc':
      return [{ services: { _min: { hourly_price: 'desc' as const } } }]
    default:
      return [{ rating: 'desc' as const }, { total_orders: 'desc' as const }]
  }
}

// ============================================================
// C端陪玩师路由
// ============================================================

export async function cCompanionRoutes(app: FastifyInstance) {
  /**
   * GET /api/c/companions
   * 陪玩师列表（仅返回已通过审核的）
   * 
   * 功能：
   * - 分页查询
   * - 筛选：在线状态、服务类型、价格区间
   * - 排序：默认按评分降序，支持按接单数、价格排序
   */
  app.get('/api/c/companions', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const parseResult = CompanionListQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const params = parseResult.data
    const skip = (params.page - 1) * params.page_size

    try {
      const where = buildCompanionWhereClause(params)

      // 并行查询列表和总数
      const [companions, total] = await Promise.all([
        prisma.companion.findMany({
          where,
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            phone: true,
            is_online: true,
            is_working: true,
            total_orders: true,
            rating: true,
            deposit_level: true,
            services: {
              where: { is_active: true },
              select: {
                id: true,
                service_name: true,
                hourly_price: true,
                description: true,
              },
            },
          },
          orderBy: buildOrderBy(params.sort_by),
          skip,
          take: params.page_size,
        }),
        prisma.companion.count({ where }),
      ])

      // 格式化响应数据
      const formattedList = companions.map(companion => ({
        id: companion.id,
        nickname: companion.nickname,
        avatar: companion.avatar,
        gender: companion.gender === 1 ? 'male' : companion.gender === 2 ? 'female' : 'unknown',
        phone: companion.phone,
        is_online: companion.is_online,
        is_working: companion.is_working,
        total_orders: companion.total_orders,
        rating: companion.rating,
        deposit_level: companion.deposit_level,
        services: companion.services.map(service => ({
          service_id: service.id,
          name: service.service_name,
          hourly_price: service.hourly_price,
          description: service.description,
        })),
      }))

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: {
          list: formattedList,
          total,
          page: params.page,
          page_size: params.page_size,
          has_more: skip + companions.length < total,
        },
      })
    } catch (err) {
      app.log.error(err, '查询陪玩师列表失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * GET /api/c/companions/:id
   * 陪玩师详情（含服务项目列表和最近评价）
   * 
   * 功能：
   * - 查询单个陪玩师详情
   * - 只返回审核通过的陪玩师
   * - 返回完整信息和最近5条评价
   */
  app.get<{ Params: { id: string } }>('/api/c/companions/:id', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const { id } = request.params

    try {
      const companion = await prisma.companion.findUnique({
        where: { 
          id,
          audit_status: 'approved',  // 只返回审核通过的
        },
        select: {
          id: true,
          nickname: true,
          avatar: true,
          gender: true,
          phone: true,
          is_online: true,
          is_working: true,
          total_orders: true,
          rating: true,
          deposit_level: true,
          services: {
            where: { is_active: true },
            select: {
              id: true,
              service_name: true,
              hourly_price: true,
              min_duration: true,
              description: true,
            },
          },
        },
      })

      if (!companion) {
        return reply.status(404).send({
          code: ErrorCode.NOT_FOUND,
          message: '陪玩师不存在或未通过审核',
          errorKey: 'COMPANION_NOT_FOUND',
        })
      }

      // 查询最近5条评价（Review模型无user关联，仅返回基本字段）
      const recentReviews = await prisma.review.findMany({
        where: { companion_id: id },
        select: {
          id: true,
          rating: true,
          content: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
        take: 5,
      })

      // 格式化响应数据
      const formattedData = {
        id: companion.id,
        nickname: companion.nickname,
        avatar: companion.avatar,
        gender: companion.gender === 1 ? 'male' : companion.gender === 2 ? 'female' : 'unknown',
        phone: companion.phone,
        is_online: companion.is_online,
        is_working: companion.is_working,
        total_orders: companion.total_orders,
        rating: companion.rating,
        deposit_level: companion.deposit_level,
        services: companion.services.map(service => ({
          service_id: service.id,
          name: service.service_name,
          hourly_price: service.hourly_price,
          min_duration: service.min_duration,
          description: service.description,
        })),
        recent_reviews: recentReviews.map(review => ({
          id: review.id,
          rating: review.rating,
          content: review.content,
          created_at: review.created_at.toISOString(),
          user_nickname: '匿名用户',
          user_avatar: null,
        })),
      }

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: formattedData,
      })
    } catch (err) {
      app.log.error(err, '查询陪玩师详情失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })
}
