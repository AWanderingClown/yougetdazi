import type { FastifyInstance } from 'fastify'
import { default as app, io } from '../../src/app'

export async function setupPushApp(): Promise<{ app: FastifyInstance; io: typeof import('../../src/app').io }> {
  return { app, io }
}
