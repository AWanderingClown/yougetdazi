import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireCompanion } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'
import { redis, RedisKey } from '../../lib/redis'

// ============================================================
// Zod 输入验证 Schema
// ============================================================

const ToggleOnlineSchema = z.object({
  is_online: z.boolean(),
})

// ============================================================
// 工具函数
// ============================================================

/**
 * 获取今日开始时间（00:00:00）
 */
function getTodayStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
}

/**
 * 获取今日结束时间（23:59:59）
 */
function getTodayEnd(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
}

// ============================================================
// B端工作台路由
// ============================================================

export async function bWorkbenchRoutes(app: FastifyInstance) {
  /**
   * GET /api/b/workbench
   * 陪玩师工作台首页数据
   * 
   * 返回数据：
   * - 当前状态（is_online, is_working）
   * - 今日统计（今日接单数、今日收益）
   * - 进行中订单（如有）
   * - 服务项目列表
   */
  app.get('/api/b/workbench', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const companionId = request.currentUser!.id

    try {
      // 并行查询：陪玩师基本信息、今日统计、进行中订单
      const [companion, todayStats, ongoingOrder] = await Promise.all([
        // 1. 查询陪玩师状态和基本信息
        prisma.companion.findUnique({
          where: { id: companionId },
          select: {
            id: true,
            is_online: true,
            is_working: true,
            nickname: true,
            avatar: true,
            rating: true,
            total_orders: true,
            deposit_level: true,
            services: {
              where: { is_active: true },
              select: {
                id: true,
                service_name: true,
                hourly_price: true,
                is_active: true,
              },
              orderBy: { created_at: 'desc' },
            },
          },
        }),

        // 2. 统计今日数据
        (async () => {
          const todayStart = getTodayStart()
          const todayEnd = getTodayEnd()

          // 今日接单数（状态为 accepted/serving/completed 且接单时间在今日）
          const orderCount = await prisma.order.count({
            where: {
              companion_id: companionId,
              status: { in: ['accepted', 'serving', 'completed'] },
              created_at: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
          })

          // 今日收益（从 settlements 表读取陪玩师实际到手金额，已扣除平台抽成）
          const earnings = await prisma.settlement.aggregate({
            where: {
              companion_id: companionId,
              type: 'order_income',
              created_at: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
            _sum: {
              amount: true,
            },
          })

          return {
            order_count: orderCount,
            earnings: earnings._sum.amount || 0,
          }
        })(),

        // 3. 查询进行中的订单
        prisma.order.findFirst({
          where: {
            companion_id: companionId,
            status: 'serving',
          },
          select: {
            id: true,
            order_no: true,
            service_name: true,
            service_end_at: true,
            duration: true,
            hourly_price: true,
            total_amount: true,
          },
          orderBy: { service_start_at: 'desc' },
        }),
      ])

      if (!companion) {
        return reply.status(404).send({
          code: ErrorCode.NOT_FOUND,
          message: '陪玩师信息不存在',
          errorKey: 'COMPANION_NOT_FOUND',
        })
      }

      // 计算进行中订单的剩余时间
      let ongoingOrderFormatted = null
      if (ongoingOrder && ongoingOrder.service_end_at) {
        const now = new Date()
        const endAt = new Date(ongoingOrder.service_end_at)
        const remainingMs = endAt.getTime() - now.getTime()
        const remainingMinutes = Math.max(0, Math.ceil(remainingMs / (1000 * 60)))

        ongoingOrderFormatted = {
          id: ongoingOrder.id,
          order_no: ongoingOrder.order_no,
          service_name: ongoingOrder.service_name,
          remaining_minutes: remainingMinutes,
          total_amount: ongoingOrder.total_amount,
        }
      }

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: {
          status: {
            is_online: companion.is_online,
            is_working: companion.is_working,
          },
          profile: {
            nickname: companion.nickname,
            avatar: companion.avatar,
            rating: companion.rating,
            total_orders: companion.total_orders,
            deposit_level: companion.deposit_level,
          },
          today_stats: todayStats,
          ongoing_order: ongoingOrderFormatted,
          services: companion.services.map(service => ({
            service_id: service.id,
            name: service.service_name,
            hourly_price: service.hourly_price,
            is_active: service.is_active,
          })),
        },
      })
    } catch (err) {
      app.log.error(err, '查询工作台数据失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * POST /api/b/workbench/toggle-online
   * 切换在线状态（接单开关）
   * 
   * 限制：is_working=true 时不允许下线
   */
  app.post('/api/b/workbench/toggle-online', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const parseResult = ToggleOnlineSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const companionId = request.currentUser!.id
    const { is_online: targetStatus } = parseResult.data

    try {
      // 1. 查询当前状态
      const companion = await prisma.companion.findUnique({
        where: { id: companionId },
        select: {
          id: true,
          is_online: true,
          is_working: true,
          audit_status: true,
        },
      })

      if (!companion) {
        return reply.status(404).send({
          code: ErrorCode.NOT_FOUND,
          message: '陪玩师信息不存在',
          errorKey: 'COMPANION_NOT_FOUND',
        })
      }

      // 2. 验证：未通过审核不能上线
      if (targetStatus && companion.audit_status !== 'approved') {
        return reply.status(403).send({
          code: ErrorCode.COMPANION_NOT_AUDITED,
          message: '账号尚未通过审核，无法上线',
          errorKey: 'COMPANION_NOT_AUDITED',
        })
      }

      // 3. 验证：服务中不能下线
      if (!targetStatus && companion.is_working) {
        return reply.status(409).send({
          code: ErrorCode.COMPANION_WORKING,
          message: '当前有进行中的订单，无法下线',
          errorKey: 'COMPANION_WORKING',
        })
      }

      // 4. 状态未变化，直接返回
      if (companion.is_online === targetStatus) {
        return reply.status(200).send({
          code: ErrorCode.SUCCESS,
          message: 'ok',
          data: {
            is_online: targetStatus,
            message: targetStatus ? '已上线' : '已下线',
          },
        })
      }

      // 5. 更新状态
      await prisma.companion.update({
        where: { id: companionId },
        data: { is_online: targetStatus },
      })

      // 6. 记录操作日志（可选）
      app.log.info(`陪玩师 ${companionId} 切换状态: ${companion.is_online} -> ${targetStatus}`)

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: {
          is_online: targetStatus,
          message: targetStatus ? '上线成功，开始接单吧' : '下线成功',
        },
      })
    } catch (err) {
      app.log.error(err, '切换在线状态失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * GET /api/b/workbench/services
   * 陪玩师服务项目列表
   */
  app.get('/api/b/workbench/services', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const companionId = request.currentUser!.id

    try {
      const services = await prisma.companionService.findMany({
        where: { companion_id: companionId },
        select: {
          id: true,
          service_name: true,
          hourly_price: true,
          min_duration: true,
          is_active: true,
          description: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: { created_at: 'desc' },
      })

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: { services },
      })
    } catch (err) {
      app.log.error(err, '查询服务项目列表失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * PUT /api/b/workbench/services/:id
   * 更新服务项目（价格、时长）
   */
  app.put<{ Params: { id: string } }>('/api/b/workbench/services/:id', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const parseResult = z.object({
      hourly_price: z.number().int().min(100).optional(),  // 最低 1 元（100分）
      min_duration: z.number().int().min(1).optional(),
      is_active:    z.boolean().optional(),
      description:  z.string().max(200).optional(),
    }).safeParse(request.body)

    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { id } = request.params
    const companionId = request.currentUser!.id
    const updateData = parseResult.data

    try {
      // 验证服务项目归属
      const service = await prisma.companionService.findUnique({
        where: { id },
        select: { companion_id: true },
      })

      if (!service) {
        return reply.status(404).send({
          code: ErrorCode.NOT_FOUND,
          message: '服务项目不存在',
          errorKey: 'SERVICE_NOT_FOUND',
        })
      }

      if (service.companion_id !== companionId) {
        return reply.status(403).send({
          code: ErrorCode.FORBIDDEN,
          message: '无权操作此服务项目',
          errorKey: 'FORBIDDEN',
        })
      }

      // 更新服务项目
      const updated = await prisma.companionService.update({
        where: { id },
        data: updateData,
      })

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: '更新成功',
        data: { service: updated },
      })
    } catch (err) {
      app.log.error(err, '更新服务项目失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })
}
