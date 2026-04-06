import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireCompanion } from '../../middleware/auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'
import { encryptField } from '../../utils/crypto'

// ============================================================
// Zod 输入验证 Schema
// ============================================================

const RegisterSchema = z.object({
  nickname:      z.string().min(1).max(20),
  avatar:        z.string().optional(),
  gender:        z.number().int().min(0).max(2),   // 0=未知 1=男 2=女
  age:           z.number().int().min(18).max(60),
  city:          z.string().min(1).max(20),
  real_name:     z.string().min(2).max(20),
  id_card_no:    z.string().regex(/^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/, '身份证号格式错误'),
  id_card_front: z.string().optional(),            // COS 临时路径或上传后的 key
  id_card_back:  z.string().optional(),
  skills:        z.array(z.string().min(1).max(20)).min(1).max(10),
  bio:           z.string().max(200).optional(),
})

// ============================================================
// B端陪玩师资料路由
// ============================================================

export async function bProfileRoutes(app: FastifyInstance) {
  /**
   * POST /api/b/profile/register
   * 陪玩师注册提交审核
   *
   * 认证：需要有效的 companion token（wx-login 后即可调用）
   * 幂等：重复提交会覆盖已有资料并重置为 pending 状态
   */
  app.post('/api/b/profile/register', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const parseResult = RegisterSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code:    ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const companionId = request.currentUser!.id
    const {
      nickname, avatar, gender, age, city,
      real_name, id_card_no, id_card_front, id_card_back,
      skills, bio,
    } = parseResult.data

    try {
      // 实名信息加密存储
      const encryptedRealName = encryptField(real_name)
      const encryptedIdCard   = encryptField(id_card_no)

      // 更新陪玩师基本信息，并重置为待审核状态
      const companion = await prisma.companion.update({
        where: { id: companionId },
        data: {
          nickname,
          avatar:        avatar ?? null,
          gender,
          real_name:     encryptedRealName,
          id_card_no:    encryptedIdCard,
          id_card_front: id_card_front ?? null,
          id_card_back:  id_card_back ?? null,
          audit_status:  'pending',
        },
      })

      // 更新服务技能（清除旧的，写入新的）
      await prisma.$transaction([
        prisma.companionService.deleteMany({ where: { companion_id: companionId } }),
        prisma.companionService.createMany({
          data: skills.map((name) => ({
            companion_id: companionId,
            service_name: name,
            hourly_price: 0,    // 价格由后续设置，这里先占位
            description:  bio ?? null,
          })),
        }),
      ])

      return reply.status(200).send({
        code:    ErrorCode.SUCCESS,
        message: '提交审核成功，请等待审核结果',
        data: {
          id:           companion.id,
          audit_status: companion.audit_status,
        },
      })
    } catch (err) {
      app.log.error(err, '陪玩师注册提交失败')
      return reply.status(500).send({
        code:    ErrorCode.INTERNAL_ERROR,
        message: '提交失败，请稍后重试',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * GET /api/b/profile/status
   * 获取陪玩师当前审核状态（登录后轮询使用）
   */
  app.get('/api/b/profile/status', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const companionId = request.currentUser!.id

    try {
      const companion = await prisma.companion.findUnique({
        where:  { id: companionId },
        select: { audit_status: true, reject_reason: true, nickname: true },
      })

      if (!companion) {
        return reply.status(404).send({
          code:    ErrorCode.NOT_FOUND,
          message: '陪玩师不存在',
          errorKey: 'NOT_FOUND',
        })
      }

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        data: {
          audit_status:  companion.audit_status,
          reject_reason: companion.reject_reason ?? null,
          has_profile:   !!companion.nickname,
        },
      })
    } catch (err) {
      app.log.error(err, '获取审核状态失败')
      return reply.status(500).send({
        code:    ErrorCode.INTERNAL_ERROR,
        message: '获取状态失败',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * 前端轮询检查接单资格（审核状态、保证金、进行中订单）
   */
  app.get('/api/b/profile', {
    preHandler: [authenticate, requireCompanion],
  }, async (request, reply) => {
    const companionId = request.currentUser!.id

    try {
      // 查询陪玩师完整信息
      const companion = await prisma.companion.findUnique({
        where: { id: companionId },
        select: {
          id: true,
          nickname: true,
          avatar: true,
          audit_status: true,
          is_online: true,
          is_working: true,
          deposit_level: true,
          deposit_amount: true,
          rating: true,
          total_orders: true,
        },
      })

      if (!companion) {
        return reply.status(404).send({
          code:    ErrorCode.NOT_FOUND,
          message: '陪玩师不存在',
          errorKey: 'COMPANION_NOT_FOUND',
        })
      }

      // 检查是否可以通过接单
      let canAcceptOrder = true
      let cannotAcceptReason = ''

      if (companion.audit_status !== 'approved') {
        canAcceptOrder = false
        cannotAcceptReason = '账号尚未通过审核'
      } else if (companion.deposit_level === 0) {
        canAcceptOrder = false
        cannotAcceptReason = '保证金不足，缴纳后方可接单'
      } else if (companion.is_working) {
        canAcceptOrder = false
        cannotAcceptReason = '当前有进行中的订单'
      }

      return reply.status(200).send({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: {
          ...companion,
          can_accept_order: canAcceptOrder,
          cannot_accept_reason: cannotAcceptReason,
        },
      })
    } catch (err) {
      app.log.error(err, '获取陪玩师资料失败')
      return reply.status(500).send({
        code:    ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })
}
