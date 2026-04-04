import { FastifyRequest, FastifyReply } from 'fastify'
import { AdminJwtPayload, AdminRole, ErrorCode } from '../types/index'

/**
 * 从请求中提取admin token
 * 优先级：cookie > Authorization header
 * 支持Web端httpOnly cookie
 */
function extractAdminToken(request: FastifyRequest): string | undefined {
  // 1. 优先从cookie读取（Web端httpOnly cookie）
  const cookieToken = request.cookies.admin_token
  if (cookieToken) {
    return cookieToken
  }
  
  // 2. 从Authorization header读取（兼容旧方式）
  const authHeader = request.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '')
  }
  
  return undefined
}

/**
 * Admin JWT 认证中间件
 *
 * 验证规则：
 * 1. 从cookie或Authorization header读取token
 * 2. iss === 'ppmate-admin'（严格与 C/B 端 token 隔离）
 * 3. token 未过期（Admin access token 有效期 8h，refresh token 有效期 7d）
 * 4. 解码后挂载 request.currentAdmin
 */
export async function authenticateAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = extractAdminToken(request)
    
    if (!token) {
      reply.status(401).send({
        code: ErrorCode.UNAUTHORIZED,
        message: '缺少认证token',
        errorKey: 'TOKEN_MISSING',
      })
      return
    }

    // 使用 Admin 专属 JWT 验证（namespace: admin，secret: ADMIN_JWT_SECRET）
    const decoded = await request.adminJwtVerify<AdminJwtPayload>(token)

    if (decoded.iss !== 'ppmate-admin') {
      reply.status(401).send({
        code: ErrorCode.UNAUTHORIZED,
        message: '无效的 Admin token',
        errorKey: 'TOKEN_INVALID',
      })
      return
    }

    request.currentAdmin = {
      id:   decoded.sub,
      role: decoded.role,
    }
  } catch (err: unknown) {
    const error = err as { code?: string }
    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      reply.status(401).send({
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'Admin token 已过期，请重新登录',
        errorKey: 'TOKEN_EXPIRED',
      })
    } else {
      reply.status(401).send({
        code: ErrorCode.TOKEN_INVALID,
        message: '无效的 Admin token',
        errorKey: 'TOKEN_INVALID',
      })
    }
  }
}

/**
 * Admin 角色权限守卫工厂函数
 *
 * 使用方式：preHandler: [authenticateAdmin, requireAdminRole('super_admin', 'operator')]
 *
 * 权限矩阵（参考架构文档）：
 * - super_admin: 全部权限
 * - operator:    陪玩师审核、订单干预、用户封禁（读写）
 * - finance:     保证金审批、结算打款、手续费配置（读写）
 * - viewer:      全部只读
 */
export function requireAdminRole(...roles: AdminRole[]) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.currentAdmin) {
      reply.status(401).send({
        code: ErrorCode.UNAUTHORIZED,
        message: '请先完成 Admin 认证',
        errorKey: 'UNAUTHORIZED',
      })
      return
    }

    if (!roles.includes(request.currentAdmin.role)) {
      return reply.status(403).send({
        code: ErrorCode.FORBIDDEN,
        message: `此操作需要以下角色之一：${roles.join(', ')}`,
        errorKey: 'INSUFFICIENT_ROLE',
      })
    }
  }
}
