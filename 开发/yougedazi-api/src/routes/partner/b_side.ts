import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticatePartner, requirePartnerType } from '../../plugins/partner-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

const ID_CARD_REGEX = /^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/

const CompanionQuerySchema = z.object({
  audit_status: z.enum(['pending', 'approved', 'rejected']).optional(),
  keyword: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
})

const CreateCompanionSchema = z.object({
  openid: z.string().min(1, 'openid不能为空'),
  nickname: z.string().max(100).optional(),
  avatar: z.string().url().optional(),
  phone: z.string().max(20).optional(),
  gender: z.number().int().min(0).max(2).optional(),
  real_name: z.string().max(50).optional(),
  id_card_no: z.string().max(18).refine(
    (val) => !val || ID_CARD_REGEX.test(val),
    { message: '身份证号格式不正确' }
  ).optional(),
  id_card_front: z.string().max(255).optional(),
  id_card_back: z.string().max(255).optional(),
  service_name: z.string().max(100).optional(),
  hourly_price: z.number().int().min(0).optional(),
  min_duration: z.number().int().min(1).default(1).optional(),
})

const UpdateCompanionSchema = z.object({
  nickname: z.string().max(100).optional(),
  avatar: z.string().url().optional(),
  phone: z.string().max(20).optional(),
  real_name: z.string().max(50).optional(),
  id_card_no: z.string().max(18).refine(
    (val) => !val || ID_CARD_REGEX.test(val),
    { message: '身份证号格式不正确' }
  ).optional(),
  id_card_front: z.string().max(255).optional(),
  id_card_back: z.string().max(255).optional(),
})

async function checkCompanionExists(openid: string): Promise<boolean> {
  const existing = await prisma.companion.findUnique({
    where: { openid },
    select: { id: true },
  })
  return !!existing
}

async function createCompanionWithService(
  partnerId: string,
  data: z.infer<typeof CreateCompanionSchema>
) {
  return prisma.$transaction(async (tx) => {
    const newCompanion = await tx.companion.create({
      data: {
        openid: data.openid,
        nickname: data.nickname,
        avatar: data.avatar,
        phone: data.phone,
        gender: data.gender,
        real_name: data.real_name,
        id_card_no: data.id_card_no,
        id_card_front: data.id_card_front,
        id_card_back: data.id_card_back,
        partner_id: partnerId,
        audit_status: 'pending',
      },
    })

    if (data.service_name && data.hourly_price) {
      await tx.companionService.create({
        data: {
          companion_id: newCompanion.id,
          service_name: data.service_name,
          hourly_price: data.hourly_price,
          min_duration: data.min_duration ?? 1,
        },
      })
    }

    return newCompanion
  })
}

export async function partnerBSideRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticatePartner)

  app.get('/api/partner/b/companions', {
    preHandler: [requirePartnerType('B_SIDE')],
  }, async (request, reply) => {
    const partnerId = request.currentPartner!.id

    const parseResult = CompanionQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }

    const { audit_status, keyword, page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const where: Record<string, unknown> = { partner_id: partnerId }

    if (audit_status) where.audit_status = audit_status
    if (keyword) {
      where.OR = [
        { nickname: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword } },
      ]
    }

    const [total, companions] = await Promise.all([
      prisma.companion.count({ where }),
      prisma.companion.findMany({
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
          audit_status: true,
          is_online: true,
          deposit_level: true,
          deposited_amount: true,
          created_at: true,
        },
      }),
    ])

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: { total, page, page_size, list: companions },
    })
  })

  app.post('/api/partner/b/companions', {
    preHandler: [requirePartnerType('B_SIDE')],
  }, async (request, reply) => {
    const partnerId = request.currentPartner!.id

    const parseResult = CreateCompanionSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const data = parseResult.data

    if (await checkCompanionExists(data.openid)) {
      return reply.status(409).send({
        code: ErrorCode.CONFLICT,
        message: '该openid已存在',
        errorKey: 'COMPANION_EXISTS',
      })
    }

    const companion = await createCompanionWithService(partnerId, data)

    return reply.status(201).send({
      code: ErrorCode.SUCCESS,
      message: '搭子录入成功',
      data: { id: companion.id },
    })
  })

  app.get<{ Params: { id: string } }>('/api/partner/b/companions/:id', {
    preHandler: [requirePartnerType('B_SIDE')],
  }, async (request, reply) => {
    const partnerId = request.currentPartner!.id
    const { id } = request.params

    const companion = await prisma.companion.findUnique({
      where: { id },
      include: { services: { where: { is_active: true } } },
    })

    if (!companion) {
      return reply.status(404).send({
        code: ErrorCode.NOT_FOUND,
        message: '搭子不存在',
        errorKey: 'NOT_FOUND',
      })
    }

    if (companion.partner_id !== partnerId) {
      return reply.status(403).send({
        code: ErrorCode.FORBIDDEN,
        message: '无权访问此搭子',
        errorKey: 'FORBIDDEN',
      })
    }

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: companion,
    })
  })

  app.put<{ Params: { id: string } }>('/api/partner/b/companions/:id', {
    preHandler: [requirePartnerType('B_SIDE')],
  }, async (request, reply) => {
    const partnerId = request.currentPartner!.id
    const { id } = request.params

    const companion = await prisma.companion.findUnique({
      where: { id },
      select: { id: true, partner_id: true },
    })

    if (!companion) {
      return reply.status(404).send({
        code: ErrorCode.NOT_FOUND,
        message: '搭子不存在',
        errorKey: 'FORBIDDEN',
      })
    }

    if (companion.partner_id !== partnerId) {
      return reply.status(403).send({
        code: ErrorCode.FORBIDDEN,
        message: '无权操作此搭子',
        errorKey: 'FORBIDDEN',
      })
    }

    const parseResult = UpdateCompanionSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    await prisma.companion.update({
      where: { id },
      data: parseResult.data,
    })

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: '更新成功',
    })
  })
}
