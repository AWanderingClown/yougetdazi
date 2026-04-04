import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireCompanion } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

// ============================================================
// B端提现路由 - 安全修复：后端计算金额，前端只申请
// ============================================================

const WithdrawalListQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20),
  status:    z.enum(['pending', 'approved', 'rejected', 'processing', 'completed', 'failed']).optional(),
})

export async function bWithdrawalRoutes(app: FastifyInstance) {
  /**
   * POST /api/b/withdrawals
   * 申请提现
   * 
   * 安全修复：
   * - 前端不传递金额，后端根据可提现余额计算
   * - 添加提现额度校验（最小100元，最大50000元）
   * - 检查是否有待审核的提现申请
   */
  app.post('/api/b/withdrawals', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const companionId = request.currentUser!.id
    
    // 配置
    const MIN_WITHDRAW = 10000      // 最小提现100元（分）
    const MAX_WITHDRAW = 5000000    // 最大提现50000元（分）
    
    try {
      // 使用事务确保数据一致性
      const result = await prisma.$transaction(async (tx) => {
        // 1. 获取陪玩师信息和可提现余额
        const companion = await tx.companion.findUnique({
          where: { id: companionId },
          select: { 
            id: true, 
            deposited_amount: true,
            openid: true,
          },
        })
        
        if (!companion) {
          throw new Error('COMPANION_NOT_FOUND')
        }
        
        // 2. 检查是否有待审核或处理中的提现申请
        const pendingWithdrawal = await tx.withdrawal.findFirst({
          where: {
            companion_id: companionId,
            status: { in: ['pending', 'processing'] },
          },
        })
        
        if (pendingWithdrawal) {
          throw new Error('PENDING_WITHDRAWAL_EXISTS')
        }
        
        // 3. 计算可提现金额（使用保证金作为可提现余额）
        const withdrawableAmount = Math.max(0, companion.deposited_amount)
        
        // 4. 校验提现额度
        if (withdrawableAmount < MIN_WITHDRAW) {
          throw new Error('INSUFFICIENT_BALANCE')
        }
        
        // 5. 确定实际提现金额（不能超过最大限制）
        const actualAmount = Math.min(withdrawableAmount, MAX_WITHDRAW)
        
        // 6. 创建提现申请
        const withdrawal = await tx.withdrawal.create({
          data: {
            companion_id: companionId,
            amount: actualAmount,
            status: 'pending',
          },
        })
        
        // 7. 冻结相应金额（从保证金中扣除）
        await tx.companion.update({
          where: { id: companionId },
          data: {
            deposited_amount: {
              decrement: actualAmount,
            },
          },
        })
        
        // 8. 记录保证金流水
        await tx.depositTransaction.create({
          data: {
            companion_id: companionId,
            type: 'refund',
            amount: actualAmount,
            balance_after: companion.deposited_amount - actualAmount,
            reason: '提现申请',
          },
        })
        
        return {
          withdrawal_id: withdrawal.id,
          amount: actualAmount,
          status: 'pending',
        }
      })
      
      return reply.status(201).send({
        code: ErrorCode.SUCCESS,
        message: '提现申请已提交',
        data: result,
      })
    } catch (err: any) {
      if (err.message === 'COMPANION_NOT_FOUND') {
        return reply.status(404).send({
          code: ErrorCode.NOT_FOUND,
          message: '陪玩师信息不存在',
          errorKey: 'COMPANION_NOT_FOUND',
        })
      }
      if (err.message === 'PENDING_WITHDRAWAL_EXISTS') {
        return reply.status(400).send({
          code: ErrorCode.VALIDATION_ERROR,
          message: '您有正在处理中的提现申请，请等待审核完成后再申请',
          errorKey: 'PENDING_WITHDRAWAL_EXISTS',
        })
      }
      if (err.message === 'INSUFFICIENT_BALANCE') {
        return reply.status(400).send({
          code: ErrorCode.VALIDATION_ERROR,
          message: '可提现余额不足，最低提现金额为100元',
          errorKey: 'INSUFFICIENT_BALANCE',
        })
      }
      throw err
    }
  })
  
  /**
   * GET /api/b/withdrawals
   * 查询提现记录列表
   */
  app.get('/api/b/withdrawals', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const parseResult = WithdrawalListQuerySchema.safeParse(request.query)
    
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }
    
    const { page, page_size, status } = parseResult.data
    const companionId = request.currentUser!.id
    const skip = (page - 1) * page_size
    
    const whereCondition: any = { companion_id: companionId }
    if (status) {
      whereCondition.status = status
    }
    
    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where: whereCondition,
        orderBy: { created_at: 'desc' },
        skip,
        take: page_size,
        select: {
          id: true,
          amount: true,
          status: true,
          reviewed_at: true,
          review_note: true,
          fail_reason: true,
          created_at: true,
        },
      }),
      prisma.withdrawal.count({ where: whereCondition }),
    ])
    
    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    {
        list: withdrawals.map(w => ({
          ...w,
          amount: w.amount,
          created_at: w.created_at.toISOString(),
          reviewed_at: w.reviewed_at?.toISOString(),
        })),
        total,
        page,
        page_size,
        has_more: skip + withdrawals.length < total,
      },
    })
  })
}
