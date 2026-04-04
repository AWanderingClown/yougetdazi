// src/routes/location.routes.ts
// 位置相关API路由

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { authenticate, requireCompanion, requireUser } from '../middleware/auth.js';
import { authenticateAdmin } from '../middleware/admin-auth.js';
import { prisma } from '../lib/prisma.js';
import {
  reportLocation,
  getCompanionLocation,
  getTrajectory,
  getMapKey,
  cleanupOldLocationData
} from '../services/location.service.js';

// 验证schema
const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().optional()
});

const reportLocationSchema = z.object({
  location: locationSchema
});

// Common param schemas
const orderIdParamsSchema = z.object({ orderId: z.string() });

// JSON Schemas for Fastify
const reportLocationJsonSchema = {
  params: zodToJsonSchema(orderIdParamsSchema, { target: 'openApi3' }),
  body: zodToJsonSchema(reportLocationSchema, { target: 'openApi3' })
};

const orderIdOnlyJsonSchema = {
  params: zodToJsonSchema(orderIdParamsSchema, { target: 'openApi3' })
};

export default async function locationRoutes(fastify: FastifyInstance) {

  /**
   * POST /api/b/orders/:orderId/location
   * B端上报位置（每5秒调用）
   */
  fastify.post(
    '/b/orders/:orderId/location',
    {
      schema: reportLocationJsonSchema,
      preHandler: [authenticate, requireCompanion]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const { location } = request.body as { location: { latitude: number; longitude: number; accuracy?: number } };
        
        // 从JWT获取搭子ID
        const companionId = request.currentUser?.id;
        if (!companionId) {
          return reply.code(401).send({
            code: -1,
            message: '未登录'
          });
        }

        // 获取订单信息（需要知道目的地坐标）
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: {
            service_latitude: true,
            service_longitude: true,
            companion_id: true
          }
        });

        if (!order) {
          return reply.code(404).send({
            code: -1,
            message: '订单不存在'
          });
        }

        // 验证搭子身份
        if (order.companion_id !== companionId) {
          return reply.code(403).send({
            code: -1,
            message: '无权操作此订单'
          });
        }

        // 检查订单状态（只有在accepted或serving状态才能上报位置）
        const currentOrder = await prisma.order.findUnique({
          where: { id: orderId },
          select: { status: true }
        });

        if (!currentOrder || !['accepted', 'serving'].includes(currentOrder.status)) {
          return reply.code(400).send({
            code: -1,
            message: '订单状态不允许上报位置'
          });
        }

        // 上报位置
        const result = await reportLocation({
          orderId,
          companionId,
          location,
          targetLocation: {
            latitude: order.service_latitude || 0,
            longitude: order.service_longitude || 0
          }
        });

        return reply.code(200).send({
          code: 0,
          data: {
            distance_to_target: result.distanceToTarget,
            has_arrived: result.hasArrived,
            can_start_service: result.canStartService,
            estimated_arrival: result.estimatedArrival?.toISOString(),
            speed: Math.round(result.speed * 3.6 * 10) / 10 // 转换为km/h，保留1位小数
          }
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          code: -1,
          message: '位置上报失败'
        });
      }
    }
  );

  /**
   * GET /api/orders/:orderId/companion-location
   * C端获取搭子当前位置（每30秒调用）
   */
  fastify.get(
    '/orders/:orderId/companion-location',
    {
      schema: orderIdOnlyJsonSchema,
      preHandler: [authenticate, requireUser]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        
        // 验证用户是否有权限查看此订单（必须是订单的客户）
        const userId = request.currentUser?.id;
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: { user_id: true, status: true }
        });

        if (!order) {
          return reply.code(404).send({
            code: -1,
            message: '订单不存在'
          });
        }

        // 验证是当前用户自己的订单
        if (order.user_id !== userId) {
          return reply.code(403).send({
            code: -1,
            message: '无权查看此订单位置'
          });
        }

        // 验证订单状态允许查看位置
        if (!['accepted', 'serving'].includes(order.status)) {
          return reply.code(400).send({
            code: -1,
            message: '当前订单状态不允许查看位置'
          });
        }

        // 获取搭子位置
        const location = await getCompanionLocation(orderId);

        if (!location) {
          return reply.code(404).send({
            code: -1,
            message: '暂无位置信息'
          });
        }

        return reply.code(200).send({
          code: 0,
          data: {
            companion_location: location.companionLocation,
            distance_to_client: location.distanceToClient,
            estimated_arrival: location.estimatedArrival?.toISOString(),
            updated_at: location.updatedAt.toISOString()
          }
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          code: -1,
          message: '获取位置失败'
        });
      }
    }
  );

  /**
   * GET /api/orders/:orderId/trajectory
   * 获取订单轨迹（B端和C端都可以调用，但需要验证身份）
   */
  fastify.get(
    '/orders/:orderId/trajectory',
    {
      schema: orderIdOnlyJsonSchema,
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const userId = request.currentUser?.id;
        const userRole = request.currentUser?.role;

        // 验证用户是否为订单相关方（客户或搭子）
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: { user_id: true, companion_id: true }
        });

        if (!order) {
          return reply.code(404).send({
            code: -1,
            message: '订单不存在'
          });
        }

        // 验证权限：必须是订单的客户、搭子或管理员
        const hasPermission = 
          userRole === 'admin' ||
          (userRole === 'user' && order.user_id === userId) ||
          (userRole === 'companion' && order.companion_id === userId);

        if (!hasPermission) {
          return reply.code(403).send({
            code: -1,
            message: '无权查看此订单轨迹'
          });
        }

        const trajectory = await getTrajectory(orderId);

        return reply.code(200).send({
          code: 0,
          data: {
            points: trajectory,
            total_points: trajectory.length
          }
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          code: -1,
          message: '获取轨迹失败'
        });
      }
    }
  );

  /**
   * GET /api/b/orders/:orderId/trajectory
   * B端获取自己的轨迹
   */
  fastify.get(
    '/b/orders/:orderId/trajectory',
    {
      schema: orderIdOnlyJsonSchema,
      preHandler: [authenticate, requireCompanion]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const companionId = request.currentUser?.id;

        // 验证身份
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: { companion_id: true }
        });

        if (!order || order.companion_id !== companionId) {
          return reply.code(403).send({
            code: -1,
            message: '无权查看'
          });
        }

        const trajectory = await getTrajectory(orderId);

        return reply.code(200).send({
          code: 0,
          data: {
            points: trajectory,
            total_points: trajectory.length
          }
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          code: -1,
          message: '获取轨迹失败'
        });
      }
    }
  );

  /**
   * GET /api/config/map-key
   * 获取腾讯地图Key（B端和C端都调用）
   */
  fastify.get(
    '/config/map-key',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const key = getMapKey();
        
        if (!key) {
          return reply.code(500).send({
            code: -1,
            message: '地图服务未配置'
          });
        }

        return reply.code(200).send({
          code: 0,
          data: {
            key: key,
            // 可以添加过期时间，用于Key轮换
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 1天后过期
          }
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          code: -1,
          message: '获取地图Key失败'
        });
      }
    }
  );

  /**
   * POST /api/admin/cleanup-location-history
   * 管理后台：手动清理历史数据
   */
  fastify.post(
    '/admin/cleanup-location-history',
    {
      preHandler: [authenticateAdmin]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const deletedCount = await cleanupOldLocationData();

        return reply.code(200).send({
          code: 0,
          data: {
            deleted_count: deletedCount,
            message: `已清理 ${deletedCount} 条历史记录`
          }
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          code: -1,
          message: '清理失败'
        });
      }
    }
  );
}
