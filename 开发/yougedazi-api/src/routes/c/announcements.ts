import { FastifyInstance } from 'fastify'
import { authenticate, requireUser } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

// ============================================================
// C端公告路由（公开接口）
// ============================================================

export async function cAnnouncementRoutes(app: FastifyInstance) {
  /**
   * GET /api/c/announcements
   * 获取当前有效的公告列表
   * 
   * 功能：
   * - 获取当前有效的公告列表
   * - 根据用户角色返回对应公告（all 或 user）
   * - 只返回已开始且未过期的公告
   * - 按排序权重和创建时间倒序排列
   */
  app.get('/api/c/announcements', {
    preHandler: [authenticate, requireUser],
  }, async (_request, reply) => {
    const now = new Date()

    const announcements = await prisma.announcement.findMany({
      where: {
        target_audience: { in: ['all', 'user'] },
        is_active:       true,
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
      select: {
        id:         true,
        title:      true,
        content:    true,
        created_at: true,
      },
    })

    const formattedAnnouncements = announcements.map(a => ({
      id:         a.id,
      title:      a.title,
      content:    a.content,
      created_at: a.created_at.toISOString(),
    }))

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    { list: formattedAnnouncements },
    })
  })
}
