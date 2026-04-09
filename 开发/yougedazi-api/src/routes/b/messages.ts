import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireCompanion } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'
import { pushBridgeService } from '../../services/push-bridge.service'

const SendMessageSchema = z.object({
  user_id:  z.string().uuid(),
  content:  z.string().min(1).max(2000),
  msg_type: z.enum(['text', 'image']).default('text'),
})

export async function bMessageRoutes(app: FastifyInstance) {
  /**
   * POST /api/b/messages
   * B端发送消息给C端
   *
   * 业务逻辑：
   * 1. 查找/创建与C端的消息会话
   * 2. 创建消息记录
   * 3. 通过推送服务通知C端
   */
  app.post('/api/b/messages', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const companionId = request.currentUser!.id

    const parseResult = SendMessageSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { user_id: userId, content, msg_type: msgType } = parseResult.data

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      })

      if (!user) {
        return reply.status(404).send({
          code:    ErrorCode.NOT_FOUND,
          message: '用户不存在',
        })
      }

      const session = await prisma.messageSession.upsert({
        where: {
          user_id_companion_id: {
            user_id: userId,
            companion_id: companionId,
          },
        },
        create: {
          user_id: userId,
          companion_id: companionId,
          is_heartbeat: true,
        },
        update: {},
        select: { id: true },
      })

      const message = await prisma.message.create({
        data: {
          session_id: session.id,
          sender_companion_id: companionId,
          content,
          msg_type: msgType,
          is_heartbeat: true,
        },
      })

      await prisma.messageSession.update({
        where: { id: session.id },
        data: {
          last_message: content.slice(0, 100),
          last_msg_at: new Date(),
          unread_count_user: { increment: 1 },
        },
      })

      pushBridgeService.sendToUser(userId, 'new_message', {
        id: message.id,
        session_id: session.id,
        msg_type: msgType,
        content,
        sender_id: companionId,
        sender_role: 'companion',
        created_at: message.created_at.toISOString(),
        is_heartbeat: true,
      })

      return reply.status(201).send({
        code:    ErrorCode.SUCCESS,
        message: '发送成功',
        data: { message_id: message.id },
      })
    } catch (err) {
      app.log.error(err, 'B端发送消息失败')
      return reply.status(500).send({
        code:    ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
      })
    }
  })
}
