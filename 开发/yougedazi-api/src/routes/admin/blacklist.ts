import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

// ============================================================
// Admin 黑名单管理路由
// ============================================================

export async function adminBlacklistRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/blacklist
   * 黑名单列表（已禁用用户）
   * 权限：所有角色可查
   */
  app.get('/api/admin/blacklist', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = z.object({
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

    const { keyword, page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const where: Record<string, unknown> = { status: 'banned' }
    if (keyword) {
      where.OR = [
        { nickname: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword } },
      ]
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: page_size,
        orderBy: { banned_at: 'desc' },
        select: {
          id: true,
          nickname: true,
          avatar: true,
          phone: true,
          status: true,
          ban_reason: true,
          banned_at: true,
          created_at: true,
        },
      }),
    ])

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
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
   * POST /api/admin/blacklist
   * 添加黑名单（禁用用户）
   * 权限：operator 及以上
   */
  app.post<{ Body: { user_id: string; ban_reason: string } }>('/api/admin/blacklist', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = z.object({
      user_id: z.string().uuid(),
      ban_reason: z.string().max(500),
    }).safeParse(request.body)

    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }

    const { user_id, ban_reason } = parseResult.data

    // 检查用户是否存在
    const user = await prisma.user.findUnique({ where: { id: user_id } })
    if (!user) {
      return reply.status(404).send({
        code: ErrorCode.NOT_FOUND,
        message: '用户不存在',
      })
    }

    // 禁用用户
    const updated = await prisma.user.update({
      where: { id: user_id },
      data: {
        status: 'banned',
        ban_reason,
        banned_at: new Date(),
        banned_by: request.currentAdmin?.id,
      },
      select: {
        id: true,
        nickname: true,
        status: true,
        ban_reason: true,
        banned_at: true,
      },
    })

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: '用户已禁用',
      data: updated,
    })
  })

  /**
   * DELETE /api/admin/blacklist/:user_id
   * 移出黑名单（解禁用户）
   * 权限：operator 及以上
   */
  app.delete<{ Params: { user_id: string } }>('/api/admin/blacklist/:user_id', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const { user_id } = request.params

    // 检查用户是否存在
    const user = await prisma.user.findUnique({ where: { id: user_id } })
    if (!user) {
      return reply.status(404).send({
        code: ErrorCode.NOT_FOUND,
        message: '用户不存在',
      })
    }

    // 解禁用户
    const updated = await prisma.user.update({
      where: { id: user_id },
      data: {
        status: 'active',
        ban_reason: null,
        banned_at: null,
        banned_by: null,
      },
      select: {
        id: true,
        nickname: true,
        status: true,
        banned_at: true,
      },
    })

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: '用户已解禁',
      data: updated,
    })
  })

  /**
   * PATCH /api/admin/blacklist/:user_id
   * 更新黑名单原因
   * 权限：operator 及以上
   */
  app.patch<{ Params: { user_id: string }; Body: { ban_reason: string } }>(
    '/api/admin/blacklist/:user_id',
    { preHandler: [authenticateAdmin] },
    async (request, reply) => {
      const paramsResult = z.object({
        user_id: z.string().uuid(),
      }).safeParse(request.params)

      const bodyResult = z.object({
        ban_reason: z.string().max(500),
      }).safeParse(request.body)

      if (!paramsResult.success || !bodyResult.success) {
        return reply.status(400).send({
          code: ErrorCode.VALIDATION_ERROR,
          message: '参数校验失败',
        })
      }

      const { user_id } = paramsResult.data
      const { ban_reason } = bodyResult.data

      // 检查用户是否存在且被禁用
      const user = await prisma.user.findUnique({ where: { id: user_id } })
      if (!user || user.status !== 'banned') {
        return reply.status(404).send({
          code: ErrorCode.NOT_FOUND,
          message: '该用户不在黑名单中',
        })
      }

      // 更新禁用原因
      const updated = await prisma.user.update({
        where: { id: user_id },
        data: { ban_reason },
        select: {
          id: true,
          nickname: true,
          ban_reason: true,
          banned_at: true,
        },
      })

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: '禁用原因已更新',
        data: updated,
      })
    }
  )
}
