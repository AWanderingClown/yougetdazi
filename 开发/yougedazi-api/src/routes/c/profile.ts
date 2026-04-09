import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireUser } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'
import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { pipeline } from 'stream/promises'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

const AvatarUrlSchema = z.object({
  avatar_url: z.string().url({ message: '无效的 URL 格式' }),
})

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
      const parseResult = AvatarUrlSchema.safeParse(request.body)
      if (!parseResult.success) {
        return reply.status(400).send({
          code:     ErrorCode.VALIDATION_ERROR,
          message:  '参数校验失败',
          details:  parseResult.error.flatten(),
        })
      }

      const { avatar_url } = parseResult.data

      const user = await prisma.user.update({
        where: { id: userId },
        data: { avatar: avatar_url },
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

      const mimeTypeWithoutParams = file.mimetype.split(';')[0].trim()
      if (!ALLOWED_AVATAR_TYPES.includes(mimeTypeWithoutParams)) {
        return reply.status(400).send({
          code:    ErrorCode.VALIDATION_ERROR,
          message: '不支持的图片格式，仅支持 jpg、png、gif、webp',
        })
      }

      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png':  'png',
        'image/gif':  'gif',
        'image/webp': 'webp',
      }
      const ext = extMap[mimeTypeWithoutParams] || 'jpg'

      const timestamp = Date.now()
      const filename = `${userId}_${timestamp}.${ext}`
      const uploadPath = join(process.cwd(), 'uploads', 'avatars', filename)
      let totalSize = 0

      try {
        await new Promise<void>((resolve, reject) => {
          const writeStream = createWriteStream(uploadPath)
          const onData = (chunk: Buffer) => {
            totalSize += chunk.length
            if (totalSize > MAX_AVATAR_SIZE) {
              writeStream.destroy()
              file.file.removeListener('data', onData)
              reject(new Error('FILE_TOO_LARGE'))
            }
          }
          file.file.on('data', onData)
          pipeline(file.file, writeStream)
            .then(() => resolve())
            .catch((err) => reject(err))
        })
      } catch (err: unknown) {
        const error = err as { message?: string }
        if (error.message === 'FILE_TOO_LARGE') {
          return reply.status(400).send({
            code:    ErrorCode.VALIDATION_ERROR,
            message: '图片大小不能超过 2MB',
          })
        }
        throw err
      }

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
