export const ORDER_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
}

export const ORDER_STATUS_MAP = {
  [ORDER_STATUS.PENDING]: { type: 'warning', text: '待接单' },
  [ORDER_STATUS.IN_PROGRESS]: { type: 'primary', text: '服务中' },
  [ORDER_STATUS.COMPLETED]: { type: 'success', text: '已完成' },
  [ORDER_STATUS.CANCELLED]: { type: 'info', text: '已取消' }
}

export const COMPANION_STATUS = {
  ONLINE: 'online',
  BUSY: 'busy',
  OFFLINE: 'offline',
  DISABLED: 'disabled'
}

export const COMPANION_STATUS_MAP = {
  [COMPANION_STATUS.ONLINE]: { type: 'success', text: '在线' },
  [COMPANION_STATUS.BUSY]: { type: 'warning', text: '忙碌' },
  [COMPANION_STATUS.OFFLINE]: { type: 'info', text: ' ' },
  [COMPANION_STATUS.DISABLED]: { type: 'danger', text: '已禁用' }
}

export const ACCOUNT_ROLE = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  FINANCE: 'finance'
}

export const ROLE_MAP = {
  [ACCOUNT_ROLE.ADMIN]: { type: 'danger', text: '超级管理员' },
  [ACCOUNT_ROLE.OPERATOR]: { type: 'primary', text: '运营人员' },
  [ACCOUNT_ROLE.FINANCE]: { type: 'success', text: '财务人员' }
}

export const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
}

export const WITHDRAW_STATUS = {
  COMPLETED: 'completed',
  PROCESSING: 'processing',
  FAILED: 'failed'
}

export const WITHDRAW_STATUS_MAP = {
  [WITHDRAW_STATUS.COMPLETED]: { type: 'success', text: '已完成' },
  [WITHDRAW_STATUS.PROCESSING]: { type: 'warning', text: '处理中' },
  [WITHDRAW_STATUS.FAILED]: { type: 'danger', text: '失败' }
}

export const TRAINING_TYPE = {
  RULE: 'rule',
  STANDARD: 'standard',
  GUIDE: 'guide'
}

export const TRAINING_TYPE_MAP = {
  [TRAINING_TYPE.RULE]: { type: 'danger', text: '平台规则' },
  [TRAINING_TYPE.STANDARD]: { type: 'warning', text: '服务标准' },
  [TRAINING_TYPE.GUIDE]: { type: 'success', text: '操作指南' }
}

export const getStatusInfo = (map, status) => map[status] || { type: 'info', text: '未知' }
