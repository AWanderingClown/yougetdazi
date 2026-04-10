import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticatePartner, requirePartnerType } from '../../plugins/partner-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

const UserQuerySchema = z.object({
  status: z.enum(['active', 'banned', 'suspended']).optional(),
  keyword: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
})

export async function partnerCSideRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticatePartner)

  app.get('/api/partner/c/users', {
    preHandler: [requirePartnerType('C_SIDE')],
  }, async (request, reply) => {
    const partnerId = request.currentPartner!.id

    const parseResult = UserQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }

    const { status, keyword, page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const where: Record<string, unknown> = {
      partner_id: partnerId,
    }

    if (status) where.status = status
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
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          openid: true,
          nickname: true,
          avatar: true,
          phone: true,
          gender: true,
          status: true,
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
