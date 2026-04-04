import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireUser } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'
import { pushBridgeService } from '../../services/push-bridge.service'

// ============================================================
// Zod 输入验证 Schema
// ============================================================

const SendMessageSchema = z.object({
  companion_id: z.string().uuid(),
  content:      z.string().min(1).max(1000),
  msg_type:     z.enum(['text', 'image']).default('text'),
})

const MessageListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit:  z.coerce.number().int().min(1).max(50).default(20),
})

// ============================================================
// C端消息路由
// ============================================================

export async function cMessageRoutes(app: FastifyInstance) {
  /**
   * GET /api/c/messages/sessions
   * C端消息会话列表
   * 
   * 功能：
   * - 获取当前用户的所有聊天会话列表
   * - 按最后消息时间倒序排列
   * - 包含每个会话的未读消息数
   */
  app.get('/api/c/messages/sessions', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const userId = request.currentUser!.id

    const sessions = await prisma.messageSession.findMany({
      where: { user_id: userId },
      include: {
        companion: {
          select: {
            id:       true,
            nickname: true,
            avatar:   true,
          },
        },
      },
      orderBy: { last_msg_at: 'desc' },
    })

    const formattedSessions = sessions.map(session => ({
      session_id:         session.id,
      companion_id:       session.companion_id,
      companion_nickname: session.companion.nickname || '未知用户',
      companion_avatar:   session.companion.avatar,
      last_message:       session.last_message || '',
      last_message_at:    session.last_msg_at?.toISOString() || session.created_at.toISOString(),
      unread_count:       session.unread_count_user,
    }))

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    { list: formattedSessions },
    })
  })

  /**
   * GET /api/c/messages/:companionId
   * 获取与某个陪玩师的历史消息（游标分页）
   * 
   * 功能：
   * - 支持游标分页（从旧到新加载）
   * - 返回消息时标记为已读
   */
  app.get<{ Params: { companionId: string } }>('/api/c/messages/:companionId', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const { companionId } = request.params
    const userId = request.currentUser!.id

    // 参数验证
    const parseResult = MessageListQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { cursor, limit } = parseResult.data

    // 查找或创建会话
    let session = await prisma.messageSession.findUnique({
      where: {
        user_id_companion_id: {
          user_id:      userId,
          companion_id: companionId,
        },
      },
    })

    if (!session) {
      // 如果没有会话，创建一个新会话（空会话，不返回消息）
      const companion = await prisma.companion.findUnique({
        where: { id: companionId },
        select: { id: true },
      })

      if (!companion) {
        return reply.status(404).send({
          code:     ErrorCode.NOT_FOUND,
          message:  '陪玩师不存在',
          errorKey: 'COMPANION_NOT_FOUND',
        })
      }

      session = await prisma.messageSession.create({
        data: {
          user_id:      userId,
          companion_id: companionId,
        },
      })

      return reply.send({
        code:    ErrorCode.SUCCESS,
        message: 'ok',
        data:    {
          list:        [],
          next_cursor: null,
        },
      })
    }

    // 构建查询条件
    const whereCondition: any = {
      session_id: session.id,
    }

    if (cursor) {
      // 使用游标分页：获取比cursor更新的消息
      const cursorMessage = await prisma.message.findUnique({
        where: { id: cursor },
        select: { created_at: true },
      })
      if (cursorMessage) {
        whereCondition.created_at = { gt: cursorMessage.created_at }
      }
    }

    // 查询消息列表（按时间升序，从旧到新）
    const messages = await prisma.message.findMany({
      where: whereCondition,
      orderBy: { created_at: 'asc' },
      take: limit,
    })

    // 格式化消息
    const formattedMessages = messages.map(msg => ({
      id:           msg.id,
      sender_type:  msg.sender_user_id ? 'user' : 'companion' as const,
      content:      msg.content,
      content_type: msg.msg_type,
      created_at:   msg.created_at.toISOString(),
      is_read:      msg.is_read,
    }))

    // 计算下一页游标
    const nextCursor = messages.length === limit 
      ? messages[messages.length - 1].id 
      : null

    // 标记消息为已读（陪玩师发送的消息）
    await prisma.$transaction([
      // 更新消息的已读状态
      prisma.message.updateMany({
        where: {
          session_id: session.id,
          sender_companion_id: { not: null }, // 陪玩师发送的消息
          is_read: false,
        },
        data: {
          is_read: true,
          read_at: new Date(),
        },
      }),
      // 重置用户未读数
      prisma.messageSession.update({
        where: { id: session.id },
        data: { unread_count_user: 0 },
      }),
    ])

    return reply.send({
      code:    ErrorCode.SUCCESS,
      message: 'ok',
      data:    {
        list:        formattedMessages,
        next_cursor: nextCursor,
      },
    })
  })

  /**
   * POST /api/c/messages
   * 发送消息（HTTP 发送，Socket.IO 推送）
   * 
   * 功能：
   * - 发送消息给陪玩师
   * - 如果不存在会话，自动创建会话
   * - 更新会话的最后消息和未读数
   * - 通过Socket.IO推送实时通知给陪玩师
   */
  app.post('/api/c/messages', {
    preHandler: [authenticate, requireUser],
  }, async (request, reply) => {
    const parseResult = SendMessageSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { companion_id, content, msg_type } = parseResult.data
    const userId = request.currentUser!.id

    try {
      // 验证陪玩师是否存在
      const companion = await prisma.companion.findUnique({
        where: { id: companion_id },
        select: { id: true, nickname: true, audit_status: true },
      })

      if (!companion) {
        return reply.status(404).send({
          code:     ErrorCode.NOT_FOUND,
          message:  '陪玩师不存在',
          errorKey: 'COMPANION_NOT_FOUND',
        })
      }

      if (companion.audit_status !== 'approved') {
        return reply.status(403).send({
          code:     ErrorCode.COMPANION_NOT_AUDITED,
          message:  '陪玩师未通过审核，无法发送消息',
          errorKey: 'COMPANION_NOT_AUDITED',
        })
      }

      // 使用事务确保数据一致性
      const result = await prisma.$transaction(async (tx) => {
        // 查找或创建会话
        let session = await tx.messageSession.findUnique({
          where: {
            user_id_companion_id: {
              user_id:      userId,
              companion_id: companion_id,
            },
          },
        })

        if (!session) {
          session = await tx.messageSession.create({
            data: {
              user_id:      userId,
              companion_id: companion_id,
            },
          })
        }

        // 创建消息
        const message = await tx.message.create({
          data: {
            session_id:     session.id,
            msg_type:       msg_type,
            sender_user_id: userId,
            content:        content,
            is_read:        false,
          },
        })

        // 更新会话信息
        await tx.messageSession.update({
          where: { id: session.id },
          data: {
            last_message:       content.substring(0, 100), // 截取前100字符
            last_msg_at:        new Date(),
            unread_count_companion: { increment: 1 }, // 陪玩师未读数+1
          },
        })

        return { message, session }
      })

      // 通过推送服务器推送实时消息给陪玩师
      await pushBridgeService.sendPushEvent({
        type:       'new_message',
        targetType: 'companion',
        targetId:   companion_id,
        payload: {
          session_id:  result.session.id,
          message_id:  result.message.id,
          sender_type: 'user',
          sender_id:   userId,
          content,
          msg_type,
          created_at:  result.message.created_at.toISOString(),
        },
      }, 'order_service')

      return reply.status(201).send({
        code:    ErrorCode.SUCCESS,
        message: '发送成功',
        data:    {
          id:         result.message.id,
          content:    result.message.content,
          created_at: result.message.created_at.toISOString(),
        },
      })
    } catch (err) {
      app.log.error(err, '发送消息失败')
      return reply.status(500).send({
        code:     ErrorCode.MESSAGE_SEND_FAILED,
        message:  '发送消息失败，请稍后重试',
        errorKey: 'MESSAGE_SEND_FAILED',
      })
    }
  })
}
