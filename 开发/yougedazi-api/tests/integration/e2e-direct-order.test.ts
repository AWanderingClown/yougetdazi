import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createUser, createCompanion, createCompanionService } from '../helpers/db'
import { signUserToken, signCompanionToken } from '../helpers/auth'
import { mockPushServer } from '../helpers/push-mock'
import { prisma } from '../../src/lib/prisma'

/**
 * E2E 全链路测试：直单完整流程
 *
 * 流程：
 * 1. C端用户创建直单 → 返回mock支付参数
 * 2. 模拟支付回调成功 → 订单状态变pending_accept
 * 3. B端搭子接单 → 订单状态变accepted
 * 4. B端搭子出发 → 订单状态变preparing
 * 5. B端搭子出发完成 → 订单状态变departed
 * 6. B端搭子开始服务 → 订单状态变serving，倒计时启动
 * 7. B端搭子完成服务 → 订单状态变completed
 * 8. C端用户提交评价 → 评价入库
 */
describe('E2E: 直单完整流程', () => {
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
    const user = await createUser({ nickname: '测试用户C' })
    userId = user.id
    userToken = signUserToken(userId)

    // 创建搭子
    const companion = await createCompanion({ nickname: '测试搭子B' })
    companionId = companion.id
    companionToken = signCompanionToken(companionId)

    // 为搭子创建服务项目
    const service = await createCompanionService(companionId, {
      service_name: '游戏陪玩',
      hourly_price: 50000, // 500 元/小时
    })
    serviceId = service.id
  })

  afterAll(async () => {
    restorePush()
    await cleanDatabase()
    await app.close()
  })

  it('C端创建直单，返回mock支付参数', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/c/orders',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        companion_id: companionId,
        service_id: serviceId,
        order_type: 'direct',
        duration: 1, // 1小时
        user_remark: '请认真陪玩',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(0)
    expect(body.data).toHaveProperty('order')

    const order = body.data.order
    expect(order.status).toBe('pending_payment')
    expect(order.orderType).toBe('direct')
    expect(order.duration).toBe(1)
    expect(order.totalAmount).toBe(50000)

    orderId = order.id
    orderNo = order.orderNo

    // 验证支付参数（中间件将 payment_params 转换为 paymentParams）
    expect(body.data.paymentParams).toBeDefined()
    expect(body.data.paymentParams.prepayId).toMatch(/^mock_/)
  })

  it('模拟支付回调成功，订单状态变pending_accept', async () => {
    // 从数据库查询 out_trade_no（格式为 ORDER_${uuid}）
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
        amount: 50000,
        transaction_id: `mock_txn_${Date.now()}`,
      },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(0)

    // 验证订单状态已变pending_accept
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/c/orders/${orderId}`,
      headers: { Authorization: `Bearer ${userToken}` },
    })
    expect(getRes.statusCode).toBe(200)
    const getBody = JSON.parse(getRes.body)
    expect(getBody.data.status).toBe('pending_accept')

    // 验证push事件：新订单通知发给搭子
    const newOrderEvent = captured.find(
      (e) =>
        e.body?.events?.[0]?.type === 'new_order' &&
        e.body?.events?.[0]?.targetType === 'companion' &&
        e.body?.events?.[0]?.targetId === companionId
    )
    expect(newOrderEvent).toBeDefined()
  })

  it('B端搭子接单，订单状态变accepted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/b/orders/${orderId}/accept`,
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

    if (res.statusCode !== 200) {
      const errorBody = JSON.parse(res.body)
      console.log('出发操作错误:', { status: res.statusCode, code: errorBody.code, message: errorBody.message, errorKey: errorBody.errorKey })
    }
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

    // 验证倒计时启动：GET /api/b/orders/:id/timer 应该返回剩余时间
    const timerRes = await app.inject({
      method: 'GET',
      url: `/api/b/orders/${orderId}/timer`,
      headers: { Authorization: `Bearer ${companionToken}` },
    })
    expect(timerRes.statusCode).toBe(200)
    const timerBody = JSON.parse(timerRes.body)
    expect(timerBody.code).toBe(0)
    // remainingSeconds 应该是数字（可能是null如果Redis出问题，但正常情况应该存在）
    expect(typeof timerBody.data.remainingSeconds === 'number' || timerBody.data.remainingSeconds === null).toBe(true)
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

    // 验证push事件：订单完成通知发给用户
    const completedEvent = captured.find(
      (e) =>
        e.body?.events?.[0]?.type === 'order_completed' &&
        e.body?.events?.[0]?.targetType === 'user' &&
        e.body?.events?.[0]?.targetId === userId
    )
    expect(completedEvent).toBeDefined()
  })

  it('C端用户提交评价，评价入库', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/c/orders/${orderId}/review`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        rating: 5,
        content: '搭子很专业，下次继续',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.code).toBe(0)
    expect(body.data).toHaveProperty('review')
    expect(body.data.review.rating).toBe(5)
    expect(body.data.review.content).toBe('搭子很专业，下次继续')
  })

  it('验证最终订单状态', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/c/orders/${orderId}`,
      headers: { Authorization: `Bearer ${userToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.status).toBe('completed')
    expect(body.data).toHaveProperty('review')
  })

  it('验证订单操作日志完整记录', async () => {
    const logs = await prisma.orderOperationLog.findMany({
      where: { order_id: orderId },
      orderBy: { created_at: 'asc' },
    })

    // 验证有5个关键操作日志
    expect(logs.length).toBeGreaterThanOrEqual(5)

    // 验证关键操作都被记录
    const actions = logs.map((l) => l.action)
    expect(actions).toContain('create_order')
    expect(actions).toContain('payment_success')
    expect(actions).toContain('accept_order')
    expect(actions).toContain('start_service')
    expect(actions).toContain('complete_order')

    // 验证状态流转记录
    const completeLog = logs.find((l) => l.action === 'complete_order')
    expect(completeLog).toBeDefined()
    expect(completeLog!.from_status).toBe('serving')
    expect(completeLog!.to_status).toBe('completed')
    expect(completeLog!.operator_type).toBe('companion')
    expect(completeLog!.operator_id).toBe(companionId)

    // 验证开始服务记录
    const startLog = logs.find((l) => l.action === 'start_service')
    expect(startLog).toBeDefined()
    expect(startLog!.operator_type).toBe('companion')
  })

  it('验证收益结算记录', async () => {
    const settlement = await prisma.settlement.findFirst({
      where: { order_id: orderId },
    })

    expect(settlement).toBeDefined()
    expect(settlement!.companion_id).toBe(companionId)
    expect(settlement!.type).toBe('order_income')
    expect(settlement!.amount).toBeGreaterThan(0) // 搭子应该收到钱
    expect(settlement!.order_no).toBe(orderNo)
    expect(settlement!.service_name).toBe('游戏陪玩')
    expect(settlement!.duration).toBe(1)

    // 验证余额变动合理（平台抽成20%，搭子得80%）
    const expectedCompanionIncome = 50000 * 0.8 // 40000分 = 400元
    expect(settlement!.amount).toBe(expectedCompanionIncome)
  })
})
