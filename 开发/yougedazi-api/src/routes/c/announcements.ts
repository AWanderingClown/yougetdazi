import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireUser } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

const AnnouncementListQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(10),
})

export async function cAnnouncementRoutes(app: FastifyInstance) {
  /**
   * GET /api/c/announcements
   * 获取C端用户公告列表
   * 
   * 功能：
   * - 获取当前有效的C端专属公告
   * - 只返回已开始且未过期的公告
   * - 按排序权重和创建时间倒序排列
   */
  app.get('/api/c/announcements', {
    preHandler: [authenticate, requireUser],
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
    const now = new Date()

    const [announcements, total] = await Promise.all([
      prisma.userAnnouncement.findMany({
        where: {
          is_active: true,
          AND: [
            {
              OR: [
                { published_at: null },
                { published_at: { lte: now } },
              ],
            },
            {
              OR: [
                { expires_at: null },
                { expires_at: { gte: now } },
              ],
            },
          ],
        },
        orderBy: [
          { sort_order: 'desc' },
          { created_at: 'desc' },
        ],
        skip,
        take: page_size,
        select: {
          id:          true,
          title:       true,
          content:     true,
          published_at: true,
          created_at:  true,
        },
      }),
      prisma.userAnnouncement.count({
        where: {
          is_active: true,
          AND: [
            {
              OR: [
                { published_at: null },
                { published_at: { lte: now } },
              ],
            },
            {
              OR: [
                { expires_at: null },
                { expires_at: { gte: now } },
              ],
            },
          ],
        },
      }),
    ])

    const list = announcements.map(a => ({
      id:          a.id,
      title:       a.title,
      content:     a.content,
      published_at: a.published_at?.toISOString() || null,
      created_at:  a.created_at.toISOString(),
    }))

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    { list, total, page, page_size, has_more: skip + list.length < total },
    })
  })
}
