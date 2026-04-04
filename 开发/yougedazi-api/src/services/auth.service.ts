import axios from 'axios'
import bcrypt from 'bcrypt'
import { createHash } from 'crypto'
import { prisma } from '../lib/prisma'
import { redis, RedisKey } from '../lib/redis'
import { OrderError } from './order.service'
import { ErrorCode, AdminRole } from '../types/index'

const BCRYPT_COST = 12
const MAX_LOGIN_ATTEMPTS = 5
const LOCK_DURATION_SECONDS = 30 * 60   // 30分钟

/**
 * 判断是否使用模拟微信登录（开发测试模式）
 * 满足以下任一条件时启用模拟登录：
 * 1. WX_MOCK_LOGIN=true
 * 2. AppID以"TODO_"开头
 */
function isMockWxLogin(appId: string | undefined): boolean {
  if (process.env.WX_MOCK_LOGIN === 'true') return true
  if (appId?.startsWith('TODO_')) return true
  return false
}

/**
 * 生成模拟的openid（开发测试使用）
 * 使用code的hash值确保同一code返回相同openid
 */
function generateMockOpenid(code: string, role: string): string {
  const hash = createHash('md5').update(`${code}_${role}_mock`).digest('hex')
  return `mock_${role}_${hash.substring(0, 16)}`
}

/**
 * AuthService
 *
 * 职责：
 * 1. 微信登录（C端/B端）：code → openid → 查/建用户 → 签发双 token
 * 2. Admin 登录：账号密码 + 防暴力破解
 * 3. Refresh Token 轮换
 */
export class AuthService {
  /**
   * 微信登录
   *
   * @param code     wx.login() 返回的 code
   * @param role     'user'(C端) | 'companion'(B端)
   * @param nickname 用户昵称（可选，首次登录写入）
   * @param avatar   用户头像（可选）
   * @param signJwt  由 Fastify app.jwt.sign 注入，避免 AuthService 直接依赖 Fastify
   */
  async wxLogin(
    code: string,
    role: 'user' | 'companion',
    nickname: string | undefined,
    avatar: string | undefined,
    signJwt: (payload: object, options?: object) => string
  ) {
    // 1. 根据角色选择正确的 AppID/AppSecret
    const appId     = role === 'user' ? process.env.WX_C_APP_ID     : process.env.WX_B_APP_ID
    const appSecret = role === 'user' ? process.env.WX_C_APP_SECRET : process.env.WX_B_APP_SECRET

    let openid: string

    // 2. 判断是否使用模拟登录（开发测试模式）
    if (isMockWxLogin(appId)) {
      console.log(`[MOCK] 微信登录（${role}端）- 开发测试模式`)
      console.log(`[MOCK] 使用模拟openid，code: ${code.substring(0, 10)}...`)
      openid = generateMockOpenid(code, role)
    } else {
      // 生产模式：检查配置
      if (!appId || !appSecret) {
        throw new Error(`微信 ${role} 端 AppID/AppSecret 未配置`)
      }

      // 3. 调微信 code2Session
      const { data } = await axios.get<{ openid?: string; errcode?: number; errmsg?: string }>(
        'https://api.weixin.qq.com/sns/jscode2session',
        {
          params: { appid: appId, secret: appSecret, js_code: code, grant_type: 'authorization_code' },
          timeout: 5000,
        }
      )

      if (!data.openid || data.errcode) {
        throw new OrderError(
          ErrorCode.WX_LOGIN_FAILED,
          'WX_LOGIN_FAILED',
          `微信登录失败：${data.errmsg ?? '未知错误'}`
        )
      }

      openid = data.openid
    }

    // 4. 查找或创建用户/陪玩师
    let id: string

    if (role === 'user') {
      const user = await prisma.user.upsert({
        where:  { openid },
        update: {},    // 已有用户不覆盖任何字段（由用户主动编辑资料）
        create: {
          openid,
          nickname: nickname ?? null,
          avatar:   avatar ?? null,
        },
      })

      if (user.status === 'banned') {
        throw new OrderError(ErrorCode.FORBIDDEN, 'USER_BANNED', '账号已被封禁')
      }

      id = user.id
    } else {
      const companion = await prisma.companion.upsert({
        where:  { openid },
        update: {},
        create: {
          openid,
          nickname: nickname ?? null,
          avatar:   avatar ?? null,
        },
      })

      id = companion.id
    }

    // 5. 签发双 token（iss: ppmate-client，jti 确保每次签发唯一）
    const accessToken = signJwt(
      { sub: id, role, iss: 'ppmate-client', jti: crypto.randomUUID() },
      { expiresIn: '7d' }
    )
    const refreshToken = signJwt(
      { sub: id, role, iss: 'ppmate-client', type: 'refresh', jti: crypto.randomUUID() },
      { expiresIn: '30d' }
    )

    // 5. Refresh Token 存 Redis（单用户单 token，覆盖旧的）
    await redis.setex(RedisKey.refreshToken(id), 30 * 24 * 3600, refreshToken)

    return { access_token: accessToken, refresh_token: refreshToken, id, role }
  }

