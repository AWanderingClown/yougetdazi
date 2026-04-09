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
 * 构建排序条件（SQL片段，用于原生查询）
 */
function buildOrderByClause(sortBy: string): string {
  switch (sortBy) {
    case 'rating':
      return 'c.rating DESC, c.total_orders DESC'
    case 'orders':
      return 'c.total_orders DESC, c.rating DESC'
    case 'price_asc':
      return '(SELECT MIN(cs.hourly_price) FROM companion_services cs WHERE cs.companion_id = c.id AND cs.is_active = true) ASC'
    case 'price_desc':
      return '(SELECT MAX(cs.hourly_price) FROM companion_services cs WHERE cs.companion_id = c.id AND cs.is_active = true) DESC'
    default:
      return 'c.rating DESC, c.total_orders DESC'
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
    const userId = request.currentUser!.id

    try {
      // 构建排序子句
      const orderByClause = buildOrderByClause(params.sort_by)

      // 构建筛选条件
      const whereConditions: string[] = [`c.audit_status = 'approved'`]
      const queryParams: unknown[] = []
      let paramIndex = 1

      if (params.is_online !== undefined) {
        whereConditions.push(`c.is_online = $${paramIndex++}`)
        queryParams.push(params.is_online === 'true')
      }

      if (params.service_id) {
        whereConditions.push(` EXISTS (SELECT 1 FROM companion_services cs WHERE cs.companion_id = c.id AND cs.is_active = true AND cs.id = $${paramIndex++})`)
        queryParams.push(params.service_id)
      }

      if (params.min_price !== undefined) {
        whereConditions.push(` EXISTS (SELECT 1 FROM companion_services cs WHERE cs.companion_id = c.id AND cs.is_active = true AND cs.hourly_price >= $${paramIndex++})`)
        queryParams.push(params.min_price)
      }

      if (params.max_price !== undefined) {
        whereConditions.push(` EXISTS (SELECT 1 FROM companion_services cs WHERE cs.companion_id = c.id AND cs.is_active = true AND cs.hourly_price <= $${paramIndex++})`)
        queryParams.push(params.max_price)
      }

      // 构建 WHERE 条件（直接拼接简单条件，userId 用参数化）
      const conditions: string[] = [`c.audit_status = 'approved'`]
      const paramsList: unknown[] = [userId]

      if (params.is_online !== undefined) {
        conditions.push(`c.is_online = $${paramsList.length + 1}`)
        paramsList.push(params.is_online === 'true')
      }

      if (params.service_id) {
        conditions.push(`EXISTS (SELECT 1 FROM companion_services cs WHERE cs.companion_id = c.id AND cs.is_active = true AND cs.id = $${paramsList.length + 1})`)
        paramsList.push(params.service_id)
      }

      if (params.min_price !== undefined) {
        conditions.push(`EXISTS (SELECT 1 FROM companion_services cs WHERE cs.companion_id = c.id AND cs.is_active = true AND cs.hourly_price >= $${paramsList.length + 1})`)
        paramsList.push(params.min_price)
      }

      if (params.max_price !== undefined) {
        conditions.push(`EXISTS (SELECT 1 FROM companion_services cs WHERE cs.companion_id = c.id AND cs.is_active = true AND cs.hourly_price <= $${paramsList.length + 1})`)
        paramsList.push(params.max_price)
      }

      const whereStr = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // 列表查询
      const listQuery = `
        SELECT 
          c.id, c.nickname, c.avatar, c.gender, c.phone,
          c.is_online, c.is_working, c.total_orders, c.rating, c.deposit_level,
          (cl.id IS NOT NULL) as is_liked
        FROM companions c
        LEFT JOIN companion_likes cl ON c.id = cl.companion_id AND cl.user_id = $1
        ${whereStr}
        ORDER BY is_liked DESC, ${orderByClause}
        LIMIT $${paramsList.length + 1} OFFSET $${paramsList.length + 2}
      `
      paramsList.push(params.page_size, skip)

      const companionsRaw = await prisma.$queryRawUnsafe<Array<{
        id: string
        nickname: string
        avatar: string | null
        gender: number
        phone: string | null
        is_online: boolean
        is_working: boolean
        total_orders: number
        rating: number
        deposit_level: number
        is_liked: boolean
      }>>(listQuery, ...paramsList)

      // COUNT 查询
      const countQuery = `
        SELECT COUNT(*) as count
        FROM companions c
        LEFT JOIN companion_likes cl ON c.id = cl.companion_id AND cl.user_id = $1
        ${whereStr}
      `
      const countParams = paramsList.slice(0, -2)
      const total = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(countQuery, ...countParams)

      // 查询服务详情
      const companionIds = companionsRaw.map(c => c.id)
      const servicesRaw = await prisma.companionService.findMany({
        where: {
          companion_id: { in: companionIds },
          is_active: true,
        },
        select: {
          id: true,
          companion_id: true,
          service_name: true,
          hourly_price: true,
          description: true,
        },
      })

      // 按 companion_id 分组服务
      const servicesMap = new Map<string, typeof servicesRaw>()
      for (const service of servicesRaw) {
        if (!servicesMap.has(service.companion_id)) {
          servicesMap.set(service.companion_id, [])
        }
        servicesMap.get(service.companion_id)!.push(service)
      }

      // 格式化响应数据
      const formattedList = companionsRaw.map(companion => ({
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
        is_liked: companion.is_liked,
        services: (servicesMap.get(companion.id) || []).map(service => ({
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
          total: Number(total[0]?.count || 0),
          page: params.page,
          page_size: params.page_size,
          has_more: skip + companionsRaw.length < Number(total[0]?.count || 0),
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

  /**
   * POST /api/c/companions/:id/like
   * 心动/收藏搭子
   */
  app.post<{ Params: { id: string } }>('/api/c/companions/:id/like', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const { id: companionId } = request.params
    const userId = request.currentUser!.id

    try {
      const companion = await prisma.companion.findUnique({
        where: { id: companionId, audit_status: 'approved' },
        select: { id: true },
      })

      if (!companion) {
        return reply.status(404).send({
          code: ErrorCode.NOT_FOUND,
          message: '陪玩师不存在或未通过审核',
        })
      }

      const existing = await prisma.companionLike.findUnique({
        where: { user_id_companion_id: { user_id: userId, companion_id: companionId } },
      })

      if (existing) {
        return reply.status(400).send({
          code: ErrorCode.VALIDATION_ERROR,
          message: '已心动过该搭子',
        })
      }

      await prisma.companionLike.create({
        data: { user_id: userId, companion_id: companionId },
      })

      return reply.status(201).send({
        code: ErrorCode.SUCCESS,
        message: '心动成功',
      })
    } catch (err) {
      app.log.error(err, '心动失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
      })
    }
  })

  /**
   * DELETE /api/c/companions/:id/like
   * 取消心动
   */
  app.delete<{ Params: { id: string } }>('/api/c/companions/:id/like', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const { id: companionId } = request.params
    const userId = request.currentUser!.id

    try {
      const existing = await prisma.companionLike.findUnique({
        where: { user_id_companion_id: { user_id: userId, companion_id: companionId } },
      })

      if (!existing) {
        return reply.status(404).send({
          code: ErrorCode.NOT_FOUND,
          message: '未心动过该搭子',
        })
      }

      await prisma.companionLike.delete({
        where: { id: existing.id },
      })

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: '已取消心动',
      })
    } catch (err) {
      app.log.error(err, '取消心动失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
      })
    }
  })

  /**
   * GET /api/c/likes
   * 获取心动列表（用于展示和排序）
   */
  app.get('/api/c/likes', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const userId = request.currentUser!.id

    try {
      const likes = await prisma.companionLike.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        select: {
          companion_id: true,
          created_at: true,
          companion: {
            select: {
              id: true,
              nickname: true,
              avatar: true,
              gender: true,
              is_online: true,
              rating: true,
              total_orders: true,
            },
          },
        },
      })

      const list = likes.map(like => ({
        companion_id: like.companion_id,
        liked_at: like.created_at,
        nickname: like.companion.nickname,
        avatar: like.companion.avatar,
        gender: like.companion.gender === 1 ? 'male' : like.companion.gender === 2 ? 'female' : 'unknown',
        is_online: like.companion.is_online,
        rating: like.companion.rating,
        total_orders: like.companion.total_orders,
      }))

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: { list, total: list.length },
      })
    } catch (err) {
      app.log.error(err, '获取心动列表失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
      })
    }
  })
}
