import { FastifyInstance } from 'fastify'
import { adminOrderRoutes } from './orders'
import { adminCompanionRoutes } from './dazis'
import { adminUserRoutes } from './users'
import { adminStatsRoutes } from './stats'
import { adminFinanceRoutes } from './finance'
import { adminWithdrawalRoutes } from './withdrawal'
import { adminBlacklistRoutes } from './blacklist'
import { adminPermissionsRoutes } from './permissions'
import { adminRolesRoutes } from './roles'
import { adminMessagesRoutes } from './messages'
import { configRoutes } from './config'
import { adminAnnouncementRoutes } from './announcements'

/**
 * Admin 路由聚合入口
 * 所有路由均需 authenticateAdmin 守卫
 * 各细分路由内部按操作类型叠加 requireAdminRole
 */
export async function adminRoutes(app: FastifyInstance) {
  await app.register(adminOrderRoutes)
  await app.register(adminCompanionRoutes)
  await app.register(adminUserRoutes)
  await app.register(adminStatsRoutes)
  await app.register(adminFinanceRoutes)
  await app.register(adminWithdrawalRoutes)
  await app.register(adminBlacklistRoutes)
  await app.register(adminPermissionsRoutes)
  await app.register(adminRolesRoutes)
  await app.register(adminMessagesRoutes)
  await app.register(configRoutes)
  await app.register(adminAnnouncementRoutes)
}
