import { FastifyInstance } from 'fastify'
import { bOrderRoutes } from './orders'
import { bWorkbenchRoutes } from './workbench'
import { bEarningsRoutes } from './earnings'
import { bNotificationRoutes } from './notifications'
import { bProfileRoutes } from './profile'
import { bWithdrawalRoutes } from './withdrawal'

/**
 * B端路由聚合入口
 * 所有路由均需 authenticate + requireCompanion 守卫
 */
export async function bRoutes(app: FastifyInstance) {
  await app.register(bOrderRoutes)
  await app.register(bWorkbenchRoutes)
  await app.register(bEarningsRoutes)
  await app.register(bNotificationRoutes)
  await app.register(bProfileRoutes)
  await app.register(bWithdrawalRoutes)
}