  /**
   * Refresh Token 轮换
   * 安全策略：单次使用即作废，签发全新双 token
   */
  async refreshTokens(
    refreshToken: string,
    verifyJwt: (token: string) => { sub: string; role: 'user' | 'companion'; iss: string },
    signJwt: (payload: object, options?: object) => string
  ) {
    const decoded = verifyJwt(refreshToken)

    if (decoded.iss !== 'ppmate-client') {
      throw new OrderError(ErrorCode.TOKEN_INVALID, 'TOKEN_INVALID', '无效的 token')
    }

    // 验证 Redis 中存储的 refresh token 是否一致（防重放）
    const stored = await redis.get(RedisKey.refreshToken(decoded.sub))
    if (!stored || stored !== refreshToken) {
      throw new OrderError(ErrorCode.TOKEN_INVALID, 'TOKEN_INVALID', 'Refresh Token 已失效，请重新登录')
    }

    // 删除旧 token（单次使用）
    await redis.del(RedisKey.refreshToken(decoded.sub))

    // 签发新双 token（jti 确保每次签发唯一，防止同秒内产生相同 token）
    const newAccessToken = signJwt(
      { sub: decoded.sub, role: decoded.role, iss: 'ppmate-client', jti: crypto.randomUUID() },
      { expiresIn: '7d' }
    )
    const newRefreshToken = signJwt(
      { sub: decoded.sub, role: decoded.role, iss: 'ppmate-client', type: 'refresh', jti: crypto.randomUUID() },
      { expiresIn: '30d' }
    )

    await redis.setex(RedisKey.refreshToken(decoded.sub), 30 * 24 * 3600, newRefreshToken)

    return { access_token: newAccessToken, refresh_token: newRefreshToken }
  }

  /**
   * Admin 账号密码登录
   *
   * 安全防护：
   * 1. 先检查账号是否被锁定（Redis admin:locked:{username}）
   * 2. bcrypt.compare（cost=12）
   * 3. 失败累计：INCR admin:login_fail:{username}，5次后锁定30min
   * 4. 成功：清除失败计数
   * 5. 签发双 token：access（8h）+ refresh（7d，存 Redis，支持 Rotation）
   */
  async adminLogin(
    username: string,
    password: string,
    signJwt: (payload: object, options?: object) => string
  ) {
    // 1. 检查锁定状态
    const isLocked = await redis.exists(RedisKey.adminLocked(username))
    if (isLocked) {
      throw new OrderError(
        ErrorCode.ADMIN_ACCOUNT_LOCKED,
        'ADMIN_ACCOUNT_LOCKED',
        '账号已被锁定，请30分钟后再试'
      )
    }

    // 2. 查询管理员账号
    const admin = await prisma.adminUser.findUnique({ where: { username } })

    // 3. 验证密码（即使账号不存在也要走 bcrypt 流程，防止用户枚举时序攻击）
    const dummyHash = '$2b$12$dummyhashfortimingatttack000000000000000000000'
    const hash = admin?.password ?? dummyHash
    const isValid = await bcrypt.compare(password, hash)

    if (!admin || !isValid || !admin.is_active) {
      // 记录失败次数
      const failKey = RedisKey.adminLoginFail(username)
      const attempts = await redis.incr(failKey)
      await redis.expire(failKey, LOCK_DURATION_SECONDS)

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        await redis.setex(RedisKey.adminLocked(username), LOCK_DURATION_SECONDS, '1')
        await redis.del(failKey)
        throw new OrderError(
          ErrorCode.ADMIN_ACCOUNT_LOCKED,
          'ADMIN_ACCOUNT_LOCKED',
          `登录失败次数过多，账号已锁定 ${LOCK_DURATION_SECONDS / 60} 分钟`
        )
      }

      const remaining = MAX_LOGIN_ATTEMPTS - attempts
      throw new OrderError(
        ErrorCode.ADMIN_LOGIN_FAILED,
        'ADMIN_LOGIN_FAILED',
        `用户名或密码错误，还可尝试 ${remaining} 次`
      )
    }

