import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createUser, createCompanion, createCompanionService, createOrder } from '../helpers/db'
import { signUserToken } from '../helpers/auth'
import { mockPushServer } from '../helpers/push-mock'
import { prisma } from '../../src/lib/prisma'
import type { FastifyInstance } from 'fastify'

describe('C端订单流程', () => {
  let app: FastifyInstance
  let userToken: string
  let userId: string
  let companionId: string
  let serviceId: string
  let pushMock: ReturnType<typeof mockPushServer>

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()
    pushMock = mockPushServer()

    const user = await createUser()
    userId = user.id
    userToken = signUserToken(userId)

    const companion = await createCompanion({ is_online: true, audit_status: 'approved' })
    companionId = companion.id

    const service = await createCompanionService(companionId, { hourly_price: 10000 })
    serviceId = service.id
  })

  afterAll(async () => {
    pushMock?.restore()
    await cleanDatabase()
    await app.close()
  })

  describe('POST /api/c/orders', () => {
    it('应成功创建直单并返回 mock 支付参数', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/c/orders',
        headers: { Authorization: `Bearer ${userToken}` },
        payload: {
          companion_id: companionId,
          service_id: serviceId,
          order_type: 'direct',
          duration: 2,
        },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      // 订单嵌套在 data.order 下，状态字段无下划线不变
      expect(body.data.order.status).toBe('pending_payment')
      // 响应字段转为 camelCase
      expect(body.data.totalAmount).toBe(20000)
      expect(body.data.paymentParams.prepayId).toMatch(/^mock_/)
    })

    it('应成功创建悬赏单', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/c/orders',
        headers: { Authorization: `Bearer ${userToken}` },
        payload: {
          service_id: serviceId,
          order_type: 'reward',
          duration: 1,
        },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      // 订单嵌套在 data.order 下，order_type → orderType
      expect(body.data.order.orderType).toBe('reward')
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/c/orders',
        payload: { companion_id: companionId, service_id: serviceId, order_type: 'direct', duration: 1 },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/c/orders', () => {
    it('应返回当前用户的订单列表', async () => {
      await createOrder({ user_id: userId, status: 'serving', companion_id: companionId })

      const res = await app.inject({
        method: 'GET',
        url: '/api/c/orders',
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.list.length).toBeGreaterThan(0)
    })
  })

  describe('GET /api/c/orders/:id', () => {
    it('应返回订单详情', async () => {
      const order = await createOrder({ user_id: userId, status: 'accepted', companion_id: companionId })

      const res = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.id).toBe(order.id)
    })

    it('查看其他用户订单应返回 403', async () => {
      const otherUser = await createUser()
      const order = await createOrder({ user_id: otherUser.id, status: 'pending_payment' })

      const res = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(403)
    })
  })

  describe('GET /api/c/orders/:id/timer', () => {
    it('serving 订单应返回剩余时间（可能为 null 若未经过 startService）', async () => {
      const order = await createOrder({ user_id: userId, status: 'serving', companion_id: companionId })

      const res = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}/timer`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      // 直接写库创建的 serving 订单无 Redis key，remainingSeconds 为 null
      // 通过 startService 创建的订单 remainingSeconds 为正整数
      expect(body.data.remainingSeconds === null || typeof body.data.remainingSeconds === 'number').toBe(true)
    })
  })

  describe('POST /api/c/orders/:id/cancel', () => {
    it('应成功取消待支付订单（无退款）', async () => {
      const order = await createOrder({ user_id: userId, status: 'pending_payment' })

      const res = await app.inject({
        method: 'POST',
        url: `/api/c/orders/${order.id}/cancel`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      // cancelOrder 返回 { refund_amount, pushEvents }，字段转 camelCase 后为 refundAmount
      expect(body.code).toBe(0)
      expect(body.data.refundAmount).toBe(0)
    })

    it('应成功取消待接单订单（全额退款）', async () => {
      const order = await createOrder({
        user_id: userId,
        companion_id: companionId,
        status: 'pending_accept',
        paid_amount: 10000,
      })
      await prisma.paymentRecord.create({
        data: {
          order_id: order.id,
          out_trade_no: `TEST_CANCEL_${Date.now()}`,
          amount: 10000,
          status: 'paid',
        },
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/c/orders/${order.id}/cancel`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.refundAmount).toBe(10000)
    })

    it('取消其他用户订单应返回 403', async () => {
      const otherUser = await createUser()
      const order = await createOrder({ user_id: otherUser.id, status: 'pending_payment' })

      const res = await app.inject({
        method: 'POST',
        url: `/api/c/orders/${order.id}/cancel`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(403)
    })
  })

  describe('POST /api/c/orders/:id/review', () => {
    it('应成功提交评价', async () => {
      const order = await createOrder({ user_id: userId, status: 'completed', companion_id: companionId })

      const res = await app.inject({
        method: 'POST',
        url: `/api/c/orders/${order.id}/review`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { rating: 5, content: '服务很好' },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
    })

    it('重复评价应返回 400', async () => {
      const order = await createOrder({ user_id: userId, status: 'completed', companion_id: companionId })

      // 第一次评价
      await app.inject({
        method: 'POST',
        url: `/api/c/orders/${order.id}/review`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { rating: 5 },
      })

      // 第二次评价
      const res = await app.inject({
        method: 'POST',
        url: `/api/c/orders/${order.id}/review`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { rating: 4 },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.errorKey).toBe('REVIEW_ALREADY_EXISTS')
    })

    it('对未完成订单评价应返回 400', async () => {
      const order = await createOrder({ user_id: userId, status: 'serving', companion_id: companionId })

      const res = await app.inject({
        method: 'POST',
        url: `/api/c/orders/${order.id}/review`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { rating: 5 },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.errorKey).toBe('ORDER_NOT_COMPLETED')
    })

    it('评价他人订单应返回 403', async () => {
      const otherUser = await createUser()
      const order = await createOrder({ user_id: otherUser.id, status: 'completed', companion_id: companionId })

      const res = await app.inject({
        method: 'POST',
        url: `/api/c/orders/${order.id}/review`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { rating: 5 },
      })

      expect(res.statusCode).toBe(403)
    })
  })

  describe('POST /api/c/orders/:id/renew', () => {
    it('serving 订单应成功发起续费并返回支付参数', async () => {
      const order = await createOrder({
        user_id: userId,
        companion_id: companionId,
        status: 'serving',
        service_start_at: new Date(),
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/c/orders/${order.id}/renew`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { added_hours: 1 },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.addedHours).toBe(1)
      expect(body.data.amount).toBeGreaterThan(0)
      expect(body.data.paymentParams).toBeDefined()
    })

    it('非 serving 订单续费应返回 400', async () => {
      const order = await createOrder({ user_id: userId, companion_id: companionId, status: 'accepted' })

      const res = await app.inject({
        method: 'POST',
        url: `/api/c/orders/${order.id}/renew`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { added_hours: 1 },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.errorKey).toBe('ORDER_NOT_SERVING')
    })
  })
})
