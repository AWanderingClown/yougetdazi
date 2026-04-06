import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createUser, createCompanion, createCompanionService, createOrder } from '../helpers/db'
import { signUserToken, signCompanionToken } from '../helpers/auth'
import { mockPushServer } from '../helpers/push-mock'
import { prisma } from '../../src/lib/prisma'
import { orderService } from '../../src/services/order.service'
import { dispatchPushEvents } from '../../src/utils/push-helper'

/**
 * E2E 全链路测试：订单超时自动取消
 *
 * 场景1：支付超时（pending_payment → cancelled，无退款）
 *   - 创建订单但不支付，直接调用cancelOrder模拟超时取消
 *
 * 场景2：接单超时（pending_accept → cancelled，全额退款）
 *   - 创建订单并支付，但不接单，直接调用cancelOrder模拟超时取消
 */
describe('E2E: 订单超时自动取消', () => {
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

    const user = await createUser({ nickname: '超时订单用户' })
    userId = user.id
    userToken = signUserToken(userId)

    const companion = await createCompanion({ nickname: '超时未接搭子' })
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

  describe('场景1: 支付超时（pending_payment → cancelled，无退款）', () => {
    let orderId: string

    it('创建订单，不支付，模拟超时', async () => {
      const order = await createOrder({
        user_id: userId,
        companion_id: companionId,
        service_id: serviceId,
        status: 'pending_payment',
        order_type: 'direct',
        duration: 1,
        hourly_price: 50000,
        total_amount: 50000,
      })
      orderId = order.id

      expect(order.status).toBe('pending_payment')

      // 直接调用orderService.cancelOrder模拟支付超时（无退款参数）
      const result = await orderService.cancelOrder(
        orderId,
        'system',
        'system',
        '支付超时，系统自动取消'
      )
      // 手动触发推送事件分发（测试中直接调用服务层，需要手动处理推送）
      await dispatchPushEvents(result)

      expect(result).toBeDefined()
      expect(result.status).toBe('cancelled')

      // 验证订单状态
      const updatedOrder = await prisma.order.findUnique({
        where: { id: orderId },
      })
      expect(updatedOrder!.status).toBe('cancelled')

      // 验证没有退款记录（因为未支付，无需退款）
      const refund = await prisma.refundRecord.findFirst({
        where: { order_id: orderId },
      })
      expect(refund).toBeNull()
    })

    it('验证push事件已发送', () => {
      // 至少应该有一条push事件告知用户订单被取消
      expect(captured.length).toBeGreaterThan(0)
    })
  })

  describe('场景2: 接单超时（pending_accept → cancelled，全额退款）', () => {
    let orderId: string
    let orderNo: string

    it('创建订单并支付，但不接单，模拟接单超时', async () => {
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

      const createBody = JSON.parse(createRes.body)
      orderId = createBody.data.order.id
      orderNo = createBody.data.order.orderNo

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
          transaction_id: `mock_txn_accept_timeout_${Date.now()}`,
        },
      })
      expect(payRes.statusCode).toBe(200)

      // 验证状态变pending_accept
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${orderId}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })
      expect(JSON.parse(getRes.body).data.status).toBe('pending_accept')

      // 直接调用orderService.cancelOrder，带上100（全额退款比例）
      const result = await orderService.cancelOrder(
        orderId,
        'system',
        'system',
        '超时未接单，系统自动取消',
        100 // 全额退款
      )
      // 手动触发推送事件分发
      await dispatchPushEvents(result)

      expect(result.status).toBe('cancelled')
    })

    it('验证退款记录已生成', async () => {
      const refund = await prisma.refundRecord.findFirst({
        where: { order_id: orderId },
      })
      expect(refund).toBeDefined()
      // 全额退款
      expect(refund!.refund_amount).toBe(50000)
    })

    it('验证超时取消的操作日志', async () => {
      const logs = await prisma.orderOperationLog.findMany({
        where: { order_id: orderId },
        orderBy: { created_at: 'asc' },
      })

      // 应该有3个操作日志：create_order, payment_success, cancel_order
      expect(logs.length).toBeGreaterThanOrEqual(3)

      const actions = logs.map((l) => l.action)
      expect(actions).toContain('create_order')
      expect(actions).toContain('payment_success')
      expect(actions).toContain('cancel_order')

      // 验证系统取消记录
      const cancelLog = logs.find((l) => l.action === 'cancel_order')
      expect(cancelLog).toBeDefined()
      expect(cancelLog!.operator_type).toBe('system')
      expect(cancelLog!.from_status).toBe('pending_accept')
      expect(cancelLog!.to_status).toBe('cancelled')
    })

    it('C端验证订单已取消', async () => {
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${orderId}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(getRes.statusCode).toBe(200)
      const body = JSON.parse(getRes.body)
      expect(body.data.status).toBe('cancelled')
      expect(body.data.refundAmount).toBe(50000)
    })
  })

  describe('场景3: 服务超时自动完成', () => {
    let orderId: string
    let orderNo: string

    it('完整直单流程：创建→支付→接单→开始服务', async () => {
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

      const createBody = JSON.parse(createRes.body)
      orderId = createBody.data.order.id
      orderNo = createBody.data.order.orderNo

      // 支付
      const paymentRecord3 = await prisma.paymentRecord.findFirst({
        where: { order_id: orderId },
      })
      await app.inject({
        method: 'POST',
        url: '/webhook/wx-pay/test',
        payload: {
          out_trade_no: paymentRecord3!.out_trade_no,
          amount: 50000,
          transaction_id: `mock_txn_service_timeout_${Date.now()}`,
        },
      })

      // 接单
      await app.inject({
        method: 'POST',
        url: `/api/b/orders/${orderId}/accept`,
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      // 开始服务
      const servingRes = await app.inject({
        method: 'POST',
        url: `/api/b/orders/${orderId}/start`,
        headers: { Authorization: `Bearer ${companionToken}` },
        payload: { event: 'serving' },
      })
      expect(servingRes.statusCode).toBe(200)
      expect(JSON.parse(servingRes.body).data.status).toBe('serving')
    })

    it('模拟服务超时，自动完成订单', async () => {
      // 直接调用orderService.completeOrder模拟服务时长到期
      const result = await orderService.completeOrder(
        orderId,
        'system',
        'system'
      )
      // 手动触发推送事件分发
      await dispatchPushEvents(result)

      expect(result.status).toBe('completed')

      // 验证数据库状态
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      })
      expect(order!.status).toBe('completed')
    })

    it('C端应该能看到已完成订单', async () => {
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${orderId}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(getRes.statusCode).toBe(200)
      const body = JSON.parse(getRes.body)
      expect(body.data.status).toBe('completed')
    })
  })
})
