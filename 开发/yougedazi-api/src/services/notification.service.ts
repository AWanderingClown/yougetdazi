import axios from 'axios'
import { prisma } from '../lib/prisma'
import { pushBridgeService } from './push-bridge.service'
import { redis, RedisKey } from '../lib/redis'

/**
 * NotificationService
 *
 * 职责：将站内通知写入数据库，并通过 pushBridgeService → 推送服务器(3002) → Socket.IO 发送实时推送
 *
 * 触发时机：
 * - 订单状态变更
 * - 审核结果
 * - 支付成功/失败
 */
export class NotificationService {
  async createUserNotification(params: {
    userId:       string
    type:         'order' | 'system' | 'activity' | 'message'
    title:        string
    content:      string
    relatedId?:   string
    relatedType?: string
    extraData?:   Record<string, any>
  }) {
    return this.createNotification('user', params.userId, params)
  }

  async createCompanionNotification(params: {
    companionId:  string
    type:         'order' | 'system' | 'activity' | 'message'
    title:        string
    content:      string
    relatedId?:   string
    relatedType?: string
    extraData?:   Record<string, any>
  }) {
    return this.createNotification('companion', params.companionId, params)
  }

  private async createNotification(
    side: 'user' | 'companion',
    targetId: string,
    params: {
      type:         'order' | 'system' | 'activity' | 'message'
      title:        string
      content:      string
      relatedId?:   string
      relatedType?: string
      extraData?:   Record<string, any>
    }
  ) {
    const { type, title, content, relatedId, relatedType, extraData } = params
    try {
      const notification = await prisma.notification.create({
        data: {
          ...(side === 'user' ? { user_id: targetId } : { companion_id: targetId }),
          type,
          title,
          content,
          related_id:   relatedId,
          related_type: relatedType,
          extra_data:   extraData || {},
          is_read:      false,
        },
      })

      void pushBridgeService.sendPushEvent({
        type:       'order_status_changed',
        targetType: side,
        targetId,
        payload: {
          notification_id: notification.id,
          type:            notification.type,
          title:           notification.title,
          content:         notification.content,
          related_id:      notification.related_id || undefined,
          created_at:      notification.created_at.toISOString(),
        },
      })

      return notification
    } catch (err) {
      console.error(`创建${side === 'user' ? '用户' : '陪玩师'}通知失败:`, err)
      return null
    }
  }

  /**
   * 微信订阅消息推送
   *
   * @param side 发送给哪个端的用户（决定使用哪个 AppID 获取 access_token）
   *             'user' = C端小程序，'companion' = B端小程序，默认 'user'
   */
  async sendWxSubscribeMessage(params: {
    openid:     string
    templateId: string
    data:       Record<string, { value: string }>
    side?:      'user' | 'companion'
  }) {
    const side      = params.side ?? 'user'
    const appId     = side === 'user' ? process.env.WX_C_APP_ID     : process.env.WX_B_APP_ID
    const appSecret = side === 'user' ? process.env.WX_C_APP_SECRET : process.env.WX_B_APP_SECRET

    if (!appId || !appSecret || appId.startsWith('TODO_') || process.env.WX_MOCK_LOGIN === 'true') {
      console.warn('[NotificationService] 微信订阅消息未配置，跳过推送')
      return
    }

    try {
      const accessToken = await this.getWxAccessToken(appId, appSecret)

      const res = await axios.post<{ errcode: number; errmsg: string }>(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
        {
          touser:      params.openid,
          template_id: params.templateId,
          data:        params.data,
        }
      )

      if (res.data.errcode !== 0) {
        console.error(`[NotificationService] 订阅消息推送失败: errcode=${res.data.errcode} errmsg=${res.data.errmsg}`)
      }
    } catch (err) {
      console.error('[NotificationService] 订阅消息推送异常:', err)
    }
  }

  /**
   * 获取微信 access_token（Redis 缓存，7000s 有效期，提前 200s 续期）
   */
  private async getWxAccessToken(appId: string, appSecret: string): Promise<string> {
    const cacheKey = RedisKey.wxAccessToken(appId)
    const cached   = await redis.get(cacheKey)
    if (cached) return cached

    const res = await axios.get<{ access_token?: string; expires_in?: number; errcode?: number; errmsg?: string }>(
      'https://api.weixin.qq.com/cgi-bin/token',
      { params: { grant_type: 'client_credential', appid: appId, secret: appSecret } }
    )

    if (!res.data.access_token) {
      throw new Error(`获取 access_token 失败: errcode=${res.data.errcode} errmsg=${res.data.errmsg}`)
    }

    // 微信 access_token 有效期通常 7200s，提前 200s 过期以防边界竞争
    const ttl = (res.data.expires_in ?? 7200) - 200
    await redis.setex(cacheKey, ttl, res.data.access_token)
    return res.data.access_token
  }
}

export const notificationService = new NotificationService()
