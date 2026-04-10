import { FastifyInstance } from 'fastify'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

const TRACKING_BATCH_SIZE = 100

interface TrackingEvent {
  event: string
  category: string
  params?: Record<string, unknown>
  timestamp: number
  userId: string
  sessionId: string
  page: string
  device?: Record<string, unknown>
}

interface TrackingBody {
  events: TrackingEvent[]
}

/**
 * C端埋点路由
 * 接收前端埋点数据并存储到数据库
 * 注意：埋点接口允许匿名上报，不需要登录认证
 */
export async function cTrackingRoutes(app: FastifyInstance) {
  /**
   * POST /api/c/track
   * 埋点上报接口
   * 接收批量埋点事件并存储到数据库
   * 允许匿名访问（不要求登录）
   */
  app.post<{ Body: TrackingBody }>('/api/c/track', async (request, reply) => {
    // 获取当前用户ID（如果已登录）
    const userId = request.currentUser?.id || null
    const { events } = request.body || {}

    if (!events || !Array.isArray(events) || events.length === 0) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '缺少埋点数据',
      })
    }

    try {
      // 批量插入埋点数据（使用原生SQL绕过Prisma模型层问题）
      const values = events.map(event => {
        const eventName = (event.event || 'unknown').replace(/'/g, "''")
        const category = (event.category || 'unknown').replace(/'/g, "''")
        const params = event.params ? JSON.stringify(event.params).replace(/'/g, "''") : null
        const uid = event.userId || userId || ''
        const sid = event.sessionId || ''
        const pg = event.page || ''
        const device = event.device ? JSON.stringify(event.device).replace(/'/g, "''") : null

        return `(gen_random_uuid(), '${eventName}', '${category}', ${params ? `'${params}'` : 'NULL'}::jsonb, '${uid}', '${sid}', '${pg}', ${device ? `'${device}'` : 'NULL'}::jsonb)`
      }).join(', ')

      if (values) {
        await prisma.$executeRawUnsafe(`
          INSERT INTO tracking_events (id, event, category, params, user_id, session_id, page, device_info)
          VALUES ${values}
        `)
      }

      app.log.info(`埋点上报成功，用户: ${userId || '匿名'}, 事件数: ${events.length}`)

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: { count: events.length },
      })
    } catch (err) {
      const error = err as Error
      app.log.error(err, `埋点上报失败: ${error.message}`)
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message || '服务器内部错误',
      })
    }
  })
}