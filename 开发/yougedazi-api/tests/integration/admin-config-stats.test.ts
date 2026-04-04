import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createAdmin } from '../helpers/db'
import { signAdminToken } from '../helpers/auth'
import type { FastifyInstance } from 'fastify'

describe('Admin 配置 & 统计 & 公告', () => {
  let app: FastifyInstance
  let adminToken: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const admin = await createAdmin()
    adminToken = signAdminToken(admin.id)
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('GET /api/admin/stats', () => {
    it('应返回平台统计概览', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/stats',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.realtime).toBeDefined()
      expect(body.data.today).toBeDefined()
      expect(body.data.totals).toBeDefined()
      expect(Array.isArray(body.data.trend)).toBe(true)
    })

    it('指定 days 参数应正常返回', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/stats?days=30',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/admin/stats' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/admin/platform-configs', () => {
    it('应返回平台配置列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/platform-configs',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(Array.isArray(body.data)).toBe(true)
    })
  })

  describe('PUT /api/admin/platform-configs/:key', () => {
    it('应成功创建/更新平台配置', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/platform-configs/commission_rate',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { config_value: 0.2, description: '平台抽佣比例20%' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.config_key).toBe('commission_rate')
    })
  })

  describe('GET /api/admin/configs', () => {
    it('应返回所有系统配置', async () => {
      // 先写入一个配置
      await app.inject({
        method: 'POST',
        url: '/api/admin/configs',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { key: 'test_config', value: { enabled: true }, description: '测试配置' },
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/configs',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.configs).toBeDefined()
      expect(Array.isArray(body.data.list)).toBe(true)
    })
  })

  describe('POST /api/admin/configs', () => {
    it('应成功创建配置', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/configs',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { key: 'max_order_duration', value: { hours: 8 }, description: '最大订单时长' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.key).toBe('max_order_duration')
    })
  })

  describe('GET /api/admin/configs/:key', () => {
    it('应返回指定配置', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/configs/max_order_duration',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.key).toBe('max_order_duration')
    })

    it('查询不存在的配置应返回 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/configs/nonexistent_key',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('POST /api/admin/configs/batch', () => {
    it('应成功批量保存配置', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/configs/batch',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {
          configs: {
            min_deposit: { amount: 10000 },
            max_withdraw: { amount: 500000 },
          },
        },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.saved_count).toBe(2)
    })
  })

  describe('DELETE /api/admin/configs/:key', () => {
    it('超级管理员应成功删除配置', async () => {
      // 先确保配置存在
      await app.inject({
        method: 'POST',
        url: '/api/admin/configs',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { key: 'delete_me', value: {} },
      })

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/configs/delete_me',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
    })

    it('删除不存在的配置应返回 404', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/admin/configs/nonexistent_config',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('GET /api/admin/announcements', () => {
    it('应返回公告列表（全量含未激活）', async () => {
      // 先创建一条公告
      await app.inject({
        method: 'POST',
        url: '/api/admin/announcements',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { title: '测试公告', content: '公告内容正文', target_audience: 'all' },
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/announcements',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(Array.isArray(body.data)).toBe(true)
      expect(body.data.length).toBeGreaterThan(0)
    })
  })

  describe('POST /api/admin/announcements', () => {
    it('应成功创建公告', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/announcements',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {
          title: '系统维护通知',
          content: '平台将于今晚23:00-24:00进行系统维护，届时服务暂停',
          target_audience: 'all',
          is_active: true,
        },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.title).toBe('系统维护通知')
    })

    it('标题少于2字应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/announcements',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { title: '短', content: '内容', target_audience: 'all' },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
