import 'dotenv/config'
import { pathToFileURL } from 'url'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import { Server as SocketServer } from 'socket.io'
import { createVerifier } from 'fast-jwt'

// ============================================================
// 环境变量
// ============================================================

const PORT = parseInt(process.env.PORT ?? '3002')

for (const key of ['JWT_SECRET', 'ADMIN_JWT_SECRET', 'PUSH_API_KEY']) {
  if (!process.env[key]) {
    console.error(`[PushServer] 缺少必要环境变量：${key}`)
    process.exit(1)
  }
}

const JWT_SECRET       = process.env.JWT_SECRET!
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET!
const PUSH_API_KEY     = process.env.PUSH_API_KEY!

// ============================================================
// 类型定义（与主后端 push-bridge.service.ts 保持一致）
// ============================================================

interface PushEvent {
  type:       'new_order' | 'new_reward_order' | 'order_status_changed' | 'companion_order_status_changed' | 'service_started' | 'order_completed' | 'new_message'
  targetType: 'user' | 'companion' | 'broadcast'
  targetId:   string
  payload:    Record<string, unknown>
}

interface PushEventBatch {
  events:    PushEvent[]
  timestamp: string
  source:    'order_service' | 'payment_service'
}

interface SocketUser {
  id:   string
  role: 'user' | 'companion' | 'admin'
}

// Push event type → Socket.IO 事件名映射
const EVENT_NAME_MAP: Record<PushEvent['type'], string> = {
  new_order:                      'order:new',
  new_reward_order:               'order:new_reward',
  order_status_changed:           'order:status_changed',
  companion_order_status_changed: 'order:status_changed',
  service_started:                'service:started',
  order_completed:                'order:completed',
  new_message:                    'message:new',
}

// ============================================================
// Fastify 实例
// ============================================================

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
})

// JWT 插件（用于 admin 路由等 Fastify 内部用途，保留以备扩展）
await app.register(jwt, {
  secret:  JWT_SECRET,
  sign:    { algorithm: 'HS256' },
  verify:  { algorithms: ['HS256'] },
})

// Socket.IO JWT 验证器（C/B端 用 JWT_SECRET，Admin 用 ADMIN_JWT_SECRET）
const socketJwtVerify      = createVerifier({ key: JWT_SECRET,       algorithms: ['HS256'] })
const adminSocketJwtVerify = createVerifier({ key: ADMIN_JWT_SECRET, algorithms: ['HS256'] })

// ============================================================
// Socket.IO 初始化
// ============================================================

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : []

const io = new SocketServer(app.server, {
  cors: {
    origin:      process.env.NODE_ENV === 'production' ? corsOrigins : '*',
    credentials: true,
  },
  transports: ['websocket'],
})

// ============================================================
// Socket.IO JWT 认证中间件
// ============================================================

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined
  if (!token) {
    return next(new Error('缺少认证 token'))
  }

  // 先验 C/B端（高频路径），再验 admin（低频），避免多数连接白跑一次异常
  try {
    const decoded = socketJwtVerify(token) as { sub: string; role: string; iss: string }
    if (decoded.iss === 'ppmate-client') {
      socket.data.user = { id: decoded.sub, role: decoded.role as 'user' | 'companion' } as SocketUser
      return next()
    }
  } catch {
    // 签名不匹配当前密钥，继续尝试 admin 密钥
  }

  try {
    const decoded = adminSocketJwtVerify(token) as { sub: string; role: string; iss: string }
    if (decoded.iss === 'ppmate-admin') {
      socket.data.user = { id: decoded.sub, role: 'admin' } as SocketUser
      return next()
    }
  } catch {
    // 两个密钥都验证失败
  }

  next(new Error('token 无效或已过期'))
})

// ============================================================
// Socket.IO 连接处理
// ============================================================

