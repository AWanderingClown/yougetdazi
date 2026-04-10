import { FastifyInstance } from 'fastify'
import { authenticateAdmin } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'

// ============================================================
// 权限定义常量
// ============================================================

const PERMISSION_DEFINITIONS = {
  // 仪表盘
  'dashboard.view': { name: '仪表盘', category: '数据分析', description: '查看仪表盘数据' },

  // 用户管理
  'users.view': { name: '用户列表', category: '用户管理', description: '查看C端用户列表' },
  'users.detail': { name: '用户详情', category: '用户管理', description: '查看用户详细信息' },
  'users.ban': { name: '用户禁用', category: '用户管理', description: '禁用/解禁用户' },

  // 搭子（B端）管理
  'companions.view': { name: '搭子列表', category: '搭子管理', description: '查看B端搭子列表' },
  'companions.detail': { name: '搭子详情', category: '搭子管理', description: '查看搭子详细信息' },
  'companions.audit': { name: '搭子审核', category: '搭子管理', description: '审核搭子入驻申请' },
  'companions.deposit': { name: '保证金管理', category: '搭子管理', description: '管理搭子保证金' },

  // 订单管理
  'orders.view': { name: '订单列表', category: '订单管理', description: '查看订单列表' },
  'orders.detail': { name: '订单详情', category: '订单管理', description: '查看订单详细信息' },
  'orders.dispute': { name: '纠纷处理', category: '订单管理', description: '处理订单纠纷' },

  // 财务管理
  'finance.view': { name: '财务数据', category: '财务管理', description: '查看财务数据' },
  'finance.withdraw': { name: '提现审核', category: '财务管理', description: '审核提现申请' },
  'finance.refund': { name: '退款管理', category: '财务管理', description: '处理退款事项' },

  // 评价审核
  'reviews.audit': { name: '评价审核', category: '内容审核', description: '审核和管理评价' },

  // 系统配置
  'system.config': { name: '系统配置', category: '系统管理', description: '修改系统配置' },

  // 风险管理
  'risk.manage': { name: '风控管理', category: '风险管理', description: '管理风控规则和记录' },

  // 客服管理
  'service.manage': { name: '客服管理', category: '客服中心', description: '管理工单和知识库' },

  // 营销管理
  'marketing.manage': { name: '营销管理', category: '营销运营', description: '管理优惠券和活动' },

  // 数据分析
  'data.view': { name: '数据分析', category: '数据分析', description: '查看数据统计和报表' },

  // 设置管理
  'settings.edit': { name: '设置编辑', category: '系统设置', description: '编辑系统设置' },
}

// ============================================================
// Admin 权限查询路由
// ============================================================

export async function adminPermissionsRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/permissions
   * 列出系统所有权限定义
   * 权限：所有角色可查
   */
  app.get('/api/admin/permissions', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const permissions = Object.entries(PERMISSION_DEFINITIONS).map(([code, details]) => ({
      code,
      ...details,
    }))

    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        total: permissions.length,
        list: permissions,
      },
    })
  })
}
