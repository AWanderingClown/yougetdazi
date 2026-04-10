import { FastifyInstance } from 'fastify'
import { partnerAuthRoutes } from './auth'
import { partnerBSideRoutes } from './b_side'
import { partnerCSideRoutes } from './c_side'

export async function partnerRoutes(app: FastifyInstance) {
  await app.register(partnerAuthRoutes)
  await app.register(partnerBSideRoutes)
  await app.register(partnerCSideRoutes)
}
