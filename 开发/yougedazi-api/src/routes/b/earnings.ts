import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireCompanion } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

// ============================================================
// Zod 输入验证 Schema
// ============================================================

const EarningsRecordQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  page_size:  z.coerce.number().int().min(1).max(50).default(20),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type:       z.enum(['order_income', 'bonus', 'penalty', 'refund']).optional(),
})

// ============================================================
// B端收益路由
// ============================================================

export async function bEarningsRoutes(app: FastifyInstance) {
  /**
   * GET /api/b/earnings
   * 陪玩师收益概览（今日/本周/本月/累计）
   * 
   * 功能：
   * - 获取陪玩师收益统计数据
   * - 今日、本周、本月、累计收益
   * - 从settlements表聚合计算
   */
  app.get('/api/b/earnings', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const companionId = request.currentUser!.id

    // 获取当前时间
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    // 本周开始（周一）
    const weekStart = new Date(today)
    const dayOfWeek = today.getDay() || 7 // 周日为0，转为7
    weekStart.setDate(today.getDate() - dayOfWeek + 1)
    
    // 本月开始
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // 并行查询各时间段的收益
    const [
      todayResult,
      weekResult,
      monthResult,
      totalResult,
      companion,
    ] = await Promise.all([
      // 今日收益
      prisma.settlement.aggregate({
        where: {
          companion_id: companionId,
          created_at: { gte: today },
        },
        _sum: { amount: true },
      }),
      // 本周收益
      prisma.settlement.aggregate({
        where: {
          companion_id: companionId,
          created_at: { gte: weekStart },
        },
        _sum: { amount: true },
      }),
      // 本月收益
      prisma.settlement.aggregate({
        where: {
          companion_id: companionId,
          created_at: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      // 累计收益
      prisma.settlement.aggregate({
        where: { companion_id: companionId },
        _sum: { amount: true },
      }),
      // 陪玩师信息（获取当前余额）
      prisma.companion.findUnique({
        where: { id: companionId },
        select: { deposited_amount: true },
      }),
    ])

    // 计算可提现金额（这里简单使用保证金作为余额，实际业务可能需要单独账户表）
    // 注意：实际业务中可能需要单独的账户余额表，这里假设保证金中的部分是可提现的
    const withdrawable = Math.max(0, (companion?.deposited_amount || 0))

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    {
        today:        todayResult._sum.amount || 0,
        this_week:    weekResult._sum.amount || 0,
        this_month:   monthResult._sum.amount || 0,
        total:        totalResult._sum.amount || 0,
        withdrawable: withdrawable,
      },
    })
  })

  /**
   * GET /api/b/earnings/records
   * 收益明细列表（分页）
   * 
   * 功能：
   * - 获取收益明细列表
   * - 支持日期范围筛选
   * - 支持类型筛选
   * - 从settlements表查询
   */
  app.get('/api/b/earnings/records', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const parseResult = EarningsRecordQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { page, page_size, start_date, end_date, type } = parseResult.data
    const companionId = request.currentUser!.id
    const skip = (page - 1) * page_size

    // 构建查询条件
    const whereCondition: any = {
      companion_id: companionId,
    }

    // 日期范围筛选
    if (start_date || end_date) {
      whereCondition.created_at = {}
      if (start_date) {
        whereCondition.created_at.gte = new Date(start_date)
      }
      if (end_date) {
        // 结束日期加一天，包含当天
        const endDate = new Date(end_date)
        endDate.setDate(endDate.getDate() + 1)
        whereCondition.created_at.lt = endDate
      }
    }

    // 类型筛选
    if (type) {
      whereCondition.type = type
    }

    const [records, total] = await Promise.all([
      prisma.settlement.findMany({
        where: whereCondition,
        orderBy: { created_at: 'desc' },
        skip,
        take: page_size,
      }),
      prisma.settlement.count({
        where: whereCondition,
      }),
    ])

    const formattedRecords = records.map(r => ({
      id:           r.id,
      order_id:     r.order_id,
      order_no:     r.order_no,
      amount:       r.amount,
      type:         r.type,
      description:  r.description,
      created_at:   r.created_at.toISOString(),
      order_info:   r.order_id ? {
        service_name:  r.service_name,
        duration:      r.duration,
        customer_name: r.customer_name,
      } : null,
    }))

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    {
        list:      formattedRecords,
        total,
        page,
        page_size,
        has_more:  skip + records.length < total,
      },
    })
  })

  /**
   * GET /api/b/deposit
   * 查询保证金状态
   * 
   * 功能：
   * - 获取当前保证金等级
   * - 保证金金额
   * - 可接订单类型
   */
  app.get('/api/b/deposit', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const companionId = request.currentUser!.id

    const companion = await prisma.companion.findUnique({
      where: { id: companionId },
      select: {
        deposit_level:    true,
        deposited_amount: true,
      },
    })

    if (!companion) {
      return reply.status(404).send({
        code:     ErrorCode.NOT_FOUND,
        message:  '陪玩师信息不存在',
        errorKey: 'COMPANION_NOT_FOUND',
      })
    }

    // 获取保证金配置
    const depositConfig = await prisma.platformConfig.findUnique({
      where: { config_key: 'deposit_rules' },
    })

    // 默认配置（与 seed.ts 保持一致：0元/200元/500元三档）
    const defaultLevels = [
      {
        level:      'none',
        amount:     0,
        max_orders: 3,
        description: '未缴保证金，每日最多接 3 单',
      },
      {
        level:      'basic',
        amount:     20000, // 200元
        max_orders: 10,
        description: '缴纳 200 元，每日最多接 10 单',
      },
      {
        level:      'premium',
        amount:     50000, // 500元
        max_orders: null,
        description: '缴纳 500 元，无限接单',
      },
    ]

    let levels = defaultLevels
    if (depositConfig?.config_value) {
      try {
        const config = depositConfig.config_value as any
        if (Array.isArray(config.levels)) {
          levels = config.levels
        }
      } catch {
        // 使用默认配置
      }
    }

    // 计算当前等级的最大可接订单金额
    const currentLevelInfo = levels.find(l => l.level === companion.deposit_level) || levels[0]
    const upgradeOptions = levels
      .filter(l => l.amount > companion.deposited_amount)
      .map(l => ({
        level:       l.level,
        amount:      l.amount - companion.deposited_amount, // 需补缴金额
        description: (l as any).description ?? '',
      }))

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    {
        current_level:  companion.deposit_level,
        deposit_amount: companion.deposited_amount,
        max_orders:     (currentLevelInfo as any).max_orders ?? null,
        upgrade_options: upgradeOptions,
      },
    })
  })
}
