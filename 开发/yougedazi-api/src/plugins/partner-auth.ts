import { FastifyRequest, FastifyReply } from 'fastify'
import { PartnerJwtPayload, PartnerType, ErrorCode } from '../types/index'

function extractPartnerToken(request: FastifyRequest): string | undefined {
  const cookieToken = request.cookies.partner_token
  if (cookieToken) {
    return cookieToken
  }
  const authHeader = request.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '')
  }
  return undefined
}

export async function authenticatePartner(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = extractPartnerToken(request)
    
    if (!token) {
      reply.status(401).send({
        code: ErrorCode.UNAUTHORIZED,
        message: '缺少认证token',
        errorKey: 'TOKEN_MISSING',
      })
      return
    }

    const decoded = await request.partnerJwtVerify<PartnerJwtPayload>(token)

    if (decoded.iss !== 'ppmate-partner') {
      reply.status(401).send({
        code: ErrorCode.UNAUTHORIZED,
        message: '无效的 Partner token',
        errorKey: 'TOKEN_INVALID',
      })
      return
    }

    request.currentPartner = {
      id: decoded.sub,
      type: decoded.type,
    }
  } catch (err: unknown) {
    const error = err as { code?: string }
    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      reply.status(401).send({
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'Partner token 已过期，请重新登录',
        errorKey: 'TOKEN_EXPIRED',
      })
    } else {
      reply.status(401).send({
        code: ErrorCode.TOKEN_INVALID,
        message: '无效的 Partner token',
        errorKey: 'TOKEN_INVALID',
      })
    }
  }
}

export function requirePartnerType(...types: PartnerType[]) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.currentPartner) {
      reply.status(401).send({
        code: ErrorCode.UNAUTHORIZED,
        message: '请先完成 Partner 认证',
        errorKey: 'UNAUTHORIZED',
      })
      return
    }

    if (!types.includes(request.currentPartner.type)) {
      return reply.status(403).send({
        code: ErrorCode.FORBIDDEN,
        message: `此操作需要以下合作商类型之一：${types.join(', ')}`,
        errorKey: 'PARTNER_TYPE_MISMATCH',
      })
    }
  }
}
