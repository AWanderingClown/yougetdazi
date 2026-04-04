/**
 * 订单超时 Job 定义
 *
 * Job 由各 Service 创建（OrderService.startService 等），
 * Worker 定义在 src/services/timer.service.ts。
 *
 * 此文件用于归档 Job 数据结构类型定义，供类型检查使用。
 */

export interface PaymentTimeoutJobData {
  orderId:  string
  orderNo:  string
}

export interface AcceptTimeoutJobData {
  orderId:  string
  orderNo:  string
}

export interface ServiceTimeoutJobData {
  orderId:     string
  companionId: string
}

export interface AutoReviewJobData {
  orderId:     string
  userId:      string
  companionId: string | null
}
