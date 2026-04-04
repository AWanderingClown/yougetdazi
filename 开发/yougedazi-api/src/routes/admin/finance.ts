import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

// ============================================================
// 分页 Schema（所有财务接口复用）
// ============================================================

const PaginationSchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
})

const WithdrawQuerySchema = PaginationSchema.extend({
  status: z.string().optional(),
})

// ============================================================
// Admin 财务相关路由
// ============================================================

export async function adminFinanceRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/withdraws
   * 提现申请列表（分页，支持 status 过滤）
   * 注：schema 中暂无 Withdrawal 表，返回空列表
   */
  app.get('/api/admin/withdraws', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = WithdrawQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }
    const { page, page_size } = parseResult.data

    // Withdrawal 表暂未在 schema 中定义，返回空列表占位
    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        list:      [],
        total:     0,
        page,
        page_size,
      },
    })
  })

  /**
   * GET /api/admin/refunds
   * 退款记录列表（分页）
   * 对应 refund_records 表（RefundRecord model）
   */
  app.get('/api/admin/refunds', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = PaginationSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }
    const { page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const [list, total] = await Promise.all([
      prisma.refundRecord.findMany({
        orderBy: { created_at: 'desc' },
        skip,
        take: page_size,
        include: {
          payment: {
            select: { order_id: true, out_trade_no: true, amount: true },
          },
        },
      }),
      prisma.refundRecord.count(),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        list,
        total,
        page,
        page_size,
      },
    })
  })

  /**
   * GET /api/admin/finance/records
   * 财务流水列表（分页）
   * 对应 settlements 表（Settlement model）
   */
  app.get('/api/admin/finance/records', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = PaginationSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }
    const { page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const [list, total] = await Promise.all([
      prisma.settlement.findMany({
        orderBy: { created_at: 'desc' },
        skip,
        take: page_size,
        include: {
          companion: {
            select: { id: true, nickname: true, avatar: true },
          },
        },
      }),
      prisma.settlement.count(),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        list,
        total,
        page,
        page_size,
      },
    })
  })

  /**
   * GET /api/admin/deposits
   * 保证金记录列表（分页）
   * 对应 deposit_transactions 表（DepositTransaction model）
   */
  app.get('/api/admin/deposits', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = PaginationSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }
    const { page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const [list, total] = await Promise.all([
      prisma.depositTransaction.findMany({
        orderBy: { created_at: 'desc' },
        skip,
        take: page_size,
        include: {
          companion: {
            select: { id: true, nickname: true, avatar: true },
          },
        },
      }),
      prisma.depositTransaction.count(),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        list,
        total,
        page,
        page_size,
      },
    })
  })

  /**
   * GET /api/admin/payment-records
   * 支付记录列表（分页）
   * 对应 payment_records 表（PaymentRecord model）
   */
  app.get('/api/admin/payment-records', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = PaginationSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }
    const { page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const [list, total] = await Promise.all([
      prisma.paymentRecord.findMany({
        orderBy: { created_at: 'desc' },
        skip,
        take: page_size,
        include: {
          order: {
            select: { order_no: true, user_id: true, companion_id: true, service_name: true },
          },
        },
      }),
      prisma.paymentRecord.count(),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        list,
        total,
        page,
        page_size,
      },
    })
  })
}
