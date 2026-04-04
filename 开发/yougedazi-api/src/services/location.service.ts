// src/services/location.service.ts
// 位置服务 - 处理实时位置、轨迹、预计到达时间

import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

interface Location {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

interface ReportLocationParams {
  orderId: string;
  companionId: string;
  location: Location;
  targetLocation: Location;
}

interface LocationUpdateResult {
  distanceToTarget: number;
  hasArrived: boolean;
  canStartService: boolean;
  estimatedArrival?: Date;
  speed: number;
}

/**
 * 使用Haversine公式计算两点间距离（米）
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 地球半径（米）
  const dLat = deg2rad(lat2 - lat1);
  const dLng = deg2rad(lng2 - lng1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * 计算平均速度（米/秒）
 * 基于最近5分钟的轨迹点
 * 优化：使用实际时间跨度，过滤异常速度点
 */
async function calculateAverageSpeed(orderId: string): Promise<number> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  
  const recentPoints = await prisma.orderLocationHistory.findMany({
    where: {
      order_id: orderId,
      recorded_at: {
        gte: fiveMinutesAgo
      }
    },
    orderBy: {
      recorded_at: 'asc'
    },
    take: 60 // 最多60个点（5分钟，每5秒一个）
  });

  if (recentPoints.length < 2) {
    return 0; // 数据不足，无法计算速度
  }

  let totalDistance = 0;
  let validPointCount = 0;
  const MAX_REASONABLE_SPEED = 50; // 50m/s = 180km/h，超过此值视为异常

  for (let i = 1; i < recentPoints.length; i++) {
    const prev = recentPoints[i - 1];
    const curr = recentPoints[i];
    
    const distance = calculateDistance(
      prev.latitude, prev.longitude,
      curr.latitude, curr.longitude
    );
    
    const timeDiff = (curr.recorded_at.getTime() - prev.recorded_at.getTime()) / 1000; // 秒
    
    if (timeDiff > 0) {
      const instantSpeed = distance / timeDiff;
      // 过滤异常速度点
      if (instantSpeed <= MAX_REASONABLE_SPEED) {
        totalDistance += distance;
        validPointCount++;
      }
    }
  }

  // 使用第一个点到当前时间的实际跨度计算平均速度
  const actualTimeSpan = (Date.now() - recentPoints[0].recorded_at.getTime()) / 1000;
  
  // 平均速度（米/秒），使用实际时间跨度而非累计时间差
  return actualTimeSpan > 0 ? totalDistance / actualTimeSpan : 0;
}

/**
 * 预计到达时间计算
 * 优化：添加路线系数补偿，处理静止状态，限制最小ETA
 */
const ROUTE_FACTOR = 1.3; // 路线系数：实际路径通常比直线距离长1.2-1.5倍

function calculateEstimatedArrival(
  currentDistance: number,
  averageSpeed: number,
  hasArrived: boolean
): Date | undefined {
  if (hasArrived) return undefined;

  // 处理静止状态：即使速度低也给一个保守估计
  let effectiveSpeed = averageSpeed;
  if (averageSpeed <= 0.5) {
    // 使用保守步行速度约1.5m/s（5.4km/h）
    effectiveSpeed = 1.5;
  }

  // 使用路线因子修正距离
  const adjustedDistance = currentDistance * ROUTE_FACTOR;
  const estimatedSeconds = adjustedDistance / effectiveSpeed;

  // 限制最小ETA（不可能瞬间到达，至少30秒）
  const MIN_ETA_SECONDS = 30;
  const finalSeconds = Math.max(estimatedSeconds, MIN_ETA_SECONDS);

  return new Date(Date.now() + finalSeconds * 1000);
}

/**
 * 上报位置 - 核心方法
 * 优化：使用数据库事务包裹所有数据库操作
 */
