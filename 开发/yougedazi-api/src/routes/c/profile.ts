import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireUser } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'
import { createReadStream, createWriteStream } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { pipeline } from 'stream/promises'

const UpdateProfileSchema = z.object({
  nickname: z.string().min(1).max(32).optional(),
  avatar:   z.string().url().optional(),
  gender:   z.number().int().min(0).max(2).optional(),
  phone:    z.string().regex(/^1[3-9]\d{9}$/).optional(),
})

export async function cProfileRoutes(app: FastifyInstance) {
  /**
   * GET /api/c/profile
   * 获取当前用户资料
   */
  app.get('/api/c/profile', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const userId = request.currentUser!.id

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id:         true,
        nickname:   true,
        avatar:     true,
        phone:      true,
        gender:     true,
        created_at: true,
      },
    })

    if (!user) {
      return reply.status(404).send({
        code:    ErrorCode.NOT_FOUND,
        message: '用户不存在',
      })
    }

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    user,
    })
  })

  /**
   * PATCH /api/c/profile
   * 更新当前用户资料
   */
  app.patch('/api/c/profile', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const userId = request.currentUser!.id

    const parseResult = UpdateProfileSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:     ErrorCode.VALIDATION_ERROR,
        message:  '参数校验失败',
        details:  parseResult.error.flatten(),
      })
    }

    const data = parseResult.data
    if (Object.keys(data).length === 0) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '没有要更新的字段',
      })
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id:         true,
        nickname:   true,
        avatar:     true,
        phone:      true,
        gender:     true,
        created_at: true,
      },
    })

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: '资料更新成功',
      data:    user,
    })
  })

  /**
   * POST /api/c/profile/avatar
   * 上传头像（支持URL或文件上传）
   * 
   * 方式1: URL方式 - body: { avatar_url: "https://..." }
   * 方式2: 文件上传 - multipart/form-data with file field "avatar"
   */
  app.post('/api/c/profile/avatar', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const userId = request.currentUser!.id

    const contentType = request.headers['content-type'] || ''

    if (contentType.includes('application/json')) {
      const body = request.body as { avatar_url?: string }
      if (!body.avatar_url) {
        return reply.status(400).send({
          code:    ErrorCode.VALIDATION_ERROR,
          message: '缺少 avatar_url 参数',
        })
      }

      const urlParse = z.string().url().safeParse(body.avatar_url)
      if (!urlParse.success) {
        return reply.status(400).send({
          code:    ErrorCode.VALIDATION_ERROR,
          message: '无效的 URL 格式',
        })
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { avatar: body.avatar_url },
        select: { id: true, avatar: true },
      })

      return reply.send({
        code:    ErrorCode.SUCCESS,
        message: '头像更新成功',
        data:    { avatar: user.avatar },
      })
    }

    if (contentType.includes('multipart/form-data')) {
      const file = await request.file()
      if (!file || file.fieldname !== 'avatar') {
        return reply.status(400).send({
          code:    ErrorCode.VALIDATION_ERROR,
          message: '请上传 avatar 文件',
        })
      }

      const ext = file.mimetype.split('/')[1] || 'jpg'
      const filename = `${userId}_${Date.now()}.${ext}`
      const uploadDir = join(process.cwd(), 'uploads', 'avatars')
      const filepath = join(uploadDir, filename)

      await mkdir(uploadDir, { recursive: true })
      await pipeline(file.file, createWriteStream(filepath))

      const avatarUrl = `/uploads/avatars/${filename}`
      await prisma.user.update({
        where: { id: userId },
        data: { avatar: avatarUrl },
      })

      return reply.send({
        code:    ErrorCode.SUCCESS,
        message: '头像上传成功',
        data:    { avatar: avatarUrl },
      })
    }

    return reply.status(400).send({
      code:    ErrorCode.VALIDATION_ERROR,
      message: '不支持的 Content-Type',
    })
  })
}
