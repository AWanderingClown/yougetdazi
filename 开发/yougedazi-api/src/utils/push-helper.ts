/**
 * Push 事件分发工具函数
 */

import { pushBridgeService } from '../services/push-bridge.service.js'

/**
 * 从服务层结果中提取并转发 pushEvents
 * 无事件时静默返回（无error）
 * 异步发送，不阻塞主流程
 * @param result 服务层返回值
 */
export async function dispatchPushEvents(result: unknown): Promise<void> {
  if (
    result &&
    typeof result === 'object' &&
    'pushEvents' in result &&
    Array.isArray((result as any).pushEvents)
  ) {
    await pushBridgeService.sendPushEvents((result as any).pushEvents, 'order_service')
  }
}
