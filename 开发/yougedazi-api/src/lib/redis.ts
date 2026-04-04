import Redis from 'ioredis'

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL environment variable is required')
}

const isTestEnv = process.env.NODE_ENV === 'test'

// 主连接：业务逻辑（缓存、倒计时、计数器）
export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableOfflineQueue: isTestEnv, // 测试环境启用离线队列，避免连接问题导致测试失败
})

redis.on('error', (err) => {
  console.error('[Redis] connection error:', err)
})

// ============================================================
// Redis Key 命名规范（集中管理，避免 key 散落在代码各处）
// ============================================================

export const RedisKey = {
  /** 订单服务倒计时（value: 剩余秒数，由 BullMQ Delayed Job 权威管理） */
  orderTimer: (orderId: string) => `order:timer:${orderId}`,

  /** 待接单超时标记 */
  orderAcceptDeadline: (orderId: string) => `order:accept_deadline:${orderId}`,

  /** Admin 登录失败计数（防暴力破解） */
  adminLoginFail: (username: string) => `admin:login_fail:${username}`,

  /** Admin 账号锁定标记 */
  adminLocked: (username: string) => `admin:locked:${username}`,

  /** C端/B端 Refresh Token */
  refreshToken: (userId: string) => `refresh:${userId}`,

  /** Admin Refresh Token */
  adminRefreshToken: (adminId: string) => `admin:refresh:${adminId}`,

  /** 实时统计：服务中订单数 */
  statsServingOrders: () => 'stats:serving_orders',

  /** 实时统计：待审核陪玩师数 */
  statsPendingAudit: () => 'stats:pending_audit',

  /** 微信 access_token 缓存（按 AppID 区分 C/B 端） */
  wxAccessToken: (appId: string) => `wx:access_token:${appId}`,
} as const
