import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

export async function setupApp(): Promise<FastifyInstance> {
  const app = await buildApp()
  await app.ready()
  return app
}
