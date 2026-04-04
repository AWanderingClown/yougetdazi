import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createUser, createCompanion, createCompanionService } from '../helpers/db'
import { signUserToken } from '../helpers/auth'
import type { FastifyInstance } from 'fastify'

describe('C端陪玩师浏览', () => {
  let app: FastifyInstance
  let userToken: string
  let approvedCompanionId: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const user = await createUser()
    userToken = signUserToken(user.id)

    const companion = await createCompanion({ audit_status: 'approved', is_online: true })
    approvedCompanionId = companion.id
    await createCompanionService(approvedCompanionId, { hourly_price: 5000 })

    // 未审核的搭子（不应出现在列表中）
    await createCompanion({ audit_status: 'pending' })
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('GET /api/c/companions', () => {
    it('应返回已审核的陪玩师列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/c/companions',
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      // requestFormatter 转 camelCase
      expect(body.data.list).toBeDefined()
      expect(body.data.total).toBeGreaterThan(0)
      // 只有 approved 的才出现
      expect(body.data.list.every((c: any) => c.auditStatus === undefined)).toBe(true)
    })

    it('按在线状态筛选应只返回在线陪玩师', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/c/companions?is_online=true',
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.list.every((c: any) => c.isOnline === true)).toBe(true)
    })

    it('应支持分页参数', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/c/companions?page=1&page_size=5',
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.page).toBe(1)
      expect(body.data.pageSize).toBe(5)
      expect(body.data.hasMore).toBeDefined()
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/c/companions' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/c/companions/:id', () => {
    it('应返回陪玩师详情（含服务项目）', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/c/companions/${approvedCompanionId}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.id).toBe(approvedCompanionId)
      expect(Array.isArray(body.data.services)).toBe(true)
      expect(Array.isArray(body.data.recentReviews)).toBe(true)
    })

    it('查询未审核的陪玩师应返回 404', async () => {
      const pendingCompanion = await createCompanion({ audit_status: 'pending' })

      const res = await app.inject({
        method: 'GET',
        url: `/api/c/companions/${pendingCompanion.id}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(404)
      const body = JSON.parse(res.body)
      expect(body.errorKey).toBe('COMPANION_NOT_FOUND')
    })

    it('查询不存在的陪玩师应返回 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/c/companions/${crypto.randomUUID()}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(404)
    })
  })
})
