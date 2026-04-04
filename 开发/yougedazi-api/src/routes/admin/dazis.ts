import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin, requireAdminRole } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

const CompanionQuerySchema = z.object({
  audit_status: z.enum(['pending', 'approved', 'rejected']).optional(),
  keyword:      z.string().max(50).optional(),
  page:         z.coerce.number().int().min(1).default(1),
  page_size:    z.coerce.number().int().min(1).max(100).default(20),
})

export async function adminCompanionRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/companions
   * 陪玩师列表（含审核状态过滤）
   * 权限：所有角色可查
   */
  app.get('/api/admin/companions', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = CompanionQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }

    const { audit_status, keyword, page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const where: Record<string, unknown> = {}
    if (audit_status) where.audit_status = audit_status
    if (keyword) {
      where.OR = [
        { nickname: { contains: keyword, mode: 'insensitive' } },
        { phone:    { contains: keyword } },
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
          id:              true,
          nickname:        true,
          avatar:          true,
          phone:           true,
          audit_status:    true,
          is_online:       true,
          is_working:      true,
          deposit_level:   true,
          deposited_amount: true,
          created_at:      true,
          // 不返回身份证等敏感字段
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
        list: companions,
      },
    })
  })

  /**
   * GET /api/admin/companions/:id
   * 陪玩师审核详情（含身份证信息、服务项目、审核历史）
   * 权限：所有角色可查
   */
  app.get<{ Params: { id: string } }>('/api/admin/companions/:id', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const { id } = request.params

    const companion = await prisma.companion.findUnique({
      where: { id },
      include: {
        services:      { where: { is_active: true }, orderBy: { created_at: 'asc' } },
        audit_records: { orderBy: { created_at: 'desc' } },
      },
    })

    if (!companion) {
      return reply.status(404).send({
        code:     ErrorCode.NOT_FOUND,
        message:  '陪玩师不存在',
        errorKey: 'NOT_FOUND',
      })
    }

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    companion,
    })
  })

  /**
   * POST /api/admin/companions/:id/audit
   * 审核陪玩师（通过/拒绝）
   * 权限：super_admin, operator
   */
  app.post<{ Params: { id: string } }>('/api/admin/companions/:id/audit', {
    preHandler: [authenticateAdmin, requireAdminRole('super_admin', 'operator')],
  }, async (request, reply) => {
    const parseResult = z.object({
      action: z.enum(['approved', 'rejected']),
      reason: z.string().max(500).optional(),
      note:   z.string().max(500).optional(),
    }).safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { id } = request.params
    const { action, reason, note } = parseResult.data
    const adminId = request.currentAdmin!.id

    // 拒绝时 reason 必填
    if (action === 'rejected' && !reason) {
      return reply.status(400).send({
        code:     ErrorCode.VALIDATION_ERROR,
        message:  '拒绝时必须填写原因',
        errorKey: 'VALIDATION_ERROR',
      })
    }

    const companion = await prisma.companion.findUnique({
      where: { id },
      select: { id: true, audit_status: true },
    })
    if (!companion) {
      return reply.status(404).send({
        code:     ErrorCode.NOT_FOUND,
        message:  '陪玩师不存在',
        errorKey: 'NOT_FOUND',
      })
    }

    // 已审核过的不能重复审核（只有 pending 才能审核）
    if (companion.audit_status !== 'pending') {
      return reply.status(400).send({
        code:     ErrorCode.VALIDATION_ERROR,
        message:  '该陪玩师已审核，不能重复操作',
        errorKey: 'VALIDATION_ERROR',
      })
    }

    await prisma.$transaction([
      prisma.companion.update({
        where: { id },
        data: {
          audit_status:  action,
          reject_reason: action === 'rejected' ? reason : null,
          verified_by:   adminId,
          verified_at:   new Date(),
        },
      }),
      prisma.companionAuditRecord.create({
        data: {
          companion_id: id,
          admin_id:     adminId,
          action,
          reason,
          note,
        },
      }),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: action === 'approved' ? '审核已通过' : '已拒绝',
      data:    null,
    })
  })

  /**
   * GET /api/admin/companions/:id/audit-records
   * 审核历史记录
   */
  app.get<{ Params: { id: string } }>('/api/admin/companions/:id/audit-records', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const { id } = request.params

    const exists = await prisma.companion.findUnique({ where: { id }, select: { id: true } })
    if (!exists) {
      return reply.status(404).send({
        code:     ErrorCode.NOT_FOUND,
        message:  '陪玩师不存在',
        errorKey: 'NOT_FOUND',
      })
    }

    const records = await prisma.companionAuditRecord.findMany({
      where:   { companion_id: id },
      orderBy: { created_at: 'desc' },
      include: {
        admin_user: { select: { id: true, username: true, display_name: true } },
      },
    })

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    records,
    })
  })
}
