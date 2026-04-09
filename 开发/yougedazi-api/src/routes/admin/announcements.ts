import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin, requireAdminRole } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

const CreateCompanionAnnouncementSchema = z.object({
  title:         z.string().min(2).max(100),
  content:       z.string().min(1).max(5000),
  is_active:    z.boolean().default(true),
  published_at: z.string().datetime().optional(),
  expires_at:   z.string().datetime().optional(),
  sort_order:   z.number().int().min(0).max(9999).default(0),
})

const CreateUserAnnouncementSchema = z.object({
  title:         z.string().min(2).max(100),
  content:       z.string().min(1).max(5000),
  is_active:    z.boolean().default(true),
  published_at: z.string().datetime().optional(),
  expires_at:   z.string().datetime().optional(),
  sort_order:   z.number().int().min(0).max(9999).default(0),
})

export async function adminAnnouncementRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/announcements/companion
   * B端公告列表
   */
  app.get('/api/admin/announcements/companion', {
    preHandler: [authenticateAdmin],
  }, async (_request, reply) => {
    const announcements = await prisma.announcement.findMany({
      orderBy: { created_at: 'desc' },
    })
    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    announcements,
    })
  })

  /**
   * POST /api/admin/announcements/companion
   * 创建B端公告
   */
  app.post('/api/admin/announcements/companion', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = CreateCompanionAnnouncementSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:     ErrorCode.VALIDATION_ERROR,
        message:  '参数校验失败',
        details:  parseResult.error.flatten(),
      })
    }

    const data = parseResult.data
    const announcement = await prisma.announcement.create({
      data: {
        title:         data.title,
        content:       data.content,
        target_audience: 'companion',
        is_active:     data.is_active,
        published_at:  data.published_at ? new Date(data.published_at) : new Date(),
        expires_at:    data.expires_at ? new Date(data.expires_at) : null,
        sort_order:    data.sort_order,
      },
    })

    return reply.status(201).send({
      code:    ErrorCode.SUCCESS,
      message: 'B端公告创建成功',
      data:    announcement,
    })
  })

  /**
   * DELETE /api/admin/announcements/companion/:id
   * 删除B端公告
   */
  app.delete<{ Params: { id: string } }>('/api/admin/announcements/companion/:id', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const { id } = request.params
    await prisma.announcement.delete({ where: { id } })
    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'B端公告已删除',
    })
  })

  /**
   * GET /api/admin/announcements/user
   * C端公告列表
   */
  app.get('/api/admin/announcements/user', {
    preHandler: [authenticateAdmin],
  }, async (_request, reply) => {
    const announcements = await prisma.userAnnouncement.findMany({
      orderBy: { created_at: 'desc' },
    })
    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    announcements,
    })
  })

  /**
   * POST /api/admin/announcements/user
   * 创建C端公告
   */
  app.post('/api/admin/announcements/user', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = CreateUserAnnouncementSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:     ErrorCode.VALIDATION_ERROR,
        message:  '参数校验失败',
        details:  parseResult.error.flatten(),
      })
    }

    const data = parseResult.data
    const announcement = await prisma.userAnnouncement.create({
      data: {
        title:        data.title,
        content:      data.content,
        is_active:    data.is_active,
        published_at: data.published_at ? new Date(data.published_at) : new Date(),
        expires_at:   data.expires_at ? new Date(data.expires_at) : null,
        sort_order:   data.sort_order,
      },
    })

    return reply.status(201).send({
      code:    ErrorCode.SUCCESS,
      message: 'C端公告创建成功',
      data:    announcement,
    })
  })

  /**
   * DELETE /api/admin/announcements/user/:id
   * 删除C端公告
   */
  app.delete<{ Params: { id: string } }>('/api/admin/announcements/user/:id', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const { id } = request.params
    await prisma.userAnnouncement.delete({ where: { id } })
    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'C端公告已删除',
    })
  })
}
