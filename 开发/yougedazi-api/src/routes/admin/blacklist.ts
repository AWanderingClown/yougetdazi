import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

export async function adminBlacklistRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/blacklist
   * 黑名单列表（已禁用用户，只读视图）
   * 权限：所有角色可查
   *
   * 说明：用户禁用/解禁请使用 /api/admin/users/:id/ban 和 /api/admin/users/:id/unban
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
}
