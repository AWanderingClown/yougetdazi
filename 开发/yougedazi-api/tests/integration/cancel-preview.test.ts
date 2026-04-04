/**
 * GET /api/c/orders/:id/cancel-preview 接口测试
 *
 * 测试范围：
 * 1. 权限验证 - 只能查看自己的订单
 * 2. 各种订单状态的退款计算逻辑
 * 3. 边界情况 - 刚好2分钟、刚好15分钟等
 *
 * 注意：成功响应（200）经过 requestFormatter 中间件转为 camelCase：
 *   can_cancel → canCancel
 *   refund_amount → refundAmount
 *   cancel_reason → cancelReason
 *   order_status → orderStatus
 * 错误响应（4xx）不转换，errorKey 保持原样。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { setupApp } from '../helpers/app'
import { prisma } from '../../src/lib/prisma'
import { cleanDatabase, createUser, createCompanion, createOrder } from '../helpers/db'
import { signUserToken } from '../helpers/auth'

describe('GET /api/c/orders/:id/cancel-preview', () => {
  let app: FastifyInstance
  let userToken: string
  let otherUserToken: string
  let userId: string
  let otherUserId: string
  let companionId: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const user = await createUser()
    userId = user.id
    userToken = signUserToken(userId)

    const otherUser = await createUser()
    otherUserId = otherUser.id
    otherUserToken = signUserToken(otherUserId)

    const companion = await createCompanion()
    companionId = companion.id
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('权限验证', () => {
    it('应返回 403 当查看其他用户的订单', async () => {
      const order = await createOrder({ user_id: userId, status: 'pending_accept', companion_id: companionId })

      const response = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}/cancel-preview`,
        headers: { Authorization: `Bearer ${otherUserToken}` },
      })

      expect(response.statusCode).toBe(403)
      const body = JSON.parse(response.body)
      expect(body.errorKey).toBe('FORBIDDEN')
    })

    it('应返回 404 当订单不存在', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/c/orders/non-existent-id/cancel-preview',
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('应返回 401 当未登录', async () => {
      const order = await createOrder({ user_id: userId, status: 'pending_accept', companion_id: companionId })

      const response = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}/cancel-preview`,
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('退款计算 - 待支付状态', () => {
    it('应返回 canCancel=true, refundAmount=0', async () => {
      const order = await createOrder({ user_id: userId, status: 'pending_payment' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}/cancel-preview`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.data.canCancel).toBe(true)
      expect(body.data.refundAmount).toBe(0)
      expect(body.data.cancelReason).toContain('无退款')
    })
  })

  describe('退款计算 - 待接单状态', () => {
    it('应返回全额退款', async () => {
      const order = await createOrder({ user_id: userId, status: 'pending_accept', companion_id: companionId, paid_amount: 10000 })
      await prisma.paymentRecord.create({
        data: {
          order_id: order.id,
          out_trade_no: `TEST${Date.now()}`,
          amount: 10000,
          status: 'paid',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}/cancel-preview`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.data.canCancel).toBe(true)
      expect(body.data.refundAmount).toBe(10000)
      expect(body.data.cancelReason).toContain('全额退款')
    })
  })

  describe('退款计算 - 等待抢单状态', () => {
    it('应返回全额退款', async () => {
      const order = await createOrder({ user_id: userId, status: 'waiting_grab', paid_amount: 10000 })
      await prisma.paymentRecord.create({
        data: {
          order_id: order.id,
          out_trade_no: `TEST${Date.now()}`,
          amount: 10000,
          status: 'paid',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}/cancel-preview`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.data.canCancel).toBe(true)
      expect(body.data.refundAmount).toBe(10000)
      expect(body.data.cancelReason).toContain('全额退款')
    })
  })

  describe('退款计算 - 已接单状态', () => {
    it('2分钟内应全额退款', async () => {
      const order = await createOrder({ user_id: userId, status: 'accepted', companion_id: companionId, paid_amount: 10000 })
      await prisma.paymentRecord.create({
        data: {
          order_id: order.id,
          out_trade_no: `TEST${Date.now()}`,
          amount: 10000,
          status: 'paid',
        },
      })
      await prisma.orderOperationLog.create({
        data: {
          order_id: order.id,
          operator_type: 'companion',
          operator_id: companionId,
          action: 'accept_order',
          from_status: 'pending_accept',
          to_status: 'accepted',
          created_at: new Date(Date.now() - 1 * 60 * 1000),
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}/cancel-preview`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.data.canCancel).toBe(true)
      expect(body.data.refundAmount).toBe(10000)
      expect(body.data.cancelReason).toContain('2分钟内')
    })

    it('超过2分钟应扣除50元', async () => {
      const order = await createOrder({ user_id: userId, status: 'accepted', companion_id: companionId, paid_amount: 10000 })
      await prisma.paymentRecord.create({
        data: {
          order_id: order.id,
          out_trade_no: `TEST${Date.now()}`,
          amount: 10000,
          status: 'paid',
        },
      })
      await prisma.orderOperationLog.create({
        data: {
          order_id: order.id,
          operator_type: 'companion',
          operator_id: companionId,
          action: 'accept_order',
          from_status: 'pending_accept',
          to_status: 'accepted',
          created_at: new Date(Date.now() - 3 * 60 * 1000),
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}/cancel-preview`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.data.canCancel).toBe(true)
      // 违约金 50元（5000分），paid_amount=10000 - CANCEL_FEE=5000 = 退款5000分
      // CANCEL_FEE 在 c/orders.ts 第603行定义：const CANCEL_FEE = 5000
      expect(body.data.refundAmount).toBe(5000)
      expect(body.data.cancelReason).toContain('超过2分钟')
    })
  })

  describe('退款计算 - 服务中状态', () => {
    it('<=15分钟应扣除50元', async () => {
      const order = await createOrder({
        user_id: userId,
        status: 'serving',
        companion_id: companionId,
        paid_amount: 10000,
        service_start_at: new Date(Date.now() - 10 * 60 * 1000),
      })
      await prisma.paymentRecord.create({
        data: {
          order_id: order.id,
          out_trade_no: `TEST${Date.now()}`,
          amount: 10000,
          status: 'paid',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}/cancel-preview`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.data.canCancel).toBe(true)
      // 违约金 50元（5000分），paid_amount=10000 - CANCEL_FEE=5000 = 退款5000分
      expect(body.data.refundAmount).toBe(5000)
      expect(body.data.cancelReason).toContain('≤15分钟')
    })

    it('>15分钟应无法取消', async () => {
      const order = await createOrder({
        user_id: userId,
        status: 'serving',
        companion_id: companionId,
        paid_amount: 10000,
        service_start_at: new Date(Date.now() - 20 * 60 * 1000),
      })
      await prisma.paymentRecord.create({
        data: {
          order_id: order.id,
          out_trade_no: `TEST${Date.now()}`,
          amount: 10000,
          status: 'paid',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}/cancel-preview`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.data.canCancel).toBe(false)
      expect(body.data.cancelReason).toContain('超过15分钟')
    })
  })

  describe('边界情况', () => {
    it('已完成的订单应无法取消', async () => {
      const order = await createOrder({ user_id: userId, status: 'completed', companion_id: companionId })

      const response = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}/cancel-preview`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.data.canCancel).toBe(false)
    })

    it('已取消的订单应无法再次取消', async () => {
      const order = await createOrder({ user_id: userId, status: 'cancelled', companion_id: companionId })

      const response = await app.inject({
        method: 'GET',
        url: `/api/c/orders/${order.id}/cancel-preview`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.data.canCancel).toBe(false)
    })
  })
})
