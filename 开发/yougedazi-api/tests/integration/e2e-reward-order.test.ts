import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createUser, createCompanion, createCompanionService } from '../helpers/db'
import { signUserToken, signCompanionToken } from '../helpers/auth'
import { mockPushServer } from '../helpers/push-mock'
import { prisma } from '../../src/lib/prisma'

/**
 * E2E 全链路测试：悬赏单完整流程
 *
 * 流程：
 * 1. C端用户创建悬赏单 → 返回mock支付参数
 * 2. 模拟支付回调成功 → 订单状态变waiting_grab
 * 3. B端搭子抢单 → 订单状态变accepted
 * 4-8. 与直单流程相同：出发→出发完成→开始服务→完成→评价
 */
describe('E2E: 悬赏单完整流程', () => {
  let app: FastifyInstance
  let { captured, restore: restorePush } = { captured: [], restore: () => {} }

  let userId: string
  let userToken: string
  let companionId: string
  let companionToken: string
  let serviceId: string
  let orderId: string
  let orderNo: string

  beforeAll(async () => {
    app = await setupApp()
    const pushMock = mockPushServer()
    captured = pushMock.captured
    restorePush = pushMock.restore

    // 创建用户
    const user = await createUser({ nickname: '悬赏发起人' })
    userId = user.id
    userToken = signUserToken(userId)

    // 创建搭子（有多个搭子，便于验证广播）
    const companion = await createCompanion({ nickname: '抢单搭子' })
    companionId = companion.id
    companionToken = signCompanionToken(companionId)

    // 为搭子创建服务项目
    const service = await createCompanionService(companionId, {
      service_name: '游戏陪玩',
      hourly_price: 60000, // 600 元/小时
    })
    serviceId = service.id
  })

  afterAll(async () => {
    restorePush()
    await cleanDatabase()
    await app.close()
  })

  it('C端创建悬赏单，返回mock支付参数', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/c/orders',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        service_id: serviceId,
        order_type: 'reward', // 悬赏单
        duration: 2, // 2小时
        required_count: 1, // 需要1个搭子
        user_remark: '需要高手陪练',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(0)
    expect(body.data.order.orderType).toBe('reward')
    expect(body.data.order.status).toBe('pending_payment')
    expect(body.data.order.totalAmount).toBe(120000) // 600*2

    orderId = body.data.order.id
    orderNo = body.data.order.orderNo
  })

  it('模拟支付回调，订单状态变waiting_grab', async () => {
    // 从数据库查询 out_trade_no
    const paymentRecord = await prisma.paymentRecord.findFirst({
      where: { order_id: orderId },
    })
    expect(paymentRecord).toBeDefined()
    const outTradeNo = paymentRecord!.out_trade_no

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/wx-pay/test',
      payload: {
        out_trade_no: outTradeNo,
        amount: 120000,
        transaction_id: `mock_txn_reward_${Date.now()}`,
      },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(0)

    // 验证订单状态变waiting_grab
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/c/orders/${orderId}`,
      headers: { Authorization: `Bearer ${userToken}` },
    })
    expect(getRes.statusCode).toBe(200)
    const getBody = JSON.parse(getRes.body)
    expect(getBody.data.status).toBe('waiting_grab')
  })

  it('B端搭子抢单，订单状态变accepted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/b/orders/${orderId}/grab`,
      headers: { Authorization: `Bearer ${companionToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(0)
    expect(body.data.status).toBe('accepted')
  })

  it('B端搭子出发，订单状态变preparing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/b/orders/${orderId}/start`,
      headers: { Authorization: `Bearer ${companionToken}` },
      payload: { event: 'preparing' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(0)
    expect(body.data.status).toBe('preparing')
  })

  it('B端搭子出发完成，订单状态变departed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/b/orders/${orderId}/start`,
      headers: { Authorization: `Bearer ${companionToken}` },
      payload: { event: 'departed' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(0)
    expect(body.data.status).toBe('departed')
  })

  it('B端搭子开始服务，订单状态变serving', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/b/orders/${orderId}/start`,
      headers: { Authorization: `Bearer ${companionToken}` },
      payload: { event: 'serving' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(0)
    expect(body.data.status).toBe('serving')
  })

  it('B端搭子完成服务，订单状态变completed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/b/orders/${orderId}/complete`,
      headers: { Authorization: `Bearer ${companionToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(0)
    expect(body.data.status).toBe('completed')
  })

  it('C端用户提交评价', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/c/orders/${orderId}/review`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        rating: 5,
        content: '悬赏顺利完成！',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(0)
    expect(body.data.review.rating).toBe(5)
  })
})
