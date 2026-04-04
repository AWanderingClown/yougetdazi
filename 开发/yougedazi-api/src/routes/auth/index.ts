import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ErrorCode } from '../../types/index'
import { authService } from '../../services/auth.service'

// ============================================================
// Zod 输入验证 Schema
// ============================================================

const WxLoginSchema = z.object({
  code:     z.string().min(1, 'code 不能为空'),
  role:     z.enum(['user', 'companion']),    // 区分 C端还是 B端小程序
  nickname: z.string().max(64).optional(),
  avatar:   z.string().url().optional(),
})

const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
})

const AdminLoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(6).max(128),
})

// ============================================================
// Cookie 配置
// ============================================================

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 8 * 60 * 60 * 1000, // 8小时
}

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth/refresh',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
}

// ============================================================
// 路由注册
// ============================================================

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/wx-login
   *
   * C端/B端 微信登录
   * 流程：wx.login() code → 调微信 code2Session → 查/建用户 → 签发双 token
   *
   * C端 AppID：WX_C_APP_ID
   * B端 AppID：WX_B_APP_ID（由 role 字段区分走哪个 AppID）
   */
  app.post('/api/auth/wx-login', async (request, reply) => {
    const parseResult = WxLoginSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:     ErrorCode.VALIDATION_ERROR,
        message:  '参数校验失败',
        errorKey: 'VALIDATION_ERROR',
        details:  parseResult.error.flatten(),
      })
    }

    const { code, role, nickname, avatar } = parseResult.data

    try {
      const result = await authService.wxLogin(
        code,
        role,
        nickname,
        avatar,
        (payload, options) => app.jwt.client.sign(payload as object, options as object)
      )
      
      // 设置httpOnly cookie（Web端使用）
      reply.setCookie('token', result.access_token, COOKIE_OPTIONS)
      reply.setCookie('refresh_token', result.refresh_token, REFRESH_COOKIE_OPTIONS)
      
      return reply.status(200).send({
        code:    ErrorCode.SUCCESS,
        message: '登录成功',
        data:    result,
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        const status = error.code === ErrorCode.FORBIDDEN ? 403 : 401
        return reply.status(status).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      app.log.error(err, '微信登录内部错误')
      return reply.status(500).send({
        code:     ErrorCode.INTERNAL_ERROR,
        message:  process.env.NODE_ENV !== 'production' ? (error.message ?? '服务器内部错误') : '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * POST /api/auth/refresh
   *
   * 刷新 Access Token
   * 安全策略：Refresh Token 单次使用即作废，签发新的双 token（Rotation）
   */
  app.post('/api/auth/refresh', async (request, reply) => {
    // 优先从cookie读取，其次从body读取
    const refreshTokenFromCookie = request.cookies.refresh_token
    const parseResult = RefreshTokenSchema.safeParse(request.body)
    const refresh_token = refreshTokenFromCookie || parseResult.data?.refresh_token
    
    if (!refresh_token) {
      return reply.status(400).send({
        code:     ErrorCode.VALIDATION_ERROR,
        message:  '缺少 refresh_token',
        errorKey: 'VALIDATION_ERROR',
      })
    }

    try {
      const result = await authService.refreshTokens(
        refresh_token,
        (token) => app.jwt.client.verify(token) as { sub: string; role: 'user' | 'companion'; iss: string },
        (payload, options) => app.jwt.client.sign(payload as object, options as object)
      )
      
      // 更新httpOnly cookie
      reply.setCookie('token', result.access_token, COOKIE_OPTIONS)
      reply.setCookie('refresh_token', result.refresh_token, REFRESH_COOKIE_OPTIONS)
      
      return reply.status(200).send({
        code:    ErrorCode.SUCCESS,
        message: 'Token 刷新成功',
        data:    result,
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        return reply.status(401).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      return reply.status(401).send({
        code:     ErrorCode.TOKEN_INVALID,
        message:  'Token 无效，请重新登录',
        errorKey: 'TOKEN_INVALID',
      })
    }
  })

  /**
   * POST /api/admin/login
   *
   * Admin 账号密码登录（不走微信，独立账户体系）
   * 安全策略：
   * - bcrypt.compare（cost=12）
   * - 连续失败 5 次 → Redis 锁账号 30min（key: admin:locked:{username}）
   * - 签发双 token：access（8h）+ refresh（7d，Rotation 策略）
   * - 使用httpOnly cookie存储token（防XSS）
   */
  app.post('/api/admin/login', async (request, reply) => {
    const parseResult = AdminLoginSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:     ErrorCode.VALIDATION_ERROR,
        message:  '参数校验失败',
        errorKey: 'VALIDATION_ERROR',
      })
    }

    const { username, password } = parseResult.data

    try {
      const result = await authService.adminLogin(
        username,
        password,
        (payload, options) => app.jwt.admin.sign(payload as object, options as object)
      )
      
      // 设置httpOnly cookie（Web端安全管理）
      reply.setCookie('admin_token', result.access_token, COOKIE_OPTIONS)
      reply.setCookie('admin_refresh_token', result.refresh_token, {
        ...REFRESH_COOKIE_OPTIONS,
        path: '/api/admin/refresh',
      })
      
      // 为了兼容前端改造过渡，同时返回token（前端不再使用，仅保留）
      return reply.status(200).send({
        code:    ErrorCode.SUCCESS,
        message: '登录成功',
        data:    {
          // 不再返回access_token给前端存储，仅返回admin信息
          admin: result.admin,
        },
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        const status = error.code === ErrorCode.ADMIN_ACCOUNT_LOCKED ? 429 : 401
        return reply.status(status).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      app.log.error(err, 'Admin 登录内部错误')
      return reply.status(500).send({
        code:     ErrorCode.INTERNAL_ERROR,
        message:  '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * POST /api/admin/logout
   *
   * Admin 退出登录
   * 清除httpOnly cookie
   */
  app.post('/api/admin/logout', async (request, reply) => {
    reply.clearCookie('admin_token', { path: '/' })
    reply.clearCookie('admin_refresh_token', { path: '/api/admin/refresh' })
    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: '退出成功',
    })
  })

  /**
   * POST /api/admin/refresh
   *
   * Admin Refresh Token 轮换
   * 安全策略：单次使用即作废，签发新双 token（Rotation）
   */
  app.post('/api/admin/refresh', async (request, reply) => {
    // 优先从cookie读取，其次从body读取
    const refreshTokenFromCookie = request.cookies.admin_refresh_token
    const parseResult = RefreshTokenSchema.safeParse(request.body)
    const refresh_token = refreshTokenFromCookie || parseResult.data?.refresh_token
    
    if (!refresh_token) {
      return reply.status(400).send({
        code:     ErrorCode.VALIDATION_ERROR,
        message:  '缺少 refresh_token',
        errorKey: 'VALIDATION_ERROR',
      })
    }

    try {
      const result = await authService.adminRefreshTokens(
        refresh_token,
        (token) => app.jwt.admin.verify(token) as { sub: string; role: string; iss: string },
        (payload, options) => app.jwt.admin.sign(payload as object, options as object)
      )
      
      // 更新httpOnly cookie
      reply.setCookie('admin_token', result.access_token, COOKIE_OPTIONS)
      reply.setCookie('admin_refresh_token', result.refresh_token, {
        ...REFRESH_COOKIE_OPTIONS,
        path: '/api/admin/refresh',
      })
      
      return reply.status(200).send({
        code:    ErrorCode.SUCCESS,
        message: 'Token 刷新成功',
        data:    result,
      })
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; errorKey?: string; message?: string }
      if (error.name === 'OrderError') {
        return reply.status(401).send({
          code:     error.code,
          message:  error.message,
          errorKey: error.errorKey,
        })
      }
      return reply.status(401).send({
        code:     ErrorCode.TOKEN_INVALID,
        message:  'Token 无效，请重新登录',
        errorKey: 'TOKEN_INVALID',
      })
    }
  })
}