    // 4. 登录成功：清除失败计数
    await redis.del(RedisKey.adminLoginFail(username))

    // 5. 更新最后登录时间
    await prisma.adminUser.update({
      where: { id: admin.id },
      data:  { last_login_at: new Date() },
    })

    // 6. 签发双 token（access: 8h，refresh: 7d，jti 确保每次签发唯一）
    const accessToken = signJwt(
      { sub: admin.id, role: admin.role, iss: 'ppmate-admin', jti: crypto.randomUUID() },
      { expiresIn: '8h' }
    )
    const refreshToken = signJwt(
      { sub: admin.id, role: admin.role, iss: 'ppmate-admin', type: 'refresh', jti: crypto.randomUUID() },
      { expiresIn: '7d' }
    )

    // 存 Redis（单设备单 token，覆盖旧的；TTL 7天）
    await redis.setex(RedisKey.adminRefreshToken(admin.id), 7 * 24 * 3600, refreshToken)

    return {
      access_token:  accessToken,
      refresh_token: refreshToken,
      admin: {
        id:           admin.id,
        username:     admin.username,
        display_name: admin.display_name,
        role:         admin.role,
      },
    }
  }

  /**
   * Admin Refresh Token 轮换
   * 单次使用即作废，签发新的双 token
   */
  async adminRefreshTokens(
    refreshToken: string,
    verifyJwt: (token: string) => { sub: string; role: AdminRole; iss: string },
    signJwt: (payload: object, options?: object) => string
  ) {
    let decoded: { sub: string; role: AdminRole; iss: string }
    try {
      decoded = verifyJwt(refreshToken)
    } catch {
      throw new OrderError(ErrorCode.TOKEN_INVALID, 'TOKEN_INVALID', 'Admin Refresh Token 无效或已过期')
    }

    if (decoded.iss !== 'ppmate-admin') {
      throw new OrderError(ErrorCode.TOKEN_INVALID, 'TOKEN_INVALID', '无效的 token 类型')
    }

    // 验证 Redis 中存储的 refresh token 是否一致（防重放）
    const stored = await redis.get(RedisKey.adminRefreshToken(decoded.sub))
    if (!stored || stored !== refreshToken) {
      throw new OrderError(ErrorCode.TOKEN_INVALID, 'TOKEN_INVALID', 'Admin Refresh Token 已失效，请重新登录')
    }

    // 删除旧 token（单次使用）
    await redis.del(RedisKey.adminRefreshToken(decoded.sub))

    // 签发新双 token（jti 确保每次签发唯一）
    const newAccessToken = signJwt(
      { sub: decoded.sub, role: decoded.role, iss: 'ppmate-admin', jti: crypto.randomUUID() },
      { expiresIn: '8h' }
    )
    const newRefreshToken = signJwt(
      { sub: decoded.sub, role: decoded.role, iss: 'ppmate-admin', type: 'refresh', jti: crypto.randomUUID() },
      { expiresIn: '7d' }
    )

    await redis.setex(RedisKey.adminRefreshToken(decoded.sub), 7 * 24 * 3600, newRefreshToken)

    return { access_token: newAccessToken, refresh_token: newRefreshToken }
  }

  /**
   * 创建初始 Admin 账号（仅供 seed 使用，不暴露为 API）
   */
  async createAdminUser(username: string, password: string, role = 'super_admin') {
    const hash = await bcrypt.hash(password, BCRYPT_COST)
    return prisma.adminUser.create({
      data: { username, password: hash, role: role as 'super_admin' },
    })
  }
}

export const authService = new AuthService()
