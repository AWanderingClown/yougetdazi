import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'

// ============================================================
// 角色与权限映射定义
// ============================================================

const ROLE_PERMISSIONS = {
  super_admin: {
    name: '超级管理员',
    description: '拥有系统所有权限',
    permissions: [
      // 仪表盘
      'dashboard.view',
      // 用户管理
      'users.view',
      'users.detail',
      'users.ban',
      // 搭子管理
      'companions.view',
      'companions.detail',
      'companions.audit',
      'companions.deposit',
      // 订单管理
      'orders.view',
      'orders.detail',
      'orders.dispute',
      // 财务管理
      'finance.view',
      'finance.withdraw',
      'finance.refund',
      // 评价审核
      'reviews.audit',
      // 系统配置
      'system.config',
      // 风险管理
      'risk.manage',
      // 客服管理
      'service.manage',
      // 营销管理
      'marketing.manage',
      // 数据分析
      'data.view',
      // 设置管理
      'settings.edit',
    ],
  },
  operator: {
    name: '运营人员',
    description: '运营和审核权限',
    permissions: [
      'dashboard.view',
      'users.view',
      'users.detail',
      'users.ban',
      'companions.view',
      'companions.detail',
      'companions.audit',
      'orders.view',
      'orders.detail',
      'orders.dispute',
      'reviews.audit',
      'risk.manage',
      'service.manage',
      'data.view',
    ],
  },
  finance: {
    name: '财务人员',
    description: '财务管理权限',
    permissions: [
      'dashboard.view',
      'finance.view',
      'finance.withdraw',
      'finance.refund',
      'companions.deposit',
      'data.view',
    ],
  },
  viewer: {
    name: '查看人员',
    description: '仅限查看权限',
    permissions: [
      'dashboard.view',
      'users.view',
      'companions.view',
      'orders.view',
      'finance.view',
      'data.view',
    ],
  },
}

// ============================================================
// Admin 角色管理路由
// ============================================================

export async function adminRolesRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/roles
   * 列出所有管理员角色
   * 权限：所有角色可查
   */
  app.get('/api/admin/roles', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const roles = Object.entries(ROLE_PERMISSIONS).map(([roleCode, details]) => ({
      code: roleCode,
      ...details,
      permission_count: details.permissions.length,
    }))

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        total: roles.length,
        list: roles,
      },
    })
  })

  /**
   * GET /api/admin/roles/:role_name
   * 获取特定角色的详细信息（包括权限列表）
   * 权限：所有角色可查
   */
  app.get<{ Params: { role_name: string } }>('/api/admin/roles/:role_name', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const { role_name } = request.params

    const roleConfig = ROLE_PERMISSIONS[role_name as keyof typeof ROLE_PERMISSIONS]
    if (!roleConfig) {
      return reply.status(404).send({
        code: ErrorCode.NOT_FOUND,
        message: '角色不存在',
      })
    }

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        code: role_name,
        ...roleConfig,
        permission_count: roleConfig.permissions.length,
      },
    })
  })
}
