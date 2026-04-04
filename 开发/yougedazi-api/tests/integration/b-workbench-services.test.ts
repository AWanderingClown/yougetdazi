import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createCompanion, createCompanionService } from '../helpers/db'
import { signCompanionToken } from '../helpers/auth'
import type { FastifyInstance } from 'fastify'

describe('B端工作台服务项目管理', () => {
  let app: FastifyInstance
  let companionToken: string
  let companionId: string
  let serviceId: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const companion = await createCompanion({ audit_status: 'approved', is_online: true })
    companionId = companion.id
    companionToken = signCompanionToken(companionId)

    const service = await createCompanionService(companionId, { hourly_price: 10000 })
    serviceId = service.id
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('PUT /api/b/workbench/services/:id', () => {
    it('应成功更新服务价格', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/b/workbench/services/${serviceId}`,
        headers: { Authorization: `Bearer ${companionToken}` },
        payload: { hourly_price: 15000 },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      // hourly_price → hourlyPrice (camelCase)，响应嵌套在 data.service 下
      expect(body.data.service.hourlyPrice).toBe(15000)
    })

    it('应成功关闭服务项目', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/b/workbench/services/${serviceId}`,
        headers: { Authorization: `Bearer ${companionToken}` },
        payload: { is_active: false },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.service.isActive).toBe(false)
    })

    it('更新不属于自己的服务应返回 403', async () => {
      const otherCompanion = await createCompanion({ audit_status: 'approved' })
      const otherToken = signCompanionToken(otherCompanion.id)
      const otherService = await createCompanionService(otherCompanion.id)

      const res = await app.inject({
        method: 'PUT',
        url: `/api/b/workbench/services/${otherService.id}`,
        headers: { Authorization: `Bearer ${companionToken}` },
        payload: { hourly_price: 5000 },
      })

      expect(res.statusCode).toBe(403)

      // cleanup
      const _ = otherToken
    })

    it('更新不存在的服务应返回 404', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/b/workbench/services/${crypto.randomUUID()}`,
        headers: { Authorization: `Bearer ${companionToken}` },
        payload: { hourly_price: 5000 },
      })

      expect(res.statusCode).toBe(404)
    })

    it('价格低于最低值应返回 400', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/b/workbench/services/${serviceId}`,
        headers: { Authorization: `Bearer ${companionToken}` },
        payload: { hourly_price: 50 },  // 低于 100（最低1元）
      })

      expect(res.statusCode).toBe(400)
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/b/workbench/services/${serviceId}`,
        payload: { hourly_price: 5000 },
      })
      expect(res.statusCode).toBe(401)
    })
  })
})
