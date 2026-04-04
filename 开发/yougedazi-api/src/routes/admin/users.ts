import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin, requireAdminRole } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

export async function adminUserRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/users
   * C端用户列表
   * 权限：所有角色可查
   */
  app.get('/api/admin/users', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = z.object({
      status:    z.enum(['active', 'banned', 'suspended']).optional(),
      keyword:   z.string().max(50).optional(),
      page:      z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(20),
    }).safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }

    const { status, keyword, page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (keyword) {
      where.OR = [
        { nickname: { contains: keyword, mode: 'insensitive' } },
        { phone:    { contains: keyword } },
      ]
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: page_size,
        orderBy: { created_at: 'desc' },
        select: {
          id:         true,
          nickname:   true,
          avatar:     true,
          phone:      true,
          gender:     true,
          status:     true,
          ban_reason: true,
          banned_at:  true,
          created_at: true,
          // 不返回 openid（合规）
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
        list: users,
      },
    })
  })

  /**
   * GET /api/admin/users/:id
   * C端用户详情（不含 openid，安全合规）
   */
  app.get<{ Params: { id: string } }>('/api/admin/users/:id', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const { id } = request.params

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id:         true,
        nickname:   true,
        avatar:     true,
        phone:      true,
        gender:     true,
        status:     true,
        ban_reason: true,
        banned_by:  true,
        banned_at:  true,
        created_at: true,
        updated_at: true,
        // 不返回 openid
      },
    })

    if (!user) {
      return reply.status(404).send({
        code:     ErrorCode.NOT_FOUND,
        message:  '用户不存在',
        errorKey: 'NOT_FOUND',
      })
    }

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    user,
    })
  })

  /**
   * POST /api/admin/users/:id/ban
   * 封禁用户
   * 权限：super_admin, operator
   */
  app.post<{ Params: { id: string } }>('/api/admin/users/:id/ban', {
    preHandler: [authenticateAdmin, requireAdminRole('super_admin', 'operator')],
  }, async (request, reply) => {
    const parseResult = z.object({
      reason: z.string().min(5, '封禁原因不少于5字').max(500),
    }).safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { id } = request.params
    const { reason } = parseResult.data
    const adminId = request.currentAdmin!.id

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!user) {
      return reply.status(404).send({
        code:     ErrorCode.NOT_FOUND,
        message:  '用户不存在',
        errorKey: 'NOT_FOUND',
      })
    }
    if (user.status === 'banned') {
      return reply.status(400).send({
        code:     ErrorCode.VALIDATION_ERROR,
        message:  '用户已被封禁',
        errorKey: 'VALIDATION_ERROR',
      })
    }

    await prisma.user.update({
      where: { id },
      data: {
        status:     'banned',
        ban_reason: reason,
        banned_by:  adminId,
        banned_at:  new Date(),
      },
    })

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: '用户已封禁',
      data:    null,
    })
  })

  /**
   * POST /api/admin/users/:id/unban
   * 解封用户
   * 权限：super_admin, operator
   */
  app.post<{ Params: { id: string } }>('/api/admin/users/:id/unban', {
    preHandler: [authenticateAdmin, requireAdminRole('super_admin', 'operator')],
  }, async (request, reply) => {
    const { id } = request.params

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!user) {
      return reply.status(404).send({
        code:     ErrorCode.NOT_FOUND,
        message:  '用户不存在',
        errorKey: 'NOT_FOUND',
      })
    }
    if (user.status !== 'banned') {
      return reply.status(400).send({
        code:     ErrorCode.VALIDATION_ERROR,
        message:  '用户当前未被封禁',
        errorKey: 'VALIDATION_ERROR',
      })
    }

    await prisma.user.update({
      where: { id },
      data: {
        status:     'active',
        ban_reason: null,
        banned_by:  null,
        banned_at:  null,
      },
    })

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: '用户已解封',
      data:    null,
    })
  })

  /**
   * GET /api/admin/users/:id/orders
   * 用户订单列表
   */
  app.get<{ Params: { id: string } }>('/api/admin/users/:id/orders', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const { id } = request.params
    const parseResult = z.object({
      page:      z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(20),
    }).safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ code: ErrorCode.VALIDATION_ERROR, message: '参数校验失败' })
    }
    const { page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const [total, orders] = await Promise.all([
      prisma.order.count({ where: { user_id: id } }),
      prisma.order.findMany({
        where: { user_id: id },
        skip,
        take: page_size,
        orderBy: { created_at: 'desc' },
        include: {
          companion: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    { total, page, page_size, list: orders },
    })
  })

  /**
   * GET /api/admin/users/:id/payments
   * 用户支付记录
   */
  app.get<{ Params: { id: string } }>('/api/admin/users/:id/payments', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const { id } = request.params
    const parseResult = z.object({
      page:      z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(20),
    }).safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ code: ErrorCode.VALIDATION_ERROR, message: '参数校验失败' })
    }
    const { page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const [total, payments] = await Promise.all([
      prisma.paymentRecord.count({ where: { order: { user_id: id } } }),
      prisma.paymentRecord.findMany({
        where: { order: { user_id: id } },
        skip,
        take: page_size,
        orderBy: { created_at: 'desc' },
      }),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    { total, page, page_size, list: payments },
    })
  })

  /**
   * GET /api/admin/users/:id/reviews
   * 用户评价记录
   */
  app.get<{ Params: { id: string } }>('/api/admin/users/:id/reviews', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const { id } = request.params
    const parseResult = z.object({
      page:      z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(20),
    }).safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ code: ErrorCode.VALIDATION_ERROR, message: '参数校验失败' })
    }
    const { page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const [total, reviews] = await Promise.all([
      prisma.review.count({ where: { user_id: id } }),
      prisma.review.findMany({
        where: { user_id: id },
        skip,
        take: page_size,
        orderBy: { created_at: 'desc' },
      }),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    { total, page, page_size, list: reviews },
    })
  })

  /**
   * GET /api/admin/users/:id/addresses
   * 用户地址列表
   * @deprecated 当前版本暂无地址功能，返回空数组
   */
  app.get<{ Params: { id: string } }>('/api/admin/users/:id/addresses', {
    preHandler: [authenticateAdmin],
  }, async (_request, reply) => {
    // 当前 schema 暂无 Address 模型，返回空数组
    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    [],
    })
  })
}
