import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createAdmin, createUser, createCompanion, createOrder } from '../helpers/db'
import { signAdminToken } from '../helpers/auth'
import { mockPushServer } from '../helpers/push-mock'
import type { FastifyInstance } from 'fastify'

describe('Admin 订单管理', () => {
  let app: FastifyInstance
  let adminToken: string
  let userId: string
  let companionId: string
  let orderId: string
  let pushMock: ReturnType<typeof mockPushServer>

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()
    pushMock = mockPushServer()

    const admin = await createAdmin()
    adminToken = signAdminToken(admin.id)

    const user = await createUser()
    userId = user.id

    const companion = await createCompanion({ audit_status: 'approved' })
    companionId = companion.id

    const order = await createOrder({ user_id: userId, companion_id: companionId, status: 'accepted', paid_amount: 10000 })
    orderId = order.id
  })

  afterAll(async () => {
    pushMock?.restore()
    await cleanDatabase()
    await app.close()
  })

  describe('GET /api/admin/orders', () => {
    it('应返回所有订单列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/orders',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.total).toBeGreaterThan(0)
      expect(Array.isArray(body.data.list)).toBe(true)
      // 包含关联的用户和陪玩师信息
      expect(body.data.list[0].user).toBeDefined()
      expect(body.data.list[0].companion).toBeDefined()
    })

    it('按状态筛选应只返回对应状态订单', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/orders?status=accepted',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.list.every((o: any) => o.status === 'accepted')).toBe(true)
    })

    it('按用户 ID 筛选应只返回该用户订单', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/orders?user_id=${userId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.list.every((o: any) => o.user_id === userId)).toBe(true)
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/admin/orders' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/admin/orders/:id', () => {
    it('应返回订单详情（含操作日志、支付记录）', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/orders/${orderId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.id).toBe(orderId)
      expect(Array.isArray(body.data.operation_logs)).toBe(true)
      expect(Array.isArray(body.data.payment_records)).toBe(true)
      expect(Array.isArray(body.data.renewals)).toBe(true)
    })

    it('查询不存在的订单应返回 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/orders/${crypto.randomUUID()}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('POST /api/admin/orders/:id/force-cancel', () => {
    it('应成功强制取消订单', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/orders/${orderId}/force-cancel`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { reason: '管理员处理异常订单，强制取消', refund_percent: 100 },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
    })

    it('原因少于5字应返回 400', async () => {
      const order2 = await createOrder({ user_id: userId, companion_id: companionId, status: 'accepted' })

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/orders/${order2.id}/force-cancel`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { reason: '短', refund_percent: 0 },
      })

      expect(res.statusCode).toBe(400)
    })

    it('退款比例不在 0/50/100 应返回 400', async () => {
      const order3 = await createOrder({ user_id: userId, companion_id: companionId, status: 'accepted' })

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/orders/${order3.id}/force-cancel`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { reason: '无效退款比例测试', refund_percent: 30 },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('POST /api/admin/orders/:id/force-complete', () => {
    it('应成功强制完成 serving 状态订单', async () => {
      const servingOrder = await createOrder({ user_id: userId, companion_id: companionId, status: 'serving' })

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/orders/${servingOrder.id}/force-complete`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { reason: '服务超时，管理员强制完成订单' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
    })

    it('强制完成非 serving 订单应返回 400', async () => {
      const pendingOrder = await createOrder({ user_id: userId, companion_id: companionId, status: 'pending_payment' })

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/orders/${pendingOrder.id}/force-complete`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { reason: '测试非serving状态强制完成' },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('PATCH /api/admin/orders/:id/note', () => {
    it('应成功更新订单备注', async () => {
      const noteOrder = await createOrder({ user_id: userId, companion_id: companionId, status: 'completed' })

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/admin/orders/${noteOrder.id}/note`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { admin_note: '已核查，订单正常完成' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
    })
  })
})
