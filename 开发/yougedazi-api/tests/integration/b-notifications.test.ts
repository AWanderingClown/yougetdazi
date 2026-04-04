import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createCompanion } from '../helpers/db'
import { signCompanionToken } from '../helpers/auth'
import { prisma } from '../../src/lib/prisma'
import type { FastifyInstance } from 'fastify'

describe('B端通知 & 公告', () => {
  let app: FastifyInstance
  let companionToken: string
  let companionId: string
  let notificationId: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const companion = await createCompanion({ audit_status: 'approved' })
    companionId = companion.id
    companionToken = signCompanionToken(companionId)

    // 创建测试通知
    const notification = await prisma.notification.create({
      data: {
        companion_id: companionId,
        type: 'order',
        title: '新订单通知',
        content: '您有一个新的订单',
        is_read: false,
      },
    })
    notificationId = notification.id

    // 创建已读通知
    await prisma.notification.create({
      data: {
        companion_id: companionId,
        type: 'system',
        title: '系统消息',
        content: '欢迎加入',
        is_read: true,
        read_at: new Date(),
      },
    })

    // 创建 B端公告
    await prisma.announcement.create({
      data: {
        title: 'B端搭子公告',
        content: '搭子端更新公告',
        target_audience: 'companion',
        is_active: true,
        published_at: new Date(Date.now() - 1000),
      },
    })
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('GET /api/b/notifications', () => {
    it('应返回 B端通知列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/notifications',
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.list.length).toBeGreaterThan(0)
      expect(body.data.total).toBeGreaterThan(0)
    })

    it('按未读筛选应只返回未读通知', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/notifications?is_read=false',
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.list.every((n: any) => n.isRead === false)).toBe(true)
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/b/notifications' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/b/notifications/unread-count', () => {
    it('应返回未读通知数量', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/notifications/unread-count',
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(typeof body.data.count).toBe('number')
      expect(body.data.count).toBeGreaterThan(0)
    })
  })

  describe('POST /api/b/notifications/:id/read', () => {
    it('应成功标记通知已读', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/b/notifications/${notificationId}/read`,
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)

      const updated = await prisma.notification.findUnique({ where: { id: notificationId } })
      expect(updated?.is_read).toBe(true)
    })

    it('标记不属于自己的通知应返回 404', async () => {
      const otherCompanion = await createCompanion()
      const otherNotification = await prisma.notification.create({
        data: {
          companion_id: otherCompanion.id,
          type: 'system',
          title: '他人通知',
          content: '内容',
          is_read: false,
        },
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/b/notifications/${otherNotification.id}/read`,
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe('POST /api/b/notifications/read-all', () => {
    it('应标记所有 B端通知已读', async () => {
      // 补充一条未读通知
      await prisma.notification.create({
        data: {
          companion_id: companionId,
          type: 'system',
          title: '审核通过',
          content: '您的资料已审核通过',
          is_read: false,
        },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/b/notifications/read-all',
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(typeof body.data.updatedCount).toBe('number')
    })
  })

  describe('GET /api/b/announcements', () => {
    it('应返回 B端公告列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/announcements',
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(Array.isArray(body.data.list)).toBe(true)
      expect(body.data.list.length).toBeGreaterThan(0)
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/b/announcements' })
      expect(res.statusCode).toBe(401)
    })
  })
})
