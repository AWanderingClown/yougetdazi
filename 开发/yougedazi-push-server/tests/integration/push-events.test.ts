import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { io as ClientIO } from 'socket.io-client'
import jwt from 'jsonwebtoken'
import { setupPushApp } from '../helpers/app'
import type { FastifyInstance } from 'fastify'
import type { Server as SocketServer } from 'socket.io'

describe('Push Server Integration', () => {
  let app: FastifyInstance
  let io: SocketServer
  let userClient: ReturnType<typeof ClientIO>
  let companionClient: ReturnType<typeof ClientIO>
  let adminClient: ReturnType<typeof ClientIO>

  const JWT_SECRET = process.env.JWT_SECRET!
  const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET!
  const PUSH_API_KEY = process.env.PUSH_API_KEY!

  beforeAll(async () => {
    const setup = await setupPushApp()
    app = setup.app
    io = setup.io

    // Start server on a random port for testing
    await app.listen({ port: 0, host: '127.0.0.1' })
    const port = app.server.address()?.port

    const userToken = jwt.sign({ sub: 'user-001', role: 'user', iss: 'ppmate-client' }, JWT_SECRET, { algorithm: 'HS256' })
    const companionToken = jwt.sign({ sub: 'companion-001', role: 'companion', iss: 'ppmate-client' }, JWT_SECRET, { algorithm: 'HS256' })
    const adminToken = jwt.sign({ sub: 'admin-001', role: 'super_admin', iss: 'ppmate-admin' }, ADMIN_JWT_SECRET, { algorithm: 'HS256' })

    userClient = ClientIO(`ws://127.0.0.1:${port}`, {
      transports: ['websocket'],
      auth: { token: userToken },
    })

    companionClient = ClientIO(`ws://127.0.0.1:${port}`, {
      transports: ['websocket'],
      auth: { token: companionToken },
    })

    adminClient = ClientIO(`ws://127.0.0.1:${port}`, {
      transports: ['websocket'],
      auth: { token: adminToken },
    })

    // Wait for connections
    await Promise.all([
      new Promise<void>((resolve) => userClient.on('connect', resolve)),
      new Promise<void>((resolve) => companionClient.on('connect', resolve)),
      new Promise<void>((resolve) => adminClient.on('connect', resolve)),
    ])
  })

  afterAll(async () => {
    userClient?.disconnect()
    companionClient?.disconnect()
    adminClient?.disconnect()
    io?.close()
    await app?.close()
  })

  it('POST /api/push/events 应拒绝无效 API Key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/push/events',
      headers: { 'X-Push-Api-Key': 'invalid-key', 'Content-Type': 'application/json' },
      payload: { events: [], timestamp: new Date().toISOString(), source: 'order_service' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('应向指定 user 推送事件', async () => {
    const received: unknown[] = []
    userClient.on('order:status_changed', (payload) => received.push(payload))

    const port = app.server.address()?.port
    const res = await app.inject({
      method: 'POST',
      url: '/api/push/events',
      headers: { 'X-Push-Api-Key': PUSH_API_KEY, 'Content-Type': 'application/json' },
      payload: {
        events: [
          {
            type: 'order_status_changed',
            targetType: 'user',
            targetId: 'user-001',
            payload: { order_id: 'order-001', status: 'accepted' },
          },
        ],
        timestamp: new Date().toISOString(),
        source: 'order_service',
      },
    })

    expect(res.statusCode).toBe(200)

    // Wait a tick for socket delivery
    await new Promise((r) => setTimeout(r, 200))
    expect(received.length).toBe(1)
    expect((received[0] as any).status).toBe('accepted')
  })

  it('应向指定 companion 推送事件', async () => {
    const received: unknown[] = []
    companionClient.on('order:new', (payload) => received.push(payload))

    const res = await app.inject({
      method: 'POST',
      url: '/api/push/events',
      headers: { 'X-Push-Api-Key': PUSH_API_KEY, 'Content-Type': 'application/json' },
      payload: {
        events: [
          {
            type: 'new_order',
            targetType: 'companion',
            targetId: 'companion-001',
            payload: { order_id: 'order-002' },
          },
        ],
        timestamp: new Date().toISOString(),
        source: 'order_service',
      },
    })

    expect(res.statusCode).toBe(200)
    await new Promise((r) => setTimeout(r, 200))
    expect(received.length).toBe(1)
  })

  it('广播事件应推送给所有在线 companion', async () => {
    const received: unknown[] = []
    companionClient.on('order:new_reward', (payload) => received.push(payload))

    const res = await app.inject({
      method: 'POST',
      url: '/api/push/events',
      headers: { 'X-Push-Api-Key': PUSH_API_KEY, 'Content-Type': 'application/json' },
      payload: {
        events: [
          {
            type: 'new_reward_order',
            targetType: 'broadcast',
            targetId: '',
            payload: { order_id: 'reward-001' },
          },
        ],
        timestamp: new Date().toISOString(),
        source: 'order_service',
      },
    })

    expect(res.statusCode).toBe(200)
    await new Promise((r) => setTimeout(r, 200))
    expect(received.length).toBe(1)
  })

  it('admin_monitor 应收到所有事件抄送', async () => {
    const received: unknown[] = []
    adminClient.on('monitor:batch', (payload) => received.push(payload))

    const res = await app.inject({
      method: 'POST',
      url: '/api/push/events',
      headers: { 'X-Push-Api-Key': PUSH_API_KEY, 'Content-Type': 'application/json' },
      payload: {
        events: [
          {
            type: 'service_started',
            targetType: 'user',
            targetId: 'user-001',
            payload: { order_id: 'order-003' },
          },
        ],
        timestamp: new Date().toISOString(),
        source: 'order_service',
      },
    })

    expect(res.statusCode).toBe(200)
    await new Promise((r) => setTimeout(r, 200))
    expect(received.length).toBeGreaterThan(0)
    const last = received[received.length - 1] as any
    expect(last.events[0].type).toBe('service_started')
  })
})
