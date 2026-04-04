import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createUser, createCompanion, createCompanionService, createOrder } from '../helpers/db'
import { signCompanionToken } from '../helpers/auth'
import type { FastifyInstance } from 'fastify'

describe('B端工作流', () => {
  let app: FastifyInstance
  let mainCompanionToken: string
  let mainCompanionId: string
  let userId: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const user = await createUser()
    userId = user.id

    // 主 companion：用于工作台/订单列表/收益/通知等不改变 is_working 的测试
    const companion = await createCompanion({ is_online: true, is_working: false, audit_status: 'approved' })
    mainCompanionId = companion.id
    mainCompanionToken = signCompanionToken(mainCompanionId)

    await createCompanionService(mainCompanionId)
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('GET /api/b/workbench', () => {
    it('应返回工作台数据', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/workbench',
        headers: { Authorization: `Bearer ${mainCompanionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      // 中间件将响应字段转为 camelCase
      expect(body.data.status.isOnline).toBe(true)
      expect(body.data.profile.nickname).toBe('测试搭子')
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/b/workbench' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /api/b/workbench/toggle-online', () => {
    it('应能切换在线状态', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/b/workbench/toggle-online',
        headers: { Authorization: `Bearer ${mainCompanionToken}` },
        payload: { is_online: false },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.isOnline).toBe(false)

      // 恢复在线状态
      await app.inject({
        method: 'POST',
        url: '/api/b/workbench/toggle-online',
        headers: { Authorization: `Bearer ${mainCompanionToken}` },
        payload: { is_online: true },
      })
    })
  })

  describe('GET /api/b/workbench/services', () => {
    it('应返回服务项目列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/workbench/services',
        headers: { Authorization: `Bearer ${mainCompanionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      // 路由返回 { services } 而非 { list }
      expect(Array.isArray(body.data.services)).toBe(true)
    })
  })

  describe('GET /api/b/orders', () => {
    it('应返回订单列表', async () => {
      await createOrder({ user_id: userId, companion_id: mainCompanionId, status: 'completed' })

      const res = await app.inject({
        method: 'GET',
        url: '/api/b/orders',
        headers: { Authorization: `Bearer ${mainCompanionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.list.length).toBeGreaterThan(0)
      expect(body.data.total).toBeGreaterThan(0)
    })

    it('按状态筛选应只返回对应状态', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/orders?status=completed',
        headers: { Authorization: `Bearer ${mainCompanionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.list.every((o: { status: string }) => o.status === 'completed')).toBe(true)
    })
  })

  describe('GET /api/b/orders/grab', () => {
    it('应返回等待抢单列表', async () => {
      await createOrder({ user_id: userId, companion_id: null, status: 'waiting_grab', order_type: 'reward' })

      const res = await app.inject({
        method: 'GET',
        url: '/api/b/orders/grab',
        headers: { Authorization: `Bearer ${mainCompanionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.list.length).toBeGreaterThan(0)
    })
  })

  describe('接单流程', () => {
    it('POST /api/b/orders/:id/accept 应成功接直单', async () => {
      // 每个需要 acquireCompanionLock 的测试使用独立 companion，避免 is_working 状态污染
      const acceptCompanion = await createCompanion({ is_online: true, is_working: false, audit_status: 'approved' })
      const acceptToken = signCompanionToken(acceptCompanion.id)

      const order = await createOrder({
        user_id: userId,
        companion_id: acceptCompanion.id,
        status: 'pending_accept',
        order_type: 'direct',
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/b/orders/${order.id}/accept`,
        headers: { Authorization: `Bearer ${acceptToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.message).toBe('接单成功')
    })

    it('POST /api/b/orders/:id/grab 应成功抢悬赏单', async () => {
      // 独立 companion，避免 is_working 状态污染
      const grabCompanion = await createCompanion({ is_online: true, is_working: false, audit_status: 'approved' })
      const grabToken = signCompanionToken(grabCompanion.id)

      const order = await createOrder({
        user_id: userId,
        companion_id: null,
        status: 'waiting_grab',
        order_type: 'reward',
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/b/orders/${order.id}/grab`,
        headers: { Authorization: `Bearer ${grabToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.message).toBe('抢单成功')
    })
  })

  describe('服务流程（按状态机顺序 accepted→serving→completed）', () => {
    it('应完整走完服务状态机，timer 在服务开始后有值', async () => {
      // 独立 companion 用于服务流程测试
      const serviceCompanion = await createCompanion({ is_online: true, is_working: false, audit_status: 'approved' })
      const serviceToken = signCompanionToken(serviceCompanion.id)

      // Step 1: 创建 accepted 状态订单（模拟已接单）
      const order = await createOrder({
        user_id: userId,
        companion_id: serviceCompanion.id,
        status: 'accepted',
      })

      // Step 2: 开始服务 accepted → serving
      const startRes = await app.inject({
        method: 'POST',
        url: `/api/b/orders/${order.id}/start`,
        headers: { Authorization: `Bearer ${serviceToken}` },
      })
      expect(startRes.statusCode).toBe(200)
      expect(JSON.parse(startRes.body).message).toBe('服务已开始')

      // Step 3: 查询 timer（服务开始后 Redis 有倒计时，remainingSeconds 为数字）
      const timerRes = await app.inject({
        method: 'GET',
        url: `/api/b/orders/${order.id}/timer`,
        headers: { Authorization: `Bearer ${serviceToken}` },
      })
      expect(timerRes.statusCode).toBe(200)
      const timerBody = JSON.parse(timerRes.body)
      expect(timerBody.code).toBe(0)
      // startService 写入 Redis，remainingSeconds 应为正整数
      expect(typeof timerBody.data.remainingSeconds).toBe('number')
      expect(timerBody.data.remainingSeconds).toBeGreaterThan(0)

      // Step 4: 完成服务 serving → completed
      const completeRes = await app.inject({
        method: 'POST',
        url: `/api/b/orders/${order.id}/complete`,
        headers: { Authorization: `Bearer ${serviceToken}` },
      })
      expect(completeRes.statusCode).toBe(200)
      expect(JSON.parse(completeRes.body).message).toBe('服务已完成')
    })
  })

  describe('GET /api/b/earnings', () => {
    it('应返回收益概览', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/earnings',
        headers: { Authorization: `Bearer ${mainCompanionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data).toBeDefined()
    })
  })

  describe('GET /api/b/earnings/records', () => {
    it('应返回收益明细列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/earnings/records',
        headers: { Authorization: `Bearer ${mainCompanionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.list).toBeDefined()
    })
  })

  describe('GET /api/b/notifications', () => {
    it('应返回通知列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/notifications',
        headers: { Authorization: `Bearer ${mainCompanionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.list).toBeDefined()
    })
  })

  describe('GET /api/b/notifications/unread-count', () => {
    it('应返回未读通知数', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/notifications/unread-count',
        headers: { Authorization: `Bearer ${mainCompanionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(typeof body.data.count).toBe('number')
    })
  })

  describe('GET /api/b/profile/status', () => {
    it('应返回审核状态', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/profile/status',
        headers: { Authorization: `Bearer ${mainCompanionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.auditStatus).toBe('approved')
    })
  })
})
