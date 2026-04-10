import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { authenticateAdmin } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'

/**
 * 临时内存存储 - 仅用于开发/测试
 *
 * ⚠️ 警告：此实现在生产环境中存在重大限制：
 * - 服务重启时所有消息数据丢失
 * - 多实例部署时状态无法共享（各实例内存隔离）
 *
 * TODO: 迁移到 SystemMessage 数据库表
 * 所需 Prisma model：见下方注释
 */
const messagesStore = new Map<
  string,
  {
    id: string
    title: string
    content: string
    type: string
    priority: number
    status: 'draft' | 'published' | 'archived'
    published_at: Date
    created_at: Date
  }
>()

// 生产环境应创建的 Prisma model
/*
model SystemMessage {
  id String @id @default(uuid())
  title String
  content String
  message_type String  // 'system', 'alert', 'notice'
  priority Int @default(0)  // 0=normal, 1=high, 2=urgent
  status String @default('published')  // 'draft', 'published', 'archived'
  published_at DateTime?
  created_by String
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
}
*/

export async function adminMessagesRoutes(app: FastifyInstance) {
  app.get('/api/admin/messages', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = z.object({
      status: z.enum(['draft', 'published', 'archived']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(20),
    }).safeParse(request.query)

    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }

    const { status, page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    let messages = Array.from(messagesStore.values())
    if (status) {
      messages = messages.filter(m => m.status === status)
    }

    const total = messages.length
    const list = messages
      .sort((a, b) => {
        const timeDiff = b.created_at.getTime() - a.created_at.getTime()
        return timeDiff !== 0 ? timeDiff : (b.id > a.id ? 1 : -1)
      })
      .slice(skip, skip + page_size)

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        total,
        page,
        page_size,
        list,
      },
    })
  })

  app.get('/api/admin/messages/stats', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const stats = { total: 0, published: 0, draft: 0, archived: 0 }
    for (const msg of messagesStore.values()) {
      stats.total++
      if (msg.status === 'published') stats.published++
      else if (msg.status === 'draft') stats.draft++
      else if (msg.status === 'archived') stats.archived++
    }

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: stats,
    })
  })

  app.post<{ Body: { title: string; content: string; type: string; priority: number } }>(
    '/api/admin/messages',
    { preHandler: [authenticateAdmin] },
    // FIXME: 添加权限检查（安全缺陷）- 当前任何 admin 角色均可创建消息
    // 应添加：requireAdminRole('super_admin') 或检查 permission 'system.config'
    async (request, reply) => {
      const parseResult = z.object({
        title: z.string().min(1).max(100),
        content: z.string().min(1).max(5000),
        type: z.enum(['system', 'alert', 'notice']).default('system'),
        priority: z.number().int().min(0).max(2).default(0),
      }).safeParse(request.body)

      if (!parseResult.success) {
        return reply.status(400).send({
          code: ErrorCode.VALIDATION_ERROR,
          message: '参数校验失败',
        })
      }

      const { title, content, type, priority } = parseResult.data

      const message = {
        id: randomUUID(),
        title,
        content,
        type,
        priority,
        status: 'published' as const,
        published_at: new Date(),
        created_at: new Date(),
      }

      messagesStore.set(message.id, message)

      return reply.status(201).send({
        code: ErrorCode.SUCCESS,
        message: '消息已创建',
        data: message,
      })
    }
  )

  app.delete<{ Params: { message_id: string } }>(
    '/api/admin/messages/:message_id',
    { preHandler: [authenticateAdmin] },
    // FIXME: 添加权限检查（安全缺陷）- 当前任何 admin 角色均可删除消息
    // 应添加：requireAdminRole('super_admin') 或检查 permission 'system.config'
    async (request, reply) => {
      const parseResult = z.object({
        message_id: z.string().uuid(),
      }).safeParse(request.params)

      if (!parseResult.success) {
        return reply.status(400).send({
          code: ErrorCode.VALIDATION_ERROR,
          message: '参数校验失败',
        })
      }

      const { message_id } = parseResult.data

      if (!messagesStore.has(message_id)) {
        return reply.status(404).send({
          code: ErrorCode.NOT_FOUND,
          message: '消息不存在',
        })
      }

      messagesStore.delete(message_id)

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: '消息已删除',
      })
    }
  )
}
