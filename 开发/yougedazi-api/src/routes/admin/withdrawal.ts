import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin, requireAdminRole } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

// ============================================================
// Admin提现审核路由
// ============================================================

const PaginationSchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
})

const WithdrawQuerySchema = PaginationSchema.extend({
  status: z.enum(['pending', 'approved', 'rejected', 'processing', 'completed', 'failed']).optional(),
})

export async function adminWithdrawalRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/withdrawals
   * 提现申请列表（分页，支持 status 过滤）
   */
  app.get('/api/admin/withdrawals', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = WithdrawQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }
    const { page, page_size, status } = parseResult.data
    const skip = (page - 1) * page_size

    const where: any = {}
    if (status) where.status = status

    const [list, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: page_size,
        include: {
          companion: {
            select: { 
              id: true, 
              nickname: true, 
              avatar: true,
              phone: true,
            },
          },
        },
      }),
      prisma.withdrawal.count({ where }),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        list: list.map(w => ({
          id: w.id,
          companion: w.companion,
          amount: w.amount,
          status: w.status,
          created_at: w.created_at.toISOString(),
          reviewed_at: w.reviewed_at?.toISOString(),
          review_note: w.review_note,
        })),
        total,
        page,
        page_size,
      },
    })
  })

  /**
   * POST /api/admin/withdrawals/:id/approve
   * 通过提现申请
   * 权限：super_admin, finance
   */
  app.post<{ Params: { id: string } }>('/api/admin/withdrawals/:id/approve', {
    preHandler: [authenticateAdmin, requireAdminRole('super_admin', 'finance')],
  }, async (request, reply) => {
    const { id } = request.params
    const adminId = request.currentAdmin!.id

    const parseResult = z.object({
      note: z.string().max(500).optional(),
    }).safeParse(request.body)

    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }

    const { note } = parseResult.data

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. 查询提现申请
        const withdrawal = await tx.withdrawal.findUnique({
          where: { id },
          include: {
            companion: {
              select: { id: true, nickname: true, openid: true },
            },
          },
        })

        if (!withdrawal) {
          throw new Error('WITHDRAWAL_NOT_FOUND')
        }

        if (withdrawal.status !== 'pending') {
          throw new Error('INVALID_STATUS')
        }

        // 2. 更新提现申请状态
        const updated = await tx.withdrawal.update({
          where: { id },
          data: {
            status: 'approved',
            reviewed_by: adminId,
            reviewed_at: new Date(),
            review_note: note,
          },
        })

        // 3. 创建通知（实际项目中应调用通知服务）
        // await notificationService.send(...)

        return updated
      })

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: '提现申请已通过',
        data: result,
      })
    } catch (err: any) {
      if (err.message === 'WITHDRAWAL_NOT_FOUND') {
        return reply.status(404).send({
          code: ErrorCode.NOT_FOUND,
          message: '提现申请不存在',
          errorKey: 'WITHDRAWAL_NOT_FOUND',
        })
      }
      if (err.message === 'INVALID_STATUS') {
        return reply.status(400).send({
          code: ErrorCode.VALIDATION_ERROR,
          message: '该提现申请状态不允许审核',
          errorKey: 'INVALID_STATUS',
        })
      }
      throw err
    }
  })

  /**
   * POST /api/admin/withdrawals/:id/reject
   * 拒绝提现申请
   * 权限：super_admin, finance
   */
  app.post<{ Params: { id: string } }>('/api/admin/withdrawals/:id/reject', {
    preHandler: [authenticateAdmin, requireAdminRole('super_admin', 'finance')],
  }, async (request, reply) => {
    const { id } = request.params
    const adminId = request.currentAdmin!.id

    const parseResult = z.object({
      reason: z.string().min(1, '拒绝原因不能为空').max(500),
    }).safeParse(request.body)

    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { reason } = parseResult.data

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. 查询提现申请
        const withdrawal = await tx.withdrawal.findUnique({
          where: { id },
          include: {
            companion: {
              select: { id: true, deposited_amount: true },
            },
          },
        })

        if (!withdrawal) {
          throw new Error('WITHDRAWAL_NOT_FOUND')
        }

        if (withdrawal.status !== 'pending') {
          throw new Error('INVALID_STATUS')
        }

        // 2. 退还金额到保证金
        await tx.companion.update({
          where: { id: withdrawal.companion_id },
          data: {
            deposited_amount: {
              increment: withdrawal.amount,
            },
          },
        })

        // 3. 记录保证金流水（退还）
        await tx.depositTransaction.create({
          data: {
            companion_id: withdrawal.companion_id,
            type: 'deposit',
            amount: withdrawal.amount,
            balance_after: withdrawal.companion.deposited_amount + withdrawal.amount,
            reason: `提现申请被拒绝: ${reason}`,
            operator_id: adminId,
          },
        })

        // 4. 更新提现申请状态
        const updated = await tx.withdrawal.update({
          where: { id },
          data: {
            status: 'rejected',
            reviewed_by: adminId,
            reviewed_at: new Date(),
            review_note: reason,
          },
        })

        return updated
      })

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: '提现申请已拒绝',
        data: result,
      })
    } catch (err: any) {
      if (err.message === 'WITHDRAWAL_NOT_FOUND') {
        return reply.status(404).send({
          code: ErrorCode.NOT_FOUND,
          message: '提现申请不存在',
          errorKey: 'WITHDRAWAL_NOT_FOUND',
        })
      }
      if (err.message === 'INVALID_STATUS') {
        return reply.status(400).send({
          code: ErrorCode.VALIDATION_ERROR,
          message: '该提现申请状态不允许审核',
          errorKey: 'INVALID_STATUS',
        })
      }
      throw err
    }
  })
}
