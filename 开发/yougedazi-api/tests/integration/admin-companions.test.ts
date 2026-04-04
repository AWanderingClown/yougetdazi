import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createAdmin, createCompanion } from '../helpers/db'
import { signAdminToken } from '../helpers/auth'
import type { FastifyInstance } from 'fastify'

describe('Admin 陪玩师管理', () => {
  let app: FastifyInstance
  let adminToken: string
  let pendingCompanionId: string
  let approvedCompanionId: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const admin = await createAdmin()
    adminToken = signAdminToken(admin.id)

    const pending = await createCompanion({ audit_status: 'pending', nickname: '待审核搭子' })
    pendingCompanionId = pending.id

    const approved = await createCompanion({ audit_status: 'approved', nickname: '已审核搭子' })
    approvedCompanionId = approved.id
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('GET /api/admin/companions', () => {
    it('应返回所有陪玩师列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/companions',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.total).toBeGreaterThanOrEqual(2)
    })

    it('按审核状态筛选 pending 应只返回待审核', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/companions?audit_status=pending',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.list.every((c: any) => c.audit_status === 'pending')).toBe(true)
    })

    it('按关键词搜索应返回匹配陪玩师', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/companions?keyword=待审核',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.list.some((c: any) => c.nickname === '待审核搭子')).toBe(true)
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/admin/companions' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/admin/companions/:id', () => {
    it('应返回陪玩师详情（含服务和审核记录）', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/companions/${pendingCompanionId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.id).toBe(pendingCompanionId)
      expect(Array.isArray(body.data.services)).toBe(true)
      expect(Array.isArray(body.data.audit_records)).toBe(true)
    })

    it('查询不存在的陪玩师应返回 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/companions/${crypto.randomUUID()}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('POST /api/admin/companions/:id/audit', () => {
    it('应成功通过审核', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/companions/${pendingCompanionId}/audit`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { action: 'approved', note: '资料齐全，审核通过' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.message).toBe('审核已通过')
    })

    it('重复审核已审核的陪玩师应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/companions/${pendingCompanionId}/audit`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { action: 'approved' },
      })

      expect(res.statusCode).toBe(400)
    })

    it('拒绝审核时不提供原因应返回 400', async () => {
      const anotherPending = await createCompanion({ audit_status: 'pending' })

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/companions/${anotherPending.id}/audit`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { action: 'rejected' },  // 缺少 reason
      })

      expect(res.statusCode).toBe(400)
    })

    it('应成功拒绝审核并记录原因', async () => {
      const rejectTarget = await createCompanion({ audit_status: 'pending' })

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/companions/${rejectTarget.id}/audit`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { action: 'rejected', reason: '提交资料不完整，请补充身份证信息' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.message).toBe('已拒绝')
    })
  })

  describe('GET /api/admin/companions/:id/audit-records', () => {
    it('应返回审核历史记录', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/companions/${pendingCompanionId}/audit-records`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(Array.isArray(body.data)).toBe(true)
      expect(body.data.length).toBeGreaterThan(0)
    })

    it('查询不存在的陪玩师审核记录应返回 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/companions/${crypto.randomUUID()}/audit-records`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })
})
