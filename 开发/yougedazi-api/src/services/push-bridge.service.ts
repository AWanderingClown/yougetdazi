/**
 * PushBridgeService
 *
 * 职责：将后端产生的推送事件转发给推送服务器（3002端口）
 * 架构：后端计算 → HTTP POST + X-Push-Api-Key → 推送服务器(3002) → Socket.IO → B端/C端
 *
 * 注意：推送失败不影响主业务流程（降级静默处理）
 */

// PushEvent 是全项目唯一权威类型定义，push-server/src/app.ts 与此保持一致
export interface PushEvent {
  type:       'new_order' | 'new_reward_order' | 'order_status_changed' | 'order_completed' | 'companion_order_status_changed' | 'service_started' | 'new_message'
  targetType: 'user' | 'companion' | 'broadcast'
  targetId:   string
  payload:    Record<string, unknown>
}

export interface PushEventBatch {
  events:    PushEvent[]
  timestamp: string
  source:    'order_service' | 'payment_service'
}

class PushBridgeService {
  private pushServerUrl: string
  private apiKey: string

  constructor() {
    this.pushServerUrl = process.env.ADMIN_PUSH_SERVER_URL || 'http://localhost:3002'
    this.apiKey = process.env.PUSH_API_KEY || 'dev-push-key'
  }

  /**
   * 批量发送推送事件到推送服务器
   */
  async sendPushEvents(events: PushEvent[], source: 'order_service' | 'payment_service' = 'order_service'): Promise<void> {
    if (!events || events.length === 0) return

    const batch: PushEventBatch = {
      events,
      timestamp: new Date().toISOString(),
      source,
    }

    try {
      const response = await fetch(`${this.pushServerUrl}/api/push/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Push-Api-Key': this.apiKey,
        },
        body: JSON.stringify(batch),
      })

      if (!response.ok) {
        console.error(JSON.stringify({ level: 'error', msg: '[PushBridge] 推送事件失败', status: response.status, statusText: response.statusText }))
      }
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: '[PushBridge] 推送服务器不可达', err: String(err) }))
    }
  }

  /**
   * 发送单个推送事件
   */
  async sendPushEvent(event: PushEvent, source: 'order_service' | 'payment_service' = 'order_service'): Promise<void> {
    return this.sendPushEvents([event], source)
  }
}

export const pushBridgeService = new PushBridgeService()
