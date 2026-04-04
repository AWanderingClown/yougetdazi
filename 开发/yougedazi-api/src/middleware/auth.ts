import { FastifyRequest, FastifyReply } from 'fastify'
import { ClientJwtPayload, ErrorCode } from '../types/index'

/**
 * 从请求中提取token
 * 优先级：cookie > Authorization header
 * 支持Web端httpOnly cookie和小程序端header传递
 */
function extractToken(request: FastifyRequest): string | undefined {
  // 1. 优先从cookie读取（Web端httpOnly cookie）
  const cookieToken = request.cookies.token
  if (cookieToken) {
    return cookieToken
  }
  
  // 2. 从Authorization header读取（小程序端）
  const authHeader = request.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '')
  }
  
  return undefined
}

/**
 * C端/B端通用 JWT 认证中间件
 *
 * 验证规则：
 * 1. 从cookie或Authorization: Bearer <token> 读取token
 * 2. iss === 'ppmate-client'（与 Admin token 严格隔离）
 * 3. token 未过期
 * 4. 解码后挂载 request.currentUser
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = extractToken(request)
    
    if (!token) {
      reply.status(401).send({
        code: ErrorCode.UNAUTHORIZED,
        message: '缺少认证token',
        errorKey: 'TOKEN_MISSING',
      })
      return
    }

    // 使用客户端专属 JWT 验证（namespace: client，secret: JWT_SECRET）
    const decoded = await request.clientJwtVerify<ClientJwtPayload>(token)

    if (decoded.iss !== 'ppmate-client') {
      reply.status(401).send({
        code: ErrorCode.UNAUTHORIZED,
        message: '无效的 token 类型',
        errorKey: 'TOKEN_INVALID',
      })
      return
    }

    request.currentUser = {
      id:   decoded.sub,
      role: decoded.role,
    }
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string }
    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      reply.status(401).send({
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'token 已过期，请重新登录',
        errorKey: 'TOKEN_EXPIRED',
      })
    } else {
      reply.status(401).send({
        code: ErrorCode.TOKEN_INVALID,
        message: '无效的 token',
        errorKey: 'TOKEN_INVALID',
      })
    }
  }
}

/**
 * B端专用守卫：必须在 authenticate 之后使用
 * 确保当前用户身份是 companion
 */
export async function requireCompanion(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.currentUser || request.currentUser.role !== 'companion') {
    return reply.status(403).send({
      code: ErrorCode.FORBIDDEN,
      message: '仅陪玩师可访问此接口',
      errorKey: 'COMPANION_ONLY',
    })
  }
}

/**
 * C端专用守卫：确保当前用户身份是 user
 */
export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.currentUser || request.currentUser.role !== 'user') {
    return reply.status(403).send({
      code: ErrorCode.FORBIDDEN,
      message: '仅用户可访问此接口',
      errorKey: 'USER_ONLY',
    })
  }
}
