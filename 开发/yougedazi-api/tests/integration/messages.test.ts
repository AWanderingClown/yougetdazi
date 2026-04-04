import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createUser, createCompanion } from '../helpers/db'
import { signUserToken } from '../helpers/auth'
import type { FastifyInstance } from 'fastify'

describe('IM 消息流程', () => {
  let app: FastifyInstance
  let userToken: string
  let userId: string
  let companionId: string

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()

    const user = await createUser()
    userId = user.id
    userToken = signUserToken(userId)

    const companion = await createCompanion({ audit_status: 'approved' })
    companionId = companion.id
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('POST /api/c/messages', () => {
    it('用户应能发送消息给陪玩师', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/c/messages',
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { companion_id: companionId, content: '你好', msg_type: 'text' },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.content).toBe('你好')
    })

    it('未通过审核的陪玩师不能接收消息', async () => {
      const unapprovedCompanion = await createCompanion({ audit_status: 'pending' })

      const res = await app.inject({
        method: 'POST',
        url: '/api/c/messages',
        headers: { Authorization: `Bearer ${userToken}` },
        payload: { companion_id: unapprovedCompanion.id, content: '你好', msg_type: 'text' },
      })

      expect(res.statusCode).toBe(403)
      const body = JSON.parse(res.body)
      expect(body.errorKey).toBe('COMPANION_NOT_AUDITED')
    })

    it('无 Token 发消息应返回 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/c/messages',
        payload: { companion_id: companionId, content: '你好', msg_type: 'text' },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/c/messages/sessions', () => {
    it('应返回会话列表', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/c/messages/sessions',
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.list.length).toBeGreaterThan(0)
      // requestFormatter 将 companion_id → companionId
      expect(body.data.list[0].companionId).toBe(companionId)
    })
  })

  describe('GET /api/c/messages/:companionId', () => {
    it('应返回历史消息并标记已读', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/c/messages/${companionId}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.list.length).toBeGreaterThan(0)
    })

    it('查询不存在的陪玩师会话应返回空列表', async () => {
      const otherCompanion = await createCompanion({ audit_status: 'approved' })

      const res = await app.inject({
        method: 'GET',
        url: `/api/c/messages/${otherCompanion.id}`,
        headers: { Authorization: `Bearer ${userToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.list).toEqual([])
    })
  })
})
