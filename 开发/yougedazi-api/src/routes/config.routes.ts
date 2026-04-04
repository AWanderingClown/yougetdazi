import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { authenticateAdmin } from '../middleware/admin-auth.js'
import { configService, BusinessRulesSchema } from '../services/config.service.js'
import { ErrorCode } from '../types/index.js'

/**
 * 系统配置路由
 * 包括C端业务规则、地图Key等配置项
 */
export default async function configRoutes(app: FastifyInstance) {
  /**
   * GET /api/config/business-rules
   * 获取C端业务规则配置（动态）
   *
   * 功能：
   * - 返回订单限制、预约范围、地理阈值、定价等规则
   * - 可被C端和B端调用
   * - 需要登陆认证
   */
  app.get(
    '/api/config/business-rules',
    { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { rules, version, updatedAt } = await configService.getBusinessRules()

        return reply.send({
          code: ErrorCode.SUCCESS,
          message: 'ok',
          data: {
            order_limits: rules.order_limits,
            appointment: rules.appointment,
            geography: rules.geography,
            pricing: rules.pricing,
            version,
            updated_at: updatedAt
          }
        })
      } catch (error) {
        app.log.error('获取业务规则失败', error)
        return reply.status(500).send({
          code: ErrorCode.INTERNAL_ERROR,
          message: '获取配置失败',
          errorKey: 'CONFIG_FETCH_FAILED'
        })
      }
    }
  )

  /**
   * POST /api/admin/config/business-rules
   * 更新C端业务规则配置（管理员）
   *
   * 请求体：
   * {
   *   "order_limits": { "max_service_duration_hours": 24, "min_hourly_rate": 20 },
   *   "appointment": { "range_days": 7 },
   *   "geography": { "distance_display_threshold": 1000 },
   *   "pricing": { "platform_commission": 0.2 },
   *   "version": "..." (可选，用于并发控制)
   * }
   */
  app.post(
    '/api/admin/config/business-rules',
    { preHandler: [authenticateAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as Record<string, unknown>
        const adminId = request.currentAdmin?.id

        // 提取和验证规则数据
        const { version, ...rules } = body
        const validation = BusinessRulesSchema.safeParse(rules)

        if (!validation.success) {
          const errors = validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
          return reply.status(400).send({
            code: ErrorCode.VALIDATION_ERROR,
            message: `规则验证失败: ${errors}`,
            errorKey: 'INVALID_RULES'
          })
        }

        // 调用service更新（传入version支持并发控制）
        await configService.updateBusinessRules(validation.data, adminId, version as string | undefined)

        return reply.send({
          code: ErrorCode.SUCCESS,
          message: '配置已更新',
          data: { version }
        })
      } catch (error) {
        // 区分错误类型
        if (error instanceof Error) {
          if (error.message.includes('并发冲突')) {
            app.log.warn('配置更新并发冲突', { adminId: request.currentAdmin?.id })
            return reply.status(409).send({
              code: ErrorCode.CONFLICT,
              message: error.message,
              errorKey: 'CONCURRENT_UPDATE_CONFLICT'
            })
          }
          if (error.message.includes('验证失败')) {
            return reply.status(400).send({
              code: ErrorCode.VALIDATION_ERROR,
              message: error.message,
              errorKey: 'VALIDATION_FAILED'
            })
          }
        }

        app.log.error({ err: error }, '更新业务规则失败')
        return reply.status(500).send({
          code: ErrorCode.INTERNAL_ERROR,
          message: '更新配置失败',
          errorKey: 'CONFIG_UPDATE_FAILED'
        })
      }
    }
  )
}
