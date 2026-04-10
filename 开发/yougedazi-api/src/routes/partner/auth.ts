import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

const LoginSchema = z.object({
  secret_key: z.string().min(1, '密钥不能为空'),
})

export async function partnerAuthRoutes(app: FastifyInstance) {
  app.post('/api/partner/auth/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: 60 * 1000,
      },
    },
  }, async (request, reply) => {
    const parseResult = LoginSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { secret_key } = parseResult.data

    const partner = await prisma.partner.findUnique({
      where: { secret_key },
    })

    if (!partner) {
      return reply.status(401).send({
        code: ErrorCode.PARTNER_LOGIN_FAILED,
        message: '密钥无效',
        errorKey: 'INVALID_SECRET',
      })
    }

    if (partner.status !== 'active') {
      return reply.status(403).send({
        code: ErrorCode.PARTNER_INACTIVE,
        message: '合作商状态异常，无法登录',
        errorKey: 'PARTNER_INACTIVE',
      })
    }

    const token = app.partnerJwt.sign({
      sub: partner.id,
      type: partner.type,
      iss: 'ppmate-partner',
    })

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: '登录成功',
      data: {
        token,
        partner: {
          id: partner.id,
          name: partner.name,
          type: partner.type,
          status: partner.status,
        },
      },
    })
  })
}