export async function reportLocation(
  params: ReportLocationParams
): Promise<LocationUpdateResult> {
  const { orderId, companionId, location, targetLocation } = params;

  // 1. 计算与目的地的距离
  const distanceToTarget = Math.round(calculateDistance(
    location.latitude, location.longitude,
    targetLocation.latitude, targetLocation.longitude
  ));

  // 2. 检查是否到达（100米范围内）
  const ARRIVAL_THRESHOLD = 100; // 米
  const hasArrived = distanceToTarget <= ARRIVAL_THRESHOLD;

  // 3. 计算速度（基于最近5分钟轨迹）
  const speed = await calculateAverageSpeed(orderId);

  // 4. 计算预计到达时间
  const estimatedArrival = calculateEstimatedArrival(distanceToTarget, speed, hasArrived);

  // 5. 使用事务包裹数据库操作
  try {
    await prisma.$transaction(async (tx) => {
      // 更新当前位置（upsert）
      await tx.orderCurrentLocation.upsert({
        where: { order_id: orderId },
        update: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          speed: speed,
          distance_to_target: distanceToTarget,
          has_arrived: hasArrived,
          estimated_arrival: estimatedArrival,
          updated_at: new Date()
        },
        create: {
          order_id: orderId,
          companion_id: companionId,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          speed: speed,
          distance_to_target: distanceToTarget,
          has_arrived: hasArrived,
          estimated_arrival: estimatedArrival
        }
      });

      // 插入历史轨迹
      await tx.orderLocationHistory.create({
        data: {
          order_id: orderId,
          latitude: location.latitude,
          longitude: location.longitude,
          speed: speed,
          recorded_at: new Date()
        }
      });
    });
  } catch (error) {
    console.error('数据库事务失败:', error);
    throw new Error('位置上报失败，请稍后重试');
  }

  // 6. 缓存到Redis（用于快速查询，失败不影响主流程）
  try {
    const cacheKey = `order:${orderId}:location`;
    await redis.setex(cacheKey, 60, JSON.stringify({
      latitude: location.latitude,
      longitude: location.longitude,
      distanceToTarget,
      hasArrived,
      speed,
      estimatedArrival: estimatedArrival?.toISOString(),
      updatedAt: new Date().toISOString()
    }));
  } catch (redisError) {
    console.warn('Redis缓存更新失败:', redisError);
    // Redis失败不影响主流程
  }

  return {
    distanceToTarget,
    hasArrived,
    canStartService: hasArrived,
    estimatedArrival: estimatedArrival || undefined,
    speed
  };
}

/**
 * 获取搭子当前位置（C端调用）
 */
export async function getCompanionLocation(orderId: string): Promise<{
  companionLocation: Location;
  distanceToClient: number;
  estimatedArrival?: Date;
  updatedAt: Date;
} | null> {
  // 先查Redis缓存
  const cacheKey = `order:${orderId}:location`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    const data = JSON.parse(cached);
    return {
      companionLocation: {
        latitude: data.latitude,
        longitude: data.longitude
      },
      distanceToClient: data.distanceToTarget,
      estimatedArrival: data.estimatedArrival ? new Date(data.estimatedArrival) : undefined,
      updatedAt: new Date(data.updatedAt)
    };
  }

  // 查数据库
  const location = await prisma.orderCurrentLocation.findUnique({
    where: { order_id: orderId }
  });

  if (!location) {
    return null;
  }

  return {
    companionLocation: {
      latitude: location.latitude,
      longitude: location.longitude
    },
    distanceToClient: location.distance_to_target,
    estimatedArrival: location.estimated_arrival || undefined,
    updatedAt: location.updated_at
  };
}

/**
 * 获取轨迹（用于显示路径）
 */
export async function getTrajectory(orderId: string): Promise<Array<{
  latitude: number;
  longitude: number;
  speed: number;
  recordedAt: Date;
}>> {
  const points = await prisma.orderLocationHistory.findMany({
    where: { order_id: orderId },
    orderBy: { recorded_at: 'asc' },
    take: 1000 // 最多返回1000个点
  });

  return points.map(p => ({
    latitude: p.latitude,
    longitude: p.longitude,
    speed: p.speed,
    recordedAt: p.recorded_at
  }));
}

/**
 * 清理旧数据（保留30天）
 * 优化：同时清理历史轨迹和已结束订单的当前位置
 */
export async function cleanupOldLocationData(): Promise<{
  historyDeleted: number;
  currentDeleted: number;
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // 1. 清理30天前的历史轨迹
  const historyResult = await prisma.orderLocationHistory.deleteMany({
    where: {
      recorded_at: {
        lt: thirtyDaysAgo
      }
    }
  });

  // 2. 清理已结束/取消订单的当前位置（30天前的）
  // 需要先查询符合条件的订单ID
  const oldFinishedOrders = await prisma.order.findMany({
    where: {
      status: {
        in: ['completed', 'cancelled']
      },
      updated_at: {
        lt: thirtyDaysAgo
      }
    },
    select: {
      id: true
    }
  });

  const orderIds = oldFinishedOrders.map(o => o.id);
  
  let currentDeleted = 0;
  if (orderIds.length > 0) {
    const currentResult = await prisma.orderCurrentLocation.deleteMany({
      where: {
        order_id: {
          in: orderIds
        }
      }
    });
    currentDeleted = currentResult.count;
  }

  console.log(`[Cleanup] 清理历史轨迹: ${historyResult.count} 条, 清理当前位置: ${currentDeleted} 条`);

  return {
    historyDeleted: historyResult.count,
    currentDeleted: currentDeleted
  };
}

/**
 * 获取地图Key（从环境变量）
 */
export function getMapKey(): string {
  return process.env.TENCENT_MAP_KEY || '';
}
