import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { authenticateAdmin } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'

// ============================================================
// 临时内存存储（TODO: 创建 SystemMessage 表替换）
// ============================================================
// 注意：这是临时实现。生产环境应创建以下 Prisma model：
// model SystemMessage {
//   id String @id @default(uuid())
//   title String
//   content String
//   message_type String  // 'system', 'alert', 'notice'
//   priority Int @default(0)  // 0=normal, 1=high, 2=urgent
//   status String @default('published')  // 'draft', 'published', 'archived'
//   published_at DateTime?
//   created_by String
//   created_at DateTime @default(now())
//   updated_at DateTime @updatedAt
// }

const messagesStore = new Map<
  string,
  {
    id: string
    title: string
    content: string
    type: string
    priority: number
    status: string
    published_at: Date
    created_at: Date
  }
>()

// ============================================================
// Admin 系统消息路由
// ============================================================

export async function adminMessagesRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/messages
   * 系统消息列表（分页）
   * 权限：所有角色可查
   */
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
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
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

  /**
   * GET /api/admin/messages/stats
   * 消息统计信息
   * 权限：所有角色可查
   */
  app.get('/api/admin/messages/stats', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const messages = Array.from(messagesStore.values())

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        total: messages.length,
        published: messages.filter(m => m.status === 'published').length,
        draft: messages.filter(m => m.status === 'draft').length,
        archived: messages.filter(m => m.status === 'archived').length,
      },
    })
  })

  /**
   * POST /api/admin/messages
   * 创建系统消息
   * 权限：system.config 及以上
   */
  app.post<{ Body: { title: string; content: string; type: string; priority: number } }>(
    '/api/admin/messages',
    { preHandler: [authenticateAdmin] },
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

  /**
   * DELETE /api/admin/messages/:message_id
   * 删除消息
   * 权限：system.config 及以上
   */
  app.delete<{ Params: { message_id: string } }>(
    '/api/admin/messages/:message_id',
    { preHandler: [authenticateAdmin] },
    async (request, reply) => {
      const { message_id } = request.params

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
