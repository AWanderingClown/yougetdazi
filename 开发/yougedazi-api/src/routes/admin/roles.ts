import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticateAdmin } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { ROLE_PERMISSIONS } from '../../config/admin-permissions'

// 从唯一数据源派生合法角色名，确保新增角色时自动同步
const VALID_ROLE_NAMES = Object.keys(ROLE_PERMISSIONS) as [keyof typeof ROLE_PERMISSIONS, ...Array<keyof typeof ROLE_PERMISSIONS>]

// 缓存转换结果（常量数据只需计算一次）
const ROLES_LIST = Object.entries(ROLE_PERMISSIONS).map(([roleCode, details]) => ({
  code: roleCode,
  ...details,
  permission_count: details.permissions.length,
}))

export async function adminRolesRoutes(app: FastifyInstance) {
  app.get('/api/admin/roles', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        total: ROLES_LIST.length,
        list: ROLES_LIST,
      },
    })
  })

  app.get<{ Params: { role_name: string } }>('/api/admin/roles/:role_name', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    const parseResult = z.object({
      role_name: z.enum(VALID_ROLE_NAMES),
    }).safeParse(request.params)

    if (!parseResult.success) {
      return reply.status(404).send({
        code: ErrorCode.NOT_FOUND,
        message: '角色不存在',
      })
    }

    const { role_name } = parseResult.data
    const roleConfig = ROLE_PERMISSIONS[role_name]

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
