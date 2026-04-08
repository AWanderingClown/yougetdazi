import { FastifyInstance } from 'fastify'
import { cOrderRoutes } from './orders'
import { cCompanionRoutes } from './dazis'
import { cMessageRoutes } from './messages'
import { cNotificationRoutes } from './notifications'
import { cAnnouncementRoutes } from './announcements'
import { cTrackingRoutes } from './tracking'

/**
 * C端路由聚合入口
 * 所有路由均需 authenticate + requireUser 守卫
 */
export async function cRoutes(app: FastifyInstance) {
  await app.register(cOrderRoutes)
  await app.register(cCompanionRoutes)
  await app.register(cMessageRoutes)
  await app.register(cNotificationRoutes)
  await app.register(cAnnouncementRoutes)
  await app.register(cTrackingRoutes)
}
