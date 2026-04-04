import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createUser, createCompanion, createAdmin, createOrder } from '../helpers/db'
import { signAdminToken, signUserToken, signCompanionToken } from '../helpers/auth'
import type { FastifyInstance } from 'fastify'

describe('Admin 后台 API', () => {
  let app: FastifyInstance
  let adminToken: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const bcrypt = await import('bcrypt')
    const admin = await createAdmin({
      username: 'admin_stats_test',
      password: await bcrypt.hash('Admin@123', 12),
    })
    adminToken = signAdminToken(admin.id)

    const user = await createUser()
    const companion = await createCompanion({ audit_status: 'approved' })
    await createOrder({ user_id: user.id, companion_id: companion.id, status: 'completed' })
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('权限验证', () => {
    it('无 Token 访问 admin 接口应返回 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/orders',
      })
      expect(res.statusCode).toBe(401)
    })

    it('用户 Token 访问 admin 接口应返回 401 或 403', async () => {
      const user = await createUser()
      const userToken = signUserToken(user.id)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/orders',
        headers: { Authorization: `Bearer ${userToken}` },
      })
      // 用 C端 token 访问 admin 接口，应被拒绝
      expect([401, 403]).toContain(res.statusCode)
    })

    it('陪玩师 Token 访问 admin 接口应返回 401 或 403', async () => {
      const companion = await createCompanion()
      const companionToken = signCompanionToken(companion.id)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/orders',
        headers: { Authorization: `Bearer ${companionToken}` },
      })
      expect([401, 403]).toContain(res.statusCode)
    })
  })

  describe('GET /api/admin/orders', () => {
    it('应返回订单列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/orders',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.list.length).toBeGreaterThan(0)
    })
  })

  describe('GET /api/admin/companions', () => {
    it('应返回陪玩师列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/companions',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.list.length).toBeGreaterThan(0)
    })
  })

  describe('GET /api/admin/stats', () => {
    it('应返回平台统计数据', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/stats',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.totals).toBeDefined()
      expect(body.data.today).toBeDefined()
    })
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
      expect(body.data.list).toBeDefined()
    })
  })
})
