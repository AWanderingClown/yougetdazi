import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

const safeDateString = (dateStr: string | undefined): Date | null => {
  if (!dateStr) return null
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? null : date
}

const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

const AnnouncementListQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
})

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
   * B端公告列表（分页）
   */
  app.get('/api/admin/announcements/companion', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = AnnouncementListQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }

    const { page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        orderBy: { created_at: 'desc' },
        skip,
        take: page_size,
      }),
      prisma.announcement.count(),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        list:      announcements,
        total,
        page,
        page_size,
        has_more:  skip + announcements.length < total,
      },
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
    const publishedAt = safeDateString(data.published_at)
    const expiresAt = safeDateString(data.expires_at)

    if (data.published_at && publishedAt === null) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '发布时间格式无效',
      })
    }
    if (data.expires_at && expiresAt === null) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '过期时间格式无效',
      })
    }

    const announcement = await prisma.announcement.create({
      data: {
        title:          escapeHtml(data.title),
        content:        escapeHtml(data.content),
        target_audience: 'companion',
        is_active:     data.is_active,
        published_at:  publishedAt ?? new Date(),
        expires_at:    expiresAt,
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
   * C端公告列表（分页）
   */
  app.get('/api/admin/announcements/user', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = AnnouncementListQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
      })
    }

    const { page, page_size } = parseResult.data
    const skip = (page - 1) * page_size

    const [announcements, total] = await Promise.all([
      prisma.userAnnouncement.findMany({
        orderBy: { created_at: 'desc' },
        skip,
        take: page_size,
      }),
      prisma.userAnnouncement.count(),
    ])

    return reply.status(200).send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        list:      announcements,
        total,
        page,
        page_size,
        has_more:  skip + announcements.length < total,
      },
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
    const publishedAt = safeDateString(data.published_at)
    const expiresAt = safeDateString(data.expires_at)

    if (data.published_at && publishedAt === null) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '发布时间格式无效',
      })
    }
    if (data.expires_at && expiresAt === null) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '过期时间格式无效',
      })
    }

    const announcement = await prisma.userAnnouncement.create({
      data: {
        title:        escapeHtml(data.title),
        content:      escapeHtml(data.content),
        is_active:    data.is_active,
        published_at: publishedAt ?? new Date(),
        expires_at:   expiresAt,
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
