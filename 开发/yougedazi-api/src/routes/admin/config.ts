/**
 * Admin 系统配置管理
 * 
 * 提供全局系统配置的CRUD接口
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin, requireAdminRole } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { prisma } from '../../lib/prisma'

// ============================================================
// Zod Schema 定义
// ============================================================

const GetConfigSchema = z.object({
  key: z.string().min(1),
})

const SaveConfigSchema = z.object({
  key: z.string().min(1),
  value: z.record(z.string(), z.any()),
  description: z.string().optional(),
})

const BatchSaveConfigSchema = z.object({
  configs: z.record(z.string(), z.any()),
})

// ============================================================
// 配置路由
// ============================================================

export async function configRoutes(app: FastifyInstance) {
  // 所有配置接口都需要Admin认证
  app.addHook('preHandler', authenticateAdmin)

  /**
   * GET /api/admin/configs
   * 获取所有系统配置
   */
  app.get('/api/admin/configs', async (request, reply) => {
    try {
      const configs = await prisma.systemConfig.findMany({
        orderBy: { key: 'asc' },
        select: {
          id: true,
          key: true,
          value: true,
          description: true,
          updated_by: true,
          updated_at: true,
        },
      })

      // 转换为key-value对象格式
      const configMap: Record<string, any> = {}
      configs.forEach((config) => {
        configMap[config.key] = config.value
      })

      return reply.send({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: {
          configs: configMap,
          list: configs,
        },
      })
    } catch (err) {
      app.log.error(err, '获取系统配置失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '获取系统配置失败',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * GET /api/admin/configs/:key
   * 获取单个配置
   */
  app.get<{ Params: { key: string } }>('/api/admin/configs/:key', async (request, reply) => {
    const { key } = request.params

    try {
      const config = await prisma.systemConfig.findUnique({
        where: { key },
        select: {
          id: true,
          key: true,
          value: true,
          description: true,
          updated_by: true,
          updated_at: true,
        },
      })

      if (!config) {
        return reply.status(404).send({
          code: ErrorCode.CONFIG_NOT_FOUND,
          message: '配置不存在',
          errorKey: 'CONFIG_NOT_FOUND',
        })
      }

      return reply.send({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: config,
      })
    } catch (err) {
      app.log.error(err, '获取配置失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '获取配置失败',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * POST /api/admin/configs
   * 保存单个配置
   */
  app.post('/api/admin/configs', async (request, reply) => {
    const parseResult = SaveConfigSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { key, value, description } = parseResult.data
    const adminId = (request as any).currentAdmin?.id || 'system'

    try {
      // 使用upsert更新或创建配置
      const config = await prisma.systemConfig.upsert({
        where: { key },
        update: {
          value,
          description,
          updated_by: adminId,
        },
        create: {
          key,
          value,
          description,
          updated_by: adminId,
        },
      })

      app.log.info(`配置已更新: ${key} by ${adminId}`)

      return reply.send({
        code: ErrorCode.SUCCESS,
        message: '配置保存成功',
        data: config,
      })
    } catch (err) {
      app.log.error(err, '保存配置失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '保存配置失败',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * POST /api/admin/configs/batch
   * 批量保存配置
   */
  app.post('/api/admin/configs/batch', async (request, reply) => {
    const parseResult = BatchSaveConfigSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数校验失败',
        details: parseResult.error.flatten(),
      })
    }

    const { configs } = parseResult.data
    const adminId = (request as any).currentAdmin?.id || 'system'

    try {
      // 使用事务批量保存
      const results = await prisma.$transaction(async (tx) => {
        const saved = []
        for (const [key, value] of Object.entries(configs)) {
          const config = await tx.systemConfig.upsert({
            where: { key },
            update: {
              value: value as any,
              updated_by: adminId,
            },
            create: {
              key,
              value: value as any,
              updated_by: adminId,
            },
          })
          saved.push(config)
        }
        return saved
      })

      app.log.info(`批量配置已更新: ${Object.keys(configs).join(', ')} by ${adminId}`)

      return reply.send({
        code: ErrorCode.SUCCESS,
        message: `成功保存 ${results.length} 个配置`,
        data: {
          saved_count: results.length,
          keys: Object.keys(configs),
        },
      })
    } catch (err) {
      app.log.error(err, '批量保存配置失败')
      return reply.status(500).send({
        code: ErrorCode.INTERNAL_ERROR,
        message: '批量保存配置失败',
        errorKey: 'INTERNAL_ERROR',
      })
    }
  })

  /**
   * DELETE /api/admin/configs/:key
   * 删除配置（仅超级管理员可操作）
   */
  app.delete<{ Params: { key: string } }>(
    '/api/admin/configs/:key',
    { preHandler: [requireAdminRole('super_admin')] },
    async (request, reply) => {
      const { key } = request.params

      try {
        await prisma.systemConfig.delete({
          where: { key },
        })

        app.log.info(`配置已删除: ${key}`)

        return reply.send({
          code: ErrorCode.SUCCESS,
          message: '配置已删除',
        })
      } catch (err: any) {
        if (err.code === 'P2025') {
          return reply.status(404).send({
            code: ErrorCode.CONFIG_NOT_FOUND,
            message: '配置不存在',
            errorKey: 'CONFIG_NOT_FOUND',
          })
        }
        app.log.error(err, '删除配置失败')
        return reply.status(500).send({
          code: ErrorCode.INTERNAL_ERROR,
          message: '删除配置失败',
          errorKey: 'INTERNAL_ERROR',
        })
      }
    }
  )
}
