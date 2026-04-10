import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { authenticateAdmin, requireAdminRole } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

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

    const where: Prisma.SystemMessageWhereInput = status ? { status } : {}

    const [total, messages] = await Promise.all([
      prisma.systemMessage.count({ where }),
      prisma.systemMessage.findMany({
        where,
        skip,
        take: page_size,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          content: true,
          message_type: true,
          priority: true,
          status: true,
          published_at: true,
          created_at: true,
        },
      }),
    ])

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        total,
        page,
        page_size,
        list: messages.map(m => ({
          id: m.id,
          title: m.title,
          content: m.content,
          type: m.message_type,
          priority: m.priority,
          status: m.status,
          published_at: m.published_at,
          created_at: m.created_at,
        })),
      },
    })
  })

  app.get('/api/admin/messages/stats', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const [total, published, draft, archived] = await Promise.all([
      prisma.systemMessage.count(),
      prisma.systemMessage.count({ where: { status: 'published' } }),
      prisma.systemMessage.count({ where: { status: 'draft' } }),
      prisma.systemMessage.count({ where: { status: 'archived' } }),
    ])

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        total,
        published,
        draft,
        archived,
      },
    })
  })

  app.post<{ Body: { title: string; content: string; type: string; priority: number } }>(
    '/api/admin/messages',
    { preHandler: [authenticateAdmin, requireAdminRole('super_admin')] },
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

      try {
        const message = await prisma.systemMessage.create({
          data: {
            title,
            content,
            message_type: type,
            priority,
            status: 'published',
            published_at: new Date(),
            created_by: request.currentAdmin!.id,
          },
          select: {
            id: true,
            title: true,
            content: true,
            message_type: true,
            priority: true,
            status: true,
            published_at: true,
            created_at: true,
          },
        })

        return reply.status(201).send({
          code: ErrorCode.SUCCESS,
          message: '消息已创建',
          data: {
            id: message.id,
            title: message.title,
            content: message.content,
            type: message.message_type,
            priority: message.priority,
            status: message.status,
            published_at: message.published_at,
            created_at: message.created_at,
          },
        })
      } catch (err: unknown) {
        const error = err as { code?: string }
        throw error
      }
    }
  )

  app.delete<{ Params: { message_id: string } }>(
    '/api/admin/messages/:message_id',
    { preHandler: [authenticateAdmin, requireAdminRole('super_admin')] },
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

      try {
        await prisma.systemMessage.delete({
          where: { id: message_id },
        })

        return reply.status(200).send({
          code: ErrorCode.SUCCESS,
          message: '消息已删除',
        })
      } catch (err: unknown) {
        const error = err as { code?: string }
        if (error.code === 'P2025') {
          return reply.status(404).send({
            code: ErrorCode.NOT_FOUND,
            message: '消息不存在',
          })
        }
        throw err
      }
    }
  )
}
