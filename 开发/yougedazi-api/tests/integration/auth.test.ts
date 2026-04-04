import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp } from '../helpers/app'
import { cleanDatabase, createAdmin } from '../helpers/db'
import { redis, RedisKey } from '../../src/lib/redis'
import type { FastifyInstance } from 'fastify'

describe('Auth Flow', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await setupApp()
    await cleanDatabase()
  })

  afterAll(async () => {
    await cleanDatabase()
    await app.close()
  })

  describe('POST /api/auth/wx-login', () => {
    it('应成功登录 C 端用户（mock 模式）', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/wx-login',
        payload: { code: 'test_code_user', role: 'user', nickname: '用户A' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      // 中间件将响应字段转为 camelCase
      expect(body.data.accessToken).toBeDefined()
      expect(body.data.refreshToken).toBeDefined()
      expect(body.data.role).toBe('user')
    })

    it('应成功登录 B 端陪玩师（mock 模式）', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/wx-login',
        payload: { code: 'test_code_companion', role: 'companion', nickname: '搭子A' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.role).toBe('companion')
    })

    it('缺少 role 应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/wx-login',
        payload: { code: 'test_code' },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(40001)
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('应使用 refresh_token 换取新 token', async () => {
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/wx-login',
        payload: { code: 'refresh_test_code', role: 'user' },
      })
      // 响应字段为 camelCase
      const { refreshToken } = JSON.parse(login.body).data

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token: refreshToken },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      expect(body.data.accessToken).toBeDefined()
      expect(body.data.refreshToken).toBeDefined()
    })

    it('重复使用同一 refresh_token 应失败（Token Rotation）', async () => {
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/wx-login',
        payload: { code: 'refresh_test_code2', role: 'user' },
      })
      const { refreshToken } = JSON.parse(login.body).data

      // 第一次刷新
      await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token: refreshToken },
      })

      // 第二次使用旧 token
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token: refreshToken },
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.errorKey).toBe('TOKEN_INVALID')
    })
  })

  describe('POST /api/admin/login', () => {
    it('应成功登录 Admin', async () => {
      const admin = await createAdmin({
        username: 'admin_login_test',
        password: await (await import('bcrypt')).hash('Admin@123', 12),
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { username: 'admin_login_test', password: 'Admin@123' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
      // admin 路由跳过格式化，保持 snake_case
      expect(body.data.admin.id).toBe(admin.id)

      await redis.del(RedisKey.adminLoginFail('admin_login_test'))
    })

    it('密码错误应返回 401', async () => {
      await createAdmin({
        username: 'admin_wrong_pwd',
        password: await (await import('bcrypt')).hash('Admin@123', 12),
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { username: 'admin_wrong_pwd', password: 'WrongPassword' },
      })

      expect(res.statusCode).toBe(401)
      await redis.del(RedisKey.adminLoginFail('admin_wrong_pwd'))
    })

    it('连续 5 次失败后应锁定账号', async () => {
      const admin = await createAdmin({
        username: 'admin_lock_test',
        password: await (await import('bcrypt')).hash('Admin@123', 12),
      })

      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/admin/login',
          payload: { username: 'admin_lock_test', password: 'wrong_password' },
        })
      }

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { username: 'admin_lock_test', password: 'Admin@123' },
      })

      expect(res.statusCode).toBe(429)
      const body = JSON.parse(res.body)
      expect(body.errorKey).toBe('ADMIN_ACCOUNT_LOCKED')

      await redis.del(RedisKey.adminLocked('admin_lock_test'))
      await redis.del(RedisKey.adminLoginFail('admin_lock_test'))
      await redis.del(RedisKey.adminRefreshToken(admin.id))
    })
  })

  describe('POST /api/admin/logout', () => {
    it('应成功退出登录', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/logout',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.code).toBe(0)
    })
  })

  describe('POST /api/admin/refresh', () => {
    it('缺少 refresh_token 应返回 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/refresh',
        payload: {},
      })

      expect(res.statusCode).toBe(400)
    })

    it('无效 refresh_token 应返回 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/refresh',
        payload: { refresh_token: 'invalid.token.here' },
      })

      expect(res.statusCode).toBe(401)
    })
  })
})
