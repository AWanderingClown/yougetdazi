import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createUser } from '../helpers/db'
import { signUserToken } from '../helpers/auth'
import { prisma } from '../../src/lib/prisma'
import type { FastifyInstance } from 'fastify'

describe('C端通知 & 公告', () => {
  let app: FastifyInstance
  let userToken: string
  let userId: string
  let notificationId: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const user = await createUser()
    userId = user.id
    userToken = signUserToken(userId)

    // 创建测试通知
    const notification = await prisma.notification.create({
      data: {
        user_id: userId,
        type: 'order',
        title: '订单已接单',
        content: '您的订单已被接受',
        is_read: false,
      },
    })
    notificationId = notification.id

    // 再创建一条已读通知
    await prisma.notification.create({
      data: {
        user_id: userId,
        type: 'system',
        title: '系统通知',
        content: '欢迎使用有个搭子',
        is_read: true,
        read_at: new Date(),
      },
    })

    // 创建公告
    await prisma.announcement.create({
      data: {
        title: '平台公告',
        content: '平台正式上线',
        target_audience: 'all',
        is_active: true,
        published_at: new Date(Date.now() - 1000),
      },
    })
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('GET /api/c/notifications', () => {
    it('应返回通知列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/c/notifications',
        headers: { Authorization: `Bearer ${userToken}` },
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
        url: '/api/c/notifications?is_read=false',
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      // requestFormatter 转 camelCase: is_read → isRead
      expect(body.data.list.every((n: any) => n.isRead === false)).toBe(true)
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/c/notifications' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/c/notifications/unread-count', () => {
    it('应返回未读通知数', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/c/notifications/unread-count',
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(typeof body.data.count).toBe('number')
      expect(body.data.count).toBeGreaterThan(0)
    })
  })

  describe('POST /api/c/notifications/:id/read', () => {
    it('应成功标记通知已读', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/c/notifications/${notificationId}/read`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)

      // 验证数据库已更新
      const updated = await prisma.notification.findUnique({ where: { id: notificationId } })
      expect(updated?.is_read).toBe(true)
    })

    it('标记不属于自己的通知应返回 404', async () => {
      const otherUser = await createUser()
      const otherNotification = await prisma.notification.create({
        data: {
          user_id: otherUser.id,
          type: 'system',
          title: '其他用户通知',
          content: '内容',
          is_read: false,
        },
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/c/notifications/${otherNotification.id}/read`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe('POST /api/c/notifications/read-all', () => {
    it('应标记所有通知已读', async () => {
      // 先创建未读通知
      await prisma.notification.create({
        data: {
          user_id: userId,
          type: 'system',
          title: '新通知',
          content: '内容',
          is_read: false,
        },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/c/notifications/read-all',
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      // updatedCount 经 camelCase 转换
      expect(typeof body.data.updatedCount).toBe('number')
    })
  })

  describe('GET /api/c/announcements', () => {
    it('应返回公告列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/c/announcements',
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(Array.isArray(body.data.list)).toBe(true)
      expect(body.data.list.length).toBeGreaterThan(0)
    })

    it('过期公告不应出现', async () => {
      await prisma.announcement.create({
        data: {
          title: '已过期公告',
          content: '已过期',
          target_audience: 'all',
          is_active: true,
          published_at: new Date(Date.now() - 10000),
          expires_at: new Date(Date.now() - 1000),
        },
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/c/announcements',
        headers: { Authorization: `Bearer ${userToken}` },
      })

      const body = JSON.parse(res.body)
      const titles = body.data.list.map((a: any) => a.title)
      expect(titles).not.toContain('已过期公告')
    })
  })
})
