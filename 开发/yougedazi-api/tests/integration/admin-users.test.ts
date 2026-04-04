import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createUser, createAdmin, createOrder, createCompanion } from '../helpers/db'
import { signAdminToken } from '../helpers/auth'
import type { FastifyInstance } from 'fastify'

describe('Admin 用户管理', () => {
  let app: FastifyInstance
  let adminToken: string
  let userId: string
  let companionId: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const admin = await createAdmin()
    adminToken = signAdminToken(admin.id)

    const user = await createUser({ nickname: '搜索测试用户' })
    userId = user.id

    const companion = await createCompanion({ audit_status: 'approved' })
    companionId = companion.id

    await createOrder({ user_id: userId, companion_id: companionId, status: 'completed' })
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('GET /api/admin/users', () => {
    it('应返回用户列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.total).toBeGreaterThan(0)
      expect(Array.isArray(body.data.list)).toBe(true)
      // 不应返回 openid
      expect(body.data.list[0].openid).toBeUndefined()
    })

    it('按关键词搜索应返回匹配用户', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/users?keyword=搜索测试',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.list.some((u: any) => u.nickname === '搜索测试用户')).toBe(true)
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/admin/users' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/admin/users/:id', () => {
    it('应返回用户详情', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${userId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.id).toBe(userId)
      expect(body.data.openid).toBeUndefined()
    })

    it('查询不存在的用户应返回 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${crypto.randomUUID()}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('POST /api/admin/users/:id/ban', () => {
    it('应成功封禁用户', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${userId}/ban`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { reason: '违反平台规则，测试封禁' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
    })

    it('重复封禁已封禁用户应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${userId}/ban`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { reason: '再次封禁测试' },
      })

      expect(res.statusCode).toBe(400)
    })

    it('封禁原因少于5字应返回 400', async () => {
      const otherUser = await createUser()
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${otherUser.id}/ban`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { reason: '短' },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('POST /api/admin/users/:id/unban', () => {
    it('应成功解封已封禁用户', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${userId}/unban`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
    })

    it('解封未封禁用户应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${userId}/unban`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /api/admin/users/:id/orders', () => {
    it('应返回用户的订单列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${userId}/orders`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.total).toBeGreaterThan(0)
    })
  })

  describe('GET /api/admin/users/:id/payments', () => {
    it('应返回用户的支付记录', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${userId}/payments`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(Array.isArray(body.data.list)).toBe(true)
    })
  })

  describe('GET /api/admin/users/:id/reviews', () => {
    it('应返回用户的评价记录', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${userId}/reviews`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(Array.isArray(body.data.list)).toBe(true)
    })
  })
})
