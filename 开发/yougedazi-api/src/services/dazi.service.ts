/**
 * 陪玩师服务 - 包含敏感字段加密处理
 * 
 * 对 real_name 和 id_card_no 进行 AES-256-GCM 加密存储
 * 读取时根据需要进行解密
 */

import { prisma } from '../lib/prisma'
import { encryptField, decryptField, isEncrypted } from '../utils/crypto'

// ============================================================
// 错误类定义
// ============================================================

export class CompanionError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'CompanionError'
  }
}

// ============================================================
// 敏感字段处理工具
// ============================================================

/**
 * 加密敏感字段（写入前调用）
 * @param data 包含敏感字段的对象
 * @returns 加密后的数据
 */
const SENSITIVE_FIELDS = ['real_name', 'id_card_no'] as const

function encryptSensitiveFields<T extends Record<string, unknown>>(data: T): T {
  const result = { ...data }
  for (const field of SENSITIVE_FIELDS) {
    if (field in result && result[field]) {
      const val = String(result[field])
      if (!isEncrypted(val)) result[field] = encryptField(val)
    }
  }
  return result
}

function decryptSensitiveFields<T extends Record<string, unknown>>(data: T | null): T | null {
  if (!data) return null
  const result = { ...data }
  for (const field of SENSITIVE_FIELDS) {
    if (field in result && result[field]) {
      const val = String(result[field])
      if (isEncrypted(val)) {
        try {
          result[field] = decryptField(val)
        } catch (e) {
          console.error(`[CompanionService] 解密 ${field} 失败:`, e)
        }
      }
    }
  }
  return result
}

// ============================================================
// CompanionService 类
// ============================================================

export class CompanionService {
  /**
   * 创建陪玩师（自动加密敏感字段）
   */
  async createCompanion(data: {
    openid: string
    nickname?: string
    avatar?: string
    phone?: string
    gender?: number
    real_name?: string
    id_card_no?: string
    id_card_front?: string
    id_card_back?: string
  }) {
    // 加密敏感字段
    const encryptedData = encryptSensitiveFields(data)

    const companion = await prisma.companion.create({
      data: encryptedData as typeof data,
    })

    return companion
  }

  /**
   * 更新陪玩师信息（自动加密敏感字段）
   */
  async updateCompanion(
    id: string,
    data: {
      nickname?: string
      avatar?: string
      phone?: string
      gender?: number
      real_name?: string
      id_card_no?: string
      id_card_front?: string
      id_card_back?: string
      audit_status?: 'pending' | 'approved' | 'rejected'
      is_online?: boolean
      reject_reason?: string
      verified_by?: string
      verified_at?: Date
    }
  ) {
    // 加密敏感字段
    const encryptedData = encryptSensitiveFields(data)

    const companion = await prisma.companion.update({
      where: { id },
      data: encryptedData,
    })

    return companion
  }

  /**
   * 获取陪玩师详情（返回加密字段）
   * 注意：返回的数据中敏感字段是加密的，需要解密请调用 getCompanionWithDecryptedFields
   */
  async getCompanionById(id: string) {
    const companion = await prisma.companion.findUnique({
      where: { id },
      include: {
        services: {
          where: { is_active: true },
        },
      },
    })

    return companion
  }

  /**
   * 获取陪玩师详情（解密敏感字段）
   * 仅管理员或本人可调用此方法
   */
  async getCompanionWithDecryptedFields(id: string) {
    const companion = await prisma.companion.findUnique({
      where: { id },
      include: {
        services: {
          where: { is_active: true },
        },
      },
    })

    return decryptSensitiveFields(companion)
  }

  /**
   * 获取陪玩师列表（不解密敏感字段）
   */
  async getCompanionList(params: {
    auditStatus?: 'pending' | 'approved' | 'rejected'
    isOnline?: boolean
    page?: number
    pageSize?: number
  }) {
    const { auditStatus, isOnline, page = 1, pageSize = 20 } = params

    const where: Record<string, unknown> = {}
    if (auditStatus) where.audit_status = auditStatus
    if (isOnline !== undefined) where.is_online = isOnline

    const [companions, total] = await Promise.all([
      prisma.companion.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          openid: true,
          nickname: true,
          avatar: true,
          phone: true,
          gender: true,
          audit_status: true,
          is_online: true,
          is_working: true,
          deposit_level: true,
          deposited_amount: true,
          reject_reason: true,
          verified_by: true,
          verified_at: true,
          created_at: true,
          updated_at: true,
          // 注意：不包含 real_name 和 id_card_no（敏感字段）
        },
      }),
      prisma.companion.count({ where }),
    ])

    return { companions, total, page, pageSize }
  }

  /**
   * 提交实名认证（更新身份证信息，自动加密）
   */
  async submitVerification(
    id: string,
    data: {
      real_name: string
      id_card_no: string
      id_card_front: string
      id_card_back: string
    }
  ) {
    // 加密敏感字段
    const encryptedData = encryptSensitiveFields({
      ...data,
      audit_status: 'pending',
    })

    const companion = await prisma.companion.update({
      where: { id },
      data: encryptedData,
    })

    return companion
  }

  /**
   * 审核陪玩师
   */
  async auditCompanion(
    companionId: string,
    adminId: string,
    action: 'approved' | 'rejected',
    reason?: string
  ) {
    const companion = await prisma.companion.update({
      where: { id: companionId },
      data: {
        audit_status: action,
        verified_by: adminId,
        verified_at: new Date(),
        reject_reason: action === 'rejected' ? reason : null,
      },
    })

    // 创建审核记录
    await prisma.companionAuditRecord.create({
      data: {
        companion_id: companionId,
        admin_id: adminId,
        action,
        reason,
      },
    })

    return companion
  }

  /**
   * 根据 OpenID 查找陪玩师
   */
  async getCompanionByOpenid(openid: string) {
    return prisma.companion.findUnique({
      where: { openid },
    })
  }
}

// ============================================================
// 导出单例
// ============================================================

export const companionService = new CompanionService()
