import { pathToFileURL } from 'url'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'

import { redis } from './lib/redis.js'
import { authRoutes } from './routes/auth/index.js'
import { cRoutes } from './routes/c/index.js'
import { bRoutes } from './routes/b/index.js'
import { adminRoutes } from './routes/admin/index.js'
import { webhookRoutes } from './routes/webhook/wxpay.js'
import locationRoutes from './routes/location.routes.js'
import configRoutes from './routes/config.routes.js'
import { startOrderTimeoutWorker } from './services/timer.service.js'
import { startDailyStatsWorker, scheduleHourlyStats } from './jobs/daily-stats.job.js'
import { orderTimeoutEvents } from './lib/bullmq.js'
import { ErrorCode } from './types/index.js'
import requestFormatter from './middleware/request-formatter.js'

// ============================================================
// buildApp：每次调用创建全新 Fastify 实例（测试隔离必需）
// ============================================================

export async function buildApp() {
  const isTestEnv = process.env.NODE_ENV === 'test'

  const app = Fastify({
    logger: isTestEnv ? false : {
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  })

  // ============================================================
  // 插件注册
  // ============================================================

  // Helmet（安全响应头）
  await app.register(helmet, {
    contentSecurityPolicy: false,  // API 服务无需 CSP
  })

  // CORS
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : []
  if (process.env.NODE_ENV === 'production' && corsOrigins.length === 0) {
    console.warn('[Startup] 生产环境未配置 CORS_ORIGINS，将拒绝所有跨域请求')
  }
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'production'
      ? corsOrigins
      : true,   // 开发环境允许所有来源
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // Rate Limiting（全局，公开接口防刷）
  await app.register(rateLimit, {
    global: true,
    max: 200,              // 每个 IP 每分钟 200 次
    timeWindow: 60 * 1000,
    errorResponseBuilder: (_request, context) => ({
      code:     ErrorCode.TOO_MANY_REQUESTS ?? 42900,
      message:  `请求频率超限，请 ${Math.ceil(context.ttl / 1000)} 秒后重试`,
      errorKey: 'RATE_LIMIT_EXCEEDED',
    }),
  })

  // Cookie 支持（必须在 JWT 之前注册，因为 JWT 可能使用 cookie）
  await app.register(cookie)

  // 客户端 JWT（C端/B端，decoratorName: clientJwt，request.clientJwtVerify）
  await app.register(jwt, {
    secret:        process.env.JWT_SECRET!,
    decoratorName: 'clientJwt',
    namespace:     'client',
    sign:          { algorithm: 'HS256' },
    verify:        { algorithms: ['HS256'] },
  })

  // Admin JWT（独立 secret，物理隔离防止 token 跨端滥用，decoratorName: adminJwt，request.adminJwtVerify）
  await app.register(jwt, {
    secret:        process.env.ADMIN_JWT_SECRET!,
    decoratorName: 'adminJwt',
    namespace:     'admin',
    sign:          { algorithm: 'HS256' },
    verify:        { algorithms: ['HS256'] },
  })

  // 请求/响应数据格式转换（驼峰命名 ↔ 下划线命名）
  await app.register(requestFormatter, {
    transformRequest: true,
    transformResponse: true,
    skipRoutes: ['/health', '/api/webhook/*', '/api/admin/*'],
  })

  // ============================================================
  // 全局错误处理
  // ============================================================

  app.setErrorHandler((error, request, reply) => {
    const isDev = process.env.NODE_ENV !== 'production'

    if (error.name === 'OrderError') {
      const orderError = error as unknown as { code: number; errorKey: string; message: string }
      return reply.status(400).send({
        code:     orderError.code,
        message:  orderError.message,
        errorKey: orderError.errorKey,
      })
    }

    app.log.error({
      err: isDev ? error : undefined,
      path:   request.routerPath,
      method: request.method,
    }, error.message)

    return reply.status(500).send({
      code:     ErrorCode.INTERNAL_ERROR,
      message:  isDev ? error.message : '服务器内部错误',
      errorKey: 'INTERNAL_ERROR',
    })
  })

  // 404 处理
  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      code:     ErrorCode.NOT_FOUND,
      message:  '接口不存在',
      errorKey: 'NOT_FOUND',
    })
  })

  // ============================================================
  // 路由注册
  // ============================================================

  await app.register(authRoutes)
  await app.register(cRoutes)
  await app.register(bRoutes)
  await app.register(adminRoutes)
  await app.register(configRoutes)
  await app.register(webhookRoutes)
  await app.register(locationRoutes)

  // ============================================================
  // 健康检查
  // ============================================================

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  }))

  return app
}

// ============================================================
// 启动服务（仅在直接运行本文件时执行，测试导入时跳过）
// ============================================================

const isMainEntry = typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainEntry) {
  // ============================================================
  // 环境变量校验（启动时 fail-fast，仅在主入口执行）
  // ============================================================
  const REQUIRED_ENV = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'ADMIN_JWT_SECRET',
    'WX_C_APP_ID',
    'WX_C_APP_SECRET',
    'WX_B_APP_ID',
    'WX_B_APP_SECRET',
  ]

  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      console.error(`[Startup] 缺少必要环境变量：${key}`)
      process.exit(1)
    }
  }

  // 敏感字段加密密钥：生产环境必须设置，开发环境可选
  if (process.env.NODE_ENV === 'production' && !process.env.FIELD_ENCRYPT_KEY) {
    console.error('[Startup] 生产环境必须设置 FIELD_ENCRYPT_KEY')
    process.exit(1)
  }

  const app = await buildApp()

  // BullMQ Workers 启动
  const orderTimeoutWorker = startOrderTimeoutWorker(app.log)
  const dailyStatsWorker   = startDailyStatsWorker()

  const PORT = parseInt(process.env.PORT ?? '3000')

  try {
    await redis.connect()
    app.log.info('[Redis] 连接成功')

    // 注册 cron jobs（每小时统计）
    await scheduleHourlyStats()

    await app.listen({ port: PORT, host: '0.0.0.0' })
    app.log.info(`[Server] PP-Mate API 已启动，端口：${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  // 优雅退出
  const gracefulShutdown = async (signal: string) => {
    app.log.info(`[Server] 收到 ${signal}，正在关闭...`)

    await app.close()
    await orderTimeoutWorker.close()
    await dailyStatsWorker.close()
    await orderTimeoutEvents.close()
    await redis.quit()

    app.log.info('[Server] 已优雅退出')
    process.exit(0)
  }

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
  process.on('SIGINT',  () => void gracefulShutdown('SIGINT'))
}
