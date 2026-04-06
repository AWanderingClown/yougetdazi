import { Queue, Worker, QueueEvents } from 'bullmq'

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL environment variable is required')
}

// BullMQ 使用独立的 Redis 连接配置
const redisUrl = new URL(process.env.REDIS_URL)
const connection = {
  host:     redisUrl.hostname,
  port:     parseInt(redisUrl.port || '6379'),
  password: redisUrl.password || undefined,
}

// ============================================================
// 队列定义
// ============================================================

/**
 * 订单超时处理队列
 *
 * Job 类型：
 * - payment_timeout: 支付超时（15min），取消订单，无需退款
 * - accept_timeout:  待接单超时（15min），取消订单，全额退款
 * - service_timeout: 服务时长到期，自动完成订单
 */
export const orderTimeoutQueue = new Queue('order-timeout', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 200 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    timeout: 25000,  // Job 超时：25秒（需要小于 lockDuration）
  },
})

/**
 * 每日统计聚合队列
 *
 * Job 类型：
 * - hourly_stats: 每小时写入 daily_stats
 * - daily_summary: 每天 00:05 汇总前一天全天数据
 */
export const dailyStatsQueue = new Queue('daily-stats', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail:     { count: 100 },
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 30000,
    },
  },
})

// ============================================================
// 队列事件监听（日志用）
// ============================================================

const orderTimeoutEvents = new QueueEvents('order-timeout', { connection })

orderTimeoutEvents.on('completed', ({ jobId }) => {
  console.log(`[BullMQ] order-timeout job ${jobId} completed`)
})

orderTimeoutEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`[BullMQ] order-timeout job ${jobId} failed: ${failedReason}`)
})

export { connection as bullmqConnection, orderTimeoutEvents }