io.on('connection', (socket) => {
  const user = socket.data.user as SocketUser

  // Admin：加入监控房间，旁听所有推送事件
  if (user.role === 'admin') {
    void socket.join('admin_monitor')
    app.log.info(`[Socket] admin ${user.id} 已连接，已加入 admin_monitor`)

    socket.on('disconnect', (reason) => {
      app.log.info(`[Socket] admin ${user.id} 断开连接，原因：${reason}`)
    })
    return
  }

  // C/B端：加入用户/陪玩师专属房间
  const roomName = user.role === 'user'
    ? `user:${user.id}`
    : `companion:${user.id}`

  void socket.join(roomName)

  // B端陪玩师自动加入广播房间（接收悬赏单推送）
  if (user.role === 'companion') {
    void socket.join('companions_online')
  }

  app.log.info(`[Socket] ${user.role} ${user.id} 已连接，Room: ${roomName}`)

  const UUID_RE = /^[0-9a-f-]{36}$/i

  socket.on('join:order', (orderId: unknown) => {
    if (typeof orderId !== 'string' || !UUID_RE.test(orderId)) return
    void socket.join(`order:${orderId}`)
    app.log.info(`[Socket] ${user.id} 加入订单 Room: order:${orderId}`)
  })

  socket.on('leave:order', (orderId: unknown) => {
    if (typeof orderId !== 'string' || !UUID_RE.test(orderId)) return
    void socket.leave(`order:${orderId}`)
  })

  socket.on('disconnect', (reason) => {
    app.log.info(`[Socket] ${user.role} ${user.id} 断开连接，原因：${reason}`)
  })
})

// ============================================================
// POST /api/push/events
// 接收来自主后端(3000)的推送事件批次，转发给对应 Socket.IO Room
// ============================================================

app.post('/api/push/events', async (request, reply) => {
  // API Key 鉴权
  const apiKey = request.headers['x-push-api-key']
  if (!apiKey || apiKey !== PUSH_API_KEY) {
    app.log.warn(`[Push] 无效的 API Key，来源 IP: ${request.ip}`)
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const batch = request.body as PushEventBatch

  if (!batch?.events || !Array.isArray(batch.events) || batch.events.length === 0) {
    return reply.status(400).send({ error: '无效的请求格式或空事件列表' })
  }

  let sent = 0

  for (const event of batch.events) {
    const socketEventName = EVENT_NAME_MAP[event.type] ?? event.type

    switch (event.targetType) {
      case 'user':
        io.to(`user:${event.targetId}`).emit(socketEventName, event.payload)
        sent++
        break

      case 'companion':
        io.to(`companion:${event.targetId}`).emit(socketEventName, event.payload)
        sent++
        break

      case 'broadcast':
        io.to('companions_online').emit(socketEventName, event.payload)
        sent++
        break

      default:
        app.log.warn(`[Push] 未知的 targetType: ${event.targetType}`)
    }
  }

  // 整批事件一次性抄送管理后台（一次序列化，避免循环内多次 emit）
  io.to('admin_monitor').emit('monitor:batch', {
    events:    batch.events.map(e => ({
      type:       e.type,
      targetType: e.targetType,
      targetId:   e.targetId,
      payload:    e.payload,
    })),
    source:    batch.source,
    timestamp: batch.timestamp,
  })

  app.log.info(
    `[Push] 来源: ${batch.source}，收到 ${batch.events.length} 个事件，已推送 ${sent} 个`
  )

  return reply.send({ success: true, sent, total: batch.events.length })
})

// ============================================================
// 健康检查
// ============================================================

app.get('/health', async () => ({
  status:      'ok',
  timestamp:   new Date().toISOString(),
  env:         process.env.NODE_ENV,
  connections: io.engine.clientsCount,
}))

export { io }
export default app

// ============================================================
// 启动服务（仅在直接运行本文件时执行，测试导入时跳过）
// ============================================================

const isMainEntry = typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainEntry) {
  // 优雅退出
  const gracefulShutdown = async (signal: string) => {
    app.log.info(`[PushServer] 收到 ${signal}，正在关闭...`)
    io.close()
    await app.close()
    app.log.info('[PushServer] 已优雅退出')
    process.exit(0)
  }

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
  process.on('SIGINT',  () => void gracefulShutdown('SIGINT'))

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
    app.log.info(`[PushServer] 推送服务器已启动，端口：${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}
