export const PAGE_SIZE = 10
export const PAGE_SIZES = [10, 20, 50]

export const API_TIMEOUT = 30000

export const MOCK_DELAY = {
  SHORT: 300,
  MEDIUM: 500,
  LONG: 1000
}

export const SERVICE_TYPE = {
  GAME_COMPANION: '游戏陪玩',
  VOICE_CHAT: '语音聊天',
  OFFLINE_EVENT: '线下活动',
  TALENT_SHOW: '才艺展示',
  OTHER: '其他服务'
}

export const SERVICE_TYPE_MAP = {
  [SERVICE_TYPE.GAME_COMPANION]: { type: 'primary' },
  [SERVICE_TYPE.VOICE_CHAT]: { type: 'success' },
  [SERVICE_TYPE.OFFLINE_EVENT]: { type: 'warning' },
  [SERVICE_TYPE.TALENT_SHOW]: { type: 'danger' },
  [SERVICE_TYPE.OTHER]: { type: 'info' }
}

export const LOG_TYPE = {
  AUDIT_PASS: '审核通过',
  UPDATE_STATUS: '更新状态',
  WITHDRAW_APPLY: '申请提现'
}

export const LOG_TYPE_MAP = {
  [LOG_TYPE.AUDIT_PASS]: { type: 'success' },
  [LOG_TYPE.UPDATE_STATUS]: { type: 'primary' },
  [LOG_TYPE.WITHDRAW_APPLY]: { type: 'warning' }
}
