import { FastifyInstance } from 'fastify'
import { authenticateAdmin } from '../../middleware/admin-auth'
import { ErrorCode } from '../../types/index'
import { PERMISSION_DEFINITIONS } from '../../config/admin-permissions'

// 缓存转换结果（常量数据只需计算一次）
const PERMISSIONS_LIST = Object.entries(PERMISSION_DEFINITIONS).map(([code, details]) => ({
  code,
  ...details,
}))

export async function adminPermissionsRoutes(app: FastifyInstance) {
  app.get('/api/admin/permissions', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    return reply.status(200).send({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: {
        total: PERMISSIONS_LIST.length,
        list: PERMISSIONS_LIST,
      },
    })
  })
}
