import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createUser, createCompanion, createCompanionService } from '../helpers/db'
import { signUserToken, signCompanionToken } from '../helpers/auth'
import { mockPushServer } from '../helpers/push-mock'
import { prisma } from '../../src/lib/prisma'

/**
 * E2E 全链路测试：支付后取消与退款
 *
 * 场景1：2分钟内取消（全额退款）
 *   - C创建直单 → 支付 → 立即取消 → 断言全额退款
 *
 * 场景2：接单后2分钟外取消（扣50元）
 *   - C创建直单 → 支付 → B接单 → 时间伪造到20分钟前 → C取消 → 断言扣除50元
 */
describe('E2E: 支付后取消与退款', () => {
  let app: FastifyInstance
  let { captured, restore: restorePush } = { captured: [], restore: () => {} }

  let userId: string
  let userToken: string
  let companionId: string
  let companionToken: string
  let serviceId: string

  beforeAll(async () => {
    app = await setupApp()
    const pushMock = mockPushServer()
    captured = pushMock.captured
    restorePush = pushMock.restore

    const user = await createUser({ nickname: '取消订单测试用户' })
    userId = user.id
    userToken = signUserToken(userId)

    const companion = await createCompanion({ nickname: '被取消订单搭子' })
    companionId = companion.id
    companionToken = signCompanionToken(companionId)

    const service = await createCompanionService(companionId, {
      service_name: '游戏陪玩',
      hourly_price: 50000,
    })
    serviceId = service.id
  })

  afterAll(async () => {
    restorePush()
    await cleanDatabase()
    await app.close()
  })

  describe('场景1: 支付后2分钟内取消（全额退款）', () => {
    let orderId: string
    let orderNo: string

    it('C创建直单，支付', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/c/orders',
        headers: { Authorization: `Bearer ${userToken}` },
        payload: {
          companion_id: companionId,
          service_id: serviceId,
          order_type: 'direct',
          duration: 1,
          user_remark: '会被立即取消',
        },
      })

      expect(createRes.statusCode).toBe(201)
      orderId = JSON.parse(createRes.body).data.order.id
      orderNo = JSON.parse(createRes.body).data.order.orderNo

      // 支付回调
      const paymentRecord = await prisma.paymentRecord.findFirst({
        where: { order_id: orderId },
      })
      const payRes = await app.inject({
        method: 'POST',
        url: '/webhook/wx-pay/test',
        payload: {
          out_trade_no: paymentRecord!.out_trade_no,
          amount: 50000,
          transaction_id: `mock_txn_${Date.now()}`,
        },
      })
      expect(payRes.statusCode).toBe(200)

      // 验证状态已变pending_accept
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${orderId}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(JSON.parse(getRes.body).data.status).toBe('pending_accept')
    })

    it('立即取消，应该全额退款', async () => {
      const cancelRes = await app.inject({
        method: 'POST',
        url: `/api/c/orders/${orderId}/cancel`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { reason: '改主意了' },
      })

      expect(cancelRes.statusCode).toBe(200)
      const body = JSON.parse(cancelRes.body)
      expect(body.code).toBe(0)
      expect(body.data.status).toBe('cancelled')
      expect(body.data.refundAmount).toBe(50000) // 全额退款

      // 从数据库验证refundRecord
      const refund = await prisma.refundRecord.findFirst({
        where: { order_id: orderId },
      })
      expect(refund).toBeDefined()
      expect(refund!.refund_amount).toBe(50000)
    })
  })

  describe('场景2: 接单后2分钟外取消（扣50元）', () => {
    let orderId: string
    let orderNo: string

    it('C创建直单，支付，B接单', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/c/orders',
        headers: { Authorization: `Bearer ${userToken}` },
        payload: {
          companion_id: companionId,
          service_id: serviceId,
          order_type: 'direct',
          duration: 1,
          user_remark: '接单后再取消',
        },
      })

      expect(createRes.statusCode).toBe(201)
      orderId = JSON.parse(createRes.body).data.order.id
      orderNo = JSON.parse(createRes.body).data.order.orderNo

      // 支付回调
      const paymentRecord = await prisma.paymentRecord.findFirst({
        where: { order_id: orderId },
      })
      const payRes = await app.inject({
        method: 'POST',
        url: '/webhook/wx-pay/test',
        payload: {
          out_trade_no: paymentRecord!.out_trade_no,
          amount: 50000,
          transaction_id: `mock_txn_${Date.now()}_2`,
        },
      })
      expect(payRes.statusCode).toBe(200)

      // B端接单
      const acceptRes = await app.inject({
        method: 'POST',
        url: `/api/b/orders/${orderId}/accept`,
        headers: { Authorization: `Bearer ${companionToken}` },
      })
      expect(acceptRes.statusCode).toBe(200)
      expect(JSON.parse(acceptRes.body).data.status).toBe('accepted')
    })

    it('伪造订单创建时间到20分钟前', async () => {
      // 直接修改数据库，将created_at改为20分钟前
      const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000)
      await prisma.order.update({
        where: { id: orderId },
        data: { created_at: twentyMinutesAgo },
      })

      // 验证时间已修改
      const order = await prisma.order.findUnique({ where: { id: orderId } })
      expect(order!.created_at.getTime()).toBeLessThan(Date.now() - 19 * 60 * 1000)
    })

    it('取消订单，应该扣除50元', async () => {
      const cancelRes = await app.inject({
        method: 'POST',
        url: `/api/c/orders/${orderId}/cancel`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { reason: '有急事' },
      })

      expect(cancelRes.statusCode).toBe(200)
      const body = JSON.parse(cancelRes.body)
      expect(body.code).toBe(0)
      expect(body.data.status).toBe('cancelled')
      // 扣50元：50000 - 5000 = 45000
      expect(body.data.refundAmount).toBe(45000)

      // 从数据库验证refundRecord
      const refund = await prisma.refundRecord.findFirst({
        where: { order_id: orderId },
      })
      expect(refund).toBeDefined()
      expect(refund!.refund_amount).toBe(45000)
    })
  })

  describe('场景3: 服务中取消不允许', () => {
    let orderId: string
    let orderNo: string

    it('C创建直单，支付，B接单并开始服务', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/c/orders',
        headers: { Authorization: `Bearer ${userToken}` },
        payload: {
          companion_id: companionId,
          service_id: serviceId,
          order_type: 'direct',
          duration: 1,
        },
      })

      orderId = JSON.parse(createRes.body).data.order.id
      orderNo = JSON.parse(createRes.body).data.order.orderNo

      // 支付
      const paymentRecord2 = await prisma.paymentRecord.findFirst({
        where: { order_id: orderId },
      })
      await app.inject({
        method: 'POST',
        url: '/webhook/wx-pay/test',
        payload: {
          out_trade_no: paymentRecord2!.out_trade_no,
          amount: 50000,
          transaction_id: `mock_txn_serving_${Date.now()}`,
        },
      })

      // 接单→开始服务
      await app.inject({
        method: 'POST',
        url: `/api/b/orders/${orderId}/accept`,
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      await app.inject({
        method: 'POST',
        url: `/api/b/orders/${orderId}/start`,
        headers: { Authorization: `Bearer ${companionToken}` },
        payload: { event: 'serving' },
      })
    })

    it('服务中的订单取消应该返回400', async () => {
      const cancelRes = await app.inject({
        method: 'POST',
        url: `/api/c/orders/${orderId}/cancel`,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { reason: '不想玩了' },
      })

      expect(cancelRes.statusCode).toBe(400)
      const body = JSON.parse(cancelRes.body)
      // 期望返回错误码，如 'ORDER_CANNOT_CANCEL_IN_SERVING'
      expect(body.errorKey).toBeDefined()
    })
  })
})
