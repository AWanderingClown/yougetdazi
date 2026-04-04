import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createAdmin, createUser, createCompanion, createOrder } from '../helpers/db'
import { signAdminToken } from '../helpers/auth'
import { prisma } from '../../src/lib/prisma'
import type { FastifyInstance } from 'fastify'

describe('Admin 财务管理', () => {
  let app: FastifyInstance
  let adminToken: string
  let userId: string
  let companionId: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const admin = await createAdmin()
    adminToken = signAdminToken(admin.id)

    const user = await createUser()
    userId = user.id

    const companion = await createCompanion({ audit_status: 'approved' })
    companionId = companion.id

    const order = await createOrder({
      user_id: userId,
      companion_id: companionId,
      status: 'completed',
      paid_amount: 10000,
    })

    // 创建支付记录
    await prisma.paymentRecord.create({
      data: {
        order_id: order.id,
        out_trade_no: `TEST_PAY_${Date.now()}`,
        amount: 10000,
        status: 'paid',
      },
    })

    // 创建退款记录
    const payment = await prisma.paymentRecord.findFirst({ where: { order_id: order.id } })
    if (payment) {
      await prisma.refundRecord.create({
        data: {
          payment_id: payment.id,
          out_refund_no: `REFUND_${Date.now()}`,
          refund_amount: 5000,
          status: 'success',
        },
      })
    }

    // 创建结算记录
    await prisma.settlement.create({
      data: {
        companion_id: companionId,
        order_id: order.id,
        type: 'order_income',
        amount: 8000,
        description: '订单完成结算',
        balance_before: 0,
        balance_after: 8000,
      },
    })

    // 创建保证金记录
    await prisma.depositTransaction.create({
      data: {
        companion_id: companionId,
        type: 'deposit',
        amount: 30000,
        balance_after: 30000,
        reason: '首次保证金缴纳',
      },
    })
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('GET /api/admin/withdraws', () => {
    it('应返回提现申请列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/withdraws',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(Array.isArray(body.data.list)).toBe(true)
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/admin/withdraws' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/admin/refunds', () => {
    it('应返回退款记录列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/refunds',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.total).toBeGreaterThan(0)
      expect(Array.isArray(body.data.list)).toBe(true)
    })
  })

  describe('GET /api/admin/finance/records', () => {
    it('应返回财务流水列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/finance/records',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.total).toBeGreaterThan(0)
    })
  })

  describe('GET /api/admin/deposits', () => {
    it('应返回保证金记录列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/deposits',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.total).toBeGreaterThan(0)
      expect(Array.isArray(body.data.list)).toBe(true)
    })
  })

  describe('GET /api/admin/payment-records', () => {
    it('应返回支付记录列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/payment-records',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.total).toBeGreaterThan(0)
    })
  })
})
