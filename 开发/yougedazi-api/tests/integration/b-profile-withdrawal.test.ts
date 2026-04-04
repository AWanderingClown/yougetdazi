import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createCompanion } from '../helpers/db'
import { signCompanionToken } from '../helpers/auth'
import { prisma } from '../../src/lib/prisma'
import type { FastifyInstance } from 'fastify'

describe('B端个人资料 & 提现', () => {
  let app: FastifyInstance
  let companionToken: string
  let companionId: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const companion = await createCompanion({ audit_status: 'approved', is_online: true })
    companionId = companion.id
    companionToken = signCompanionToken(companionId)
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('POST /api/b/profile/register', () => {
    it('应成功提交注册信息', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/b/profile/register',
        headers: { Authorization: `Bearer ${companionToken}` },
        payload: {
          nickname: '测试搭子',
          gender: 1,
          age: 25,
          city: '深圳',
          real_name: '张三',
          id_card_no: '440301199001011234',
          skills: ['英雄联盟', '王者荣耀'],
          bio: '专业陪玩，欢迎预约',
        },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      // audit_status → auditStatus (camelCase)
      expect(body.data.auditStatus).toBe('pending')
    })

    it('缺少必填字段应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/b/profile/register',
        headers: { Authorization: `Bearer ${companionToken}` },
        payload: {
          nickname: '测试',
          // 缺少 gender, age, city, real_name, id_card_no, skills
        },
      })

      expect(res.statusCode).toBe(400)
    })

    it('身份证格式错误应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/b/profile/register',
        headers: { Authorization: `Bearer ${companionToken}` },
        payload: {
          nickname: '测试搭子',
          gender: 1,
          age: 25,
          city: '深圳',
          real_name: '张三',
          id_card_no: '123456',  // 格式错误
          skills: ['游戏陪玩'],
        },
      })

      expect(res.statusCode).toBe(400)
    })

    it('无 Token 应返回 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/b/profile/register',
        payload: { nickname: '测试', gender: 1, age: 25, city: '深圳', real_name: '张三', id_card_no: '440301199001011234', skills: ['游戏'] },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/b/profile/status', () => {
    it('应返回当前审核状态', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/profile/status',
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      // audit_status → auditStatus (camelCase)
      expect(body.data.auditStatus).toBeDefined()
      expect(typeof body.data.hasProfile).toBe('boolean')
    })
  })

  describe('GET /api/b/withdrawals', () => {
    it('余额不足时申请提现应返回 400', async () => {
      // 默认 deposited_amount = 0，不足最低100元
      const res = await app.inject({
        method: 'POST',
        url: '/api/b/withdrawals',
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.errorKey).toBe('INSUFFICIENT_BALANCE')
    })

    it('应返回提现记录列表（空）', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/b/withdrawals',
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(Array.isArray(body.data.list)).toBe(true)
    })

    it('充值余额后应能成功申请提现', async () => {
      // 直接更新余额模拟充值
      await prisma.companion.update({
        where: { id: companionId },
        data: { deposited_amount: 20000 },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/b/withdrawals',
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.withdrawalId).toBeDefined()
      expect(body.data.amount).toBe(20000)
    })

    it('有待审核提现时再次申请应返回 400', async () => {
      // 此时上面已经提交了一个 pending 提现
      const res = await app.inject({
        method: 'POST',
        url: '/api/b/withdrawals',
        headers: { Authorization: `Bearer ${companionToken}` },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.errorKey).toBe('PENDING_WITHDRAWAL_EXISTS')
    })
  })
})
