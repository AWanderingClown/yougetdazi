import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { redis } from '../lib/redis.js'

/**
 * 业务规则配置
 * C端动态获取，无需硬编码
 */
export interface BusinessRules {
  order_limits: {
    max_service_duration_hours: number
    min_hourly_rate: number
  }
  appointment: {
    range_days: number
  }
  geography: {
    distance_display_threshold: number
  }
  pricing: {
    platform_commission: number
  }
}

/**
 * Zod schema - 完整的运行时验证
 * 验证所有字段存在、类型正确、数值在合法范围内
 */
export const BusinessRulesSchema = z.object({
  order_limits: z.object({
    max_service_duration_hours: z.number().int().positive('Max duration must be positive'),
    min_hourly_rate: z.number().positive('Min rate must be positive')
  }),
  appointment: z.object({
    range_days: z.number().int().positive('Range days must be positive')
  }),
  geography: z.object({
    distance_display_threshold: z.number().positive('Distance threshold must be positive')
  }),
  pricing: z.object({
    platform_commission: z.number().min(0, 'Commission cannot be negative').max(1, 'Commission cannot exceed 100%')
  })
})

// 默认规则（当数据库无数据时使用）
const DEFAULT_RULES: BusinessRules = {
  order_limits: {
    max_service_duration_hours: 24,
    min_hourly_rate: 20
  },
  appointment: {
    range_days: 7
  },
  geography: {
    distance_display_threshold: 1000
  },
  pricing: {
    platform_commission: 0.2
  }
}

// Redis缓存配置
const CACHE_KEY = 'config:business-rules'
const CACHE_TTL = 60 * 60  // 1小时（秒）

/**
 * 类型守卫：检查value是否为有效的BusinessRules
 */
function isValidBusinessRules(value: unknown): value is BusinessRules {
  try {
    BusinessRulesSchema.parse(value)
    return true
  } catch {
    return false
  }
}

export class ConfigService {
  /**
   * 获取C端业务规则（带缓存）
   *
   * 流程：
   * 1. 先查Redis缓存（1小时TTL）
   * 2. 缓存miss则查数据库
   * 3. 完整验证数据库返回值
   * 4. 写回缓存
   * 5. 缓存和数据库都miss时返回默认值
   */
  async getBusinessRules(): Promise<{
    rules: BusinessRules
    version: string
    updatedAt: string
  }> {
    try {
      // 第1步：尝试从Redis缓存读取
      const cached = await redis.get(CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (isValidBusinessRules(parsed.rules)) {
          return parsed
        }
      }
    } catch (error) {
      // 缓存读取失败，继续查数据库
      console.warn('[ConfigService] Redis缓存读取失败，使用数据库', error)
    }

    // 第2步：从数据库读取
    try {
      const config = await prisma.systemConfig.findUnique({
        where: { key: 'c-rules' }
      })

      if (config?.value) {
        const value = config.value
        // 第3步：完整验证（类型安全）
        if (isValidBusinessRules(value)) {
          const result = {
            rules: value,
            version: String(config.id).slice(0, 8),  // 使用ID前8位作为版本标识
            updatedAt: config.updated_at.toISOString()
          }

          // 第4步：写回缓存
          try {
            await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(result))
          } catch (cacheError) {
            console.warn('[ConfigService] Redis缓存写入失败', cacheError)
          }

          return result
        }
      }
    } catch (error) {
      console.warn('[ConfigService] 获取 c-rules 配置失败，使用默认值', error)
    }

    // 第5步：返回默认值
    return {
      rules: DEFAULT_RULES,
      version: '0.0.0',
      updatedAt: new Date().toISOString()
    }
  }

  /**
   * 更新C端业务规则（带并发控制和验证）
   *
   * 安全措施：
   * 1. 完整验证输入数据（类型、范围）
   * 2. 使用乐观锁防止并发冲突
   * 3. 更新后清理缓存
   */
  async updateBusinessRules(rules: BusinessRules, updatedBy?: string, expectedVersion?: string) {
    // 第1步：验证输入数据（所有字段存在、类型正确、数值范围合法）
    const validation = BusinessRulesSchema.safeParse(rules)
    if (!validation.success) {
      throw new Error(`业务规则验证失败: ${validation.error.message}`)
    }

    try {
      // 第2步：使用乐观锁更新
      // 如果提供了expectedVersion，则只在版本匹配时才更新（防止并发覆盖）
      const updateWhere = expectedVersion
        ? { key: 'c-rules', id: expectedVersion }
        : { key: 'c-rules' }

      const result = await prisma.systemConfig.upsert({
        where: updateWhere,
        update: {
          value: validation.data as Record<string, unknown>,
          updated_by: updatedBy
        },
        create: {
          key: 'c-rules',
          value: validation.data as Record<string, unknown>,
          description: 'C端业务规则配置',
          updated_by: updatedBy
        }
      })

      // 第3步：更新后清理缓存，强制下次重新加载
      try {
        await redis.del(CACHE_KEY)
      } catch (cacheError) {
        console.warn('[ConfigService] Redis缓存清理失败', cacheError)
      }

      return result
    } catch (error) {
      if (expectedVersion && error instanceof Error && error.message.includes('Unique constraint')) {
        throw new Error('并发冲突：配置已被其他管理员修改，请重新获取后再试')
      }
      throw error
    }
  }
}

export const configService = new ConfigService()
