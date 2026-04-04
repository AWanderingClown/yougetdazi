/**
 * 订单相关的业务常量
 */

/** Push 事件类型 */
export const PUSH_EVENTS = {
  NEW_ORDER: 'new_order',
  NEW_REWARD_ORDER: 'new_reward_order',
  ORDER_STATUS_CHANGED: 'order_status_changed',
  ORDER_COMPLETED: 'order_completed',
  COMPANION_ORDER_STATUS_CHANGED: 'companion_order_status_changed',
  SERVICE_STARTED: 'service_started',
  NEW_MESSAGE: 'new_message',
} as const

export type PushEventType = typeof PUSH_EVENTS[keyof typeof PUSH_EVENTS]

/** 取消手续费：50元 = 5000分 */
export const CANCEL_FEE = 5000

/** 2分钟内免手续费取消的时间阈值（毫秒） */
export const CANCEL_FREE_PERIOD_MS = 2 * 60 * 1000

/** 15分钟内可取消的时间阈值（毫秒） */
export const CANCEL_15MIN_MS = 15 * 60 * 1000

/** 保证金档位阈值 */
export const DEPOSIT_LEVELS = {
  PREMIUM_THRESHOLD: 50000,
  BASIC_THRESHOLD: 20000,
} as const
