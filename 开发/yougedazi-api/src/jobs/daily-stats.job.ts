import { Worker } from 'bullmq'
import { bullmqConnection, dailyStatsQueue } from '../lib/bullmq'
import { prisma } from '../lib/prisma'
import dayjs from 'dayjs'

/**
 * DailyStats Job
 *
 * 设计原则：
 * - 禁止在 Admin 接口直接做全表 COUNT（性能差）
 * - 每小时 cron 聚合写入 daily_stats，Admin 图表读此表
 * - 每天 00:05 汇总前一天全天数据（stat_hour = null）
 */
/**
 * 注册每小时聚合 cron（在 app 启动时调用）
 */
export async function scheduleHourlyStats() {
  // 避免重复添加（使用固定 jobId）
  await dailyStatsQueue.add(
    'hourly_stats',
    {},
    {
      repeat: { pattern: '0 * * * *' },   // 每小时整点
      jobId: 'hourly_stats_cron',
    }
  )

  await dailyStatsQueue.add(
    'daily_summary',
    {},
    {
      repeat: { pattern: '5 0 * * *' },   // 每天 00:05
      jobId: 'daily_summary_cron',
    }
  )

  console.log('[DailyStats] Cron jobs scheduled')
}

export function startDailyStatsWorker() {
  const worker = new Worker(
    'daily-stats',
    async (job) => {
      if (job.name === 'hourly_stats') {
        await aggregateHourlyStats()
      } else if (job.name === 'daily_summary') {
        await aggregateDailySummary()
      }
    },
    { connection: bullmqConnection }
  )

  worker.on('failed', (job, err) => {
    console.error(`[DailyStats Worker] Job ${job?.name} 失败:`, err.message)
  })

  return worker
}

async function aggregateHourlyStats() {
  const now  = dayjs()
  const hour = now.hour()
  const date = now.format('YYYY-MM-DD')

  const startOfHour = now.startOf('hour').toDate()
  const endOfHour   = now.endOf('hour').toDate()

  const [orderCount, completedCount, cancelledCount, gmvResult, newUsers] = await Promise.all([
    prisma.order.count({
      where: { created_at: { gte: startOfHour, lte: endOfHour } },
    }),
    prisma.order.count({
      where: { status: 'completed', completed_at: { gte: startOfHour, lte: endOfHour } },
    }),
    prisma.order.count({
      where: { status: 'cancelled', cancelled_at: { gte: startOfHour, lte: endOfHour } },
    }),
    prisma.order.aggregate({
      _sum: { total_amount: true },
      where: { status: 'completed', completed_at: { gte: startOfHour, lte: endOfHour } },
    }),
    prisma.user.count({
      where: { created_at: { gte: startOfHour, lte: endOfHour } },
    }),
  ])

  await prisma.dailyStat.upsert({
    where: { stat_date_stat_hour: { stat_date: date, stat_hour: hour } },
    update: {
      order_count:     orderCount,
      completed_count: completedCount,
      cancelled_count: cancelledCount,
      gmv:             gmvResult._sum.total_amount ?? 0,
      new_users:       newUsers,
    },
    create: {
      stat_date:       date,
      stat_hour:       hour,
      order_count:     orderCount,
      completed_count: completedCount,
      cancelled_count: cancelledCount,
      gmv:             gmvResult._sum.total_amount ?? 0,
      new_users:       newUsers,
    },
  })

  console.log(`[DailyStats] 小时聚合完成：${date} ${hour}:00`)
}

async function aggregateDailySummary() {
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD')

  // 汇总昨天所有小时数据
  const hourlyStats = await prisma.dailyStat.findMany({
    where: {
      stat_date: yesterday,
      stat_hour: { not: null },
    },
  })

  const summary = hourlyStats.reduce(
    (acc, stat) => ({
      order_count:     acc.order_count     + stat.order_count,
      completed_count: acc.completed_count + stat.completed_count,
      cancelled_count: acc.cancelled_count + stat.cancelled_count,
      gmv:             acc.gmv             + stat.gmv,
      new_users:       acc.new_users       + stat.new_users,
      active_users:    acc.active_users    + stat.active_users,
    }),
    { order_count: 0, completed_count: 0, cancelled_count: 0, gmv: 0, new_users: 0, active_users: 0 }
  )

  await prisma.dailyStat.upsert({
    where: { stat_date_stat_hour: { stat_date: yesterday, stat_hour: null } },
    update: summary,
    create: { stat_date: yesterday, stat_hour: null, ...summary },
  })

  console.log(`[DailyStats] 日汇总完成：${yesterday}`)
}
