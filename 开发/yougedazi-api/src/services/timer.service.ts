import { Worker } from 'bullmq'
import type { FastifyBaseLogger } from 'fastify'
import { bullmqConnection } from '../lib/bullmq'
import { prisma } from '../lib/prisma'
import { orderService } from './order.service'
import { pushBridgeService, PushEvent } from './push-bridge.service'
import { dispatchPushEvents } from '../utils/push-helper.js'

/**
 * TimerService / BullMQ Worker
 *
 * 处理所有订单超时任务：
 * 1. payment_timeout   — 支付超时（15min），取消订单
 * 2. accept_timeout    — 待接单超时（15min），取消订单，全额退款
 * 3. service_timeout   — 服务时长到期，自动完成订单
 * 4. auto_review       — 24h 自动好评
 */
export function startOrderTimeoutWorker(logger: FastifyBaseLogger) {
  const worker = new Worker(
    'order-timeout',
    async (job) => {
      const { orderId, userId, companionId } = job.data as {
        orderId: string
        companionId?: string
        userId?: string
      }

      logger.info(`[Worker] 处理超时 Job: ${job.name}, orderId: ${orderId}`)

      try {
        switch (job.name) {
          case 'payment_timeout': {
            // 支付超时取消（pending_payment → cancelled，无需退款）
            const r1 = await orderService.cancelOrder(orderId, 'system', 'system', '支付超时，系统自动取消')
            await dispatchPushEvents(r1)
            break
          }

          case 'accept_timeout': {
            // 待接单超时取消（pending_accept/waiting_grab → cancelled，全额退款）
            const r2 = await orderService.cancelOrder(orderId, 'system', 'system', '超时未接单，系统自动取消', 100)
            await dispatchPushEvents(r2)
            break
          }

          case 'service_timeout': {
            // 服务时长到期，自动完成
            const r3 = await orderService.completeOrder(orderId, 'system', 'system')
            await dispatchPushEvents(r3)
            break
          }

          case 'auto_review':
            // 24h 自动好评：检查是否已有评价，若无则插入默认5星好评
            await handleAutoReview(orderId, userId, companionId)
            break

          default:
            logger.warn(`[Worker] 未知 Job 类型：${job.name}`)
        }
      } catch (err) {
        // 优雅处理订单不存在或状态流转非法的情况
        // 这些都是正常的竞态条件（订单可能已被其他操作处理）
        if (err instanceof Error && err.message.includes('订单不存在')) {
          logger.warn({ jobId: job.id, jobName: job.name, orderId }, '[Worker] 订单不存在，可能已被处理')
          return // 不抛出错误，正常完成
        }
        if (err instanceof Error && err.message.includes('订单状态')) {
          logger.info({ jobId: job.id, jobName: job.name, orderId, reason: err.message }, '[Worker] 订单状态已变更，跳过处理')
          return // 不抛出错误，正常完成
        }
        // 其他错误重新抛出
        throw err
      }
    },
    {
      connection: bullmqConnection,
      concurrency: 10,  // 最多同时处理 10 个超时任务
      lockDuration: 30000,  // 锁定时间：30秒（job 处理时间上限）
      lockRenewTime: 10000,  // 锁续期时间：每 10 秒续期一次，防止锁超时
    }
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err: err.message }, '[Worker] Job 执行失败')
  })

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, '[Worker] Job 执行完成')
  })

  return worker
}

/**
 * 处理自动好评逻辑
 */
async function handleAutoReview(
  orderId: string,
  userId?: string,
  companionId?: string
) {
  // 如果没有必要参数，从订单查询
  if (!userId || !companionId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { user_id: true, companion_id: true },
    })
    if (!order) {
      // 此函数在 worker 闭包中，logger 不在作用域内，用结构化 console.warn
      console.warn(JSON.stringify({ level: 'warn', msg: '[Worker] 自动好评失败: 订单不存在', orderId }))
      return
    }
    userId = order.user_id
    companionId = order.companion_id || undefined
  }

  // 如果没有陪玩师ID，无法评价
  if (!companionId) {
    return
  }

  try {
    // 幂等检查：是否已有评价
    const existingReview = await prisma.review.findUnique({
      where: { order_id: orderId },
    })

    if (existingReview) {
      return
    }

    // 创建默认5星好评
    await prisma.review.create({
      data: {
        order_id: orderId,
        user_id: userId,
        companion_id: companionId,
        rating: 5,
        content: '',
        is_auto: true,
      },
    })
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', msg: '[Worker] 自动好评失败', orderId, err: String(error) }))
    throw error  // 抛出错误让 BullMQ 重试
  }
}
