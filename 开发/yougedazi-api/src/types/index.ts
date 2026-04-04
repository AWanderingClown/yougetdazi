// ============================================================
// 核心枚举类型
// ============================================================

export type OrderStatus =
  | 'pending_payment'
  | 'pending_accept'
  | 'waiting_grab'
  | 'accepted'
  | 'preparing'
  | 'departed'
  | 'serving'
  | 'completed'
  | 'cancelled'

export type OrderType = 'direct' | 'reward'

export type UserRole = 'user' | 'companion' | 'admin'

export type AdminRole = 'super_admin' | 'operator' | 'finance' | 'viewer'

export type OperatorType = 'user' | 'companion' | 'admin' | 'system'

export type AuditStatus = 'pending' | 'approved' | 'rejected'

export type UserStatus = 'active' | 'banned' | 'suspended'

export type DepositLevel = 'none' | 'basic' | 'premium'

export type MessageType = 'text' | 'image' | 'system'

// ============================================================
// 统一响应类型
// ============================================================

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data?: T
}

export interface ApiErrorResponse {
  code: number
  message: string
  errorKey?: string
}

export interface PaginatedData<T> {
  list: T[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

// ============================================================
// JWT Payload
// ============================================================

export interface ClientJwtPayload {
  sub: string                          // userId 或 companionId
  role: 'user' | 'companion'
  iss: 'ppmate-client'
  iat: number
  exp: number
}

export interface AdminJwtPayload {
  sub: string                          // adminId
  role: AdminRole
  iss: 'ppmate-admin'
  iat: number
  exp: number
}

export type JwtPayload = ClientJwtPayload | AdminJwtPayload

// ============================================================
// Fastify Request 扩展
// ============================================================

declare module 'fastify' {
  interface FastifyInstance {
    /** 客户端 JWT 实例（C端/B端，secret: JWT_SECRET） */
    clientJwt: {
      sign(payload: object, options?: object): string
      verify<T = unknown>(token: string, options?: object): T
    }
    /** Admin JWT 实例（独立 secret: ADMIN_JWT_SECRET） */
    adminJwt: {
      sign(payload: object, options?: object): string
      verify<T = unknown>(token: string, options?: object): T
    }
  }
  interface FastifyRequest {
    /** C端/B端认证后挂载 */
    currentUser?: {
      id: string
      role: 'user' | 'companion'
    }
    /** Admin 认证后挂载 */
    currentAdmin?: {
      id: string
      role: AdminRole
    }
    /** 客户端 JWT 验证方法（namespace: client） */
    clientJwtVerify<T = unknown>(options?: object): Promise<T>
    /** Admin JWT 验证方法（namespace: admin） */
    adminJwtVerify<T = unknown>(options?: object): Promise<T>
  }
}

// ============================================================
// 订单状态机：合法流转映射
// ============================================================

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['pending_accept', 'waiting_grab', 'cancelled'],
  pending_accept:  ['accepted', 'cancelled'],
  waiting_grab:    ['accepted', 'cancelled'],
  accepted:        ['preparing', 'serving', 'cancelled'],
  preparing:       ['departed', 'cancelled'],
  departed:        ['serving', 'cancelled'],
  serving:         ['completed'],
  completed:       [],
  cancelled:       [],
}

// ============================================================
// 业务错误码
// ============================================================

export const ErrorCode = {
  // 通用
  SUCCESS:                 0,
  BAD_REQUEST:         40000,
  VALIDATION_ERROR:    40001,
  UNAUTHORIZED:        40100,
  FORBIDDEN:           40300,
  NOT_FOUND:           40400,
  CONFLICT:            40900,
  TOO_MANY_REQUESTS:   42900,
  INTERNAL_ERROR:      50000,

  // 订单
  ORDER_NOT_FOUND:         40401,
  ORDER_STATUS_INVALID:    40002,
  ORDER_CANCEL_FORBIDDEN:  40301,
  ORDER_ALREADY_ACCEPTED:  40901,
  ORDER_PAYMENT_EXPIRED:   40003,

  // 认证
  TOKEN_EXPIRED:           40101,
  TOKEN_INVALID:           40102,
  WX_LOGIN_FAILED:         40103,
  ADMIN_LOGIN_FAILED:      40104,
  ADMIN_ACCOUNT_LOCKED:    40105,

  // 陪玩师
  COMPANION_NOT_AUDITED:   40302,
  COMPANION_OFFLINE:       40303,
  COMPANION_WORKING:       40304,

  // 支付
  PAYMENT_FAILED:          50001,
  REFUND_FAILED:           50002,

  // 消息
  MESSAGE_SEND_FAILED:     50010,
  SESSION_NOT_FOUND:       40410,
  
  // 通知
  NOTIFICATION_NOT_FOUND:  40420,

  // 配置
  CONFIG_NOT_FOUND:        40430,
}

export type ErrorCodeValue = typeof ErrorCode[keyof typeof ErrorCode]
