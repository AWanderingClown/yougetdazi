// 工具函数统一导出

export {
  ORDER_STATUS,
  ORDER_STATUS_MAP,
  COMPANION_STATUS,
  COMPANION_STATUS_MAP,
  ACCOUNT_ROLE,
  ROLE_MAP,
  ACCOUNT_STATUS,
  WITHDRAW_STATUS,
  WITHDRAW_STATUS_MAP,
  TRAINING_TYPE,
  TRAINING_TYPE_MAP,
  getStatusInfo
} from './status'

export {
  PAGE_SIZE,
  PAGE_SIZES,
  API_TIMEOUT,
  MOCK_DELAY,
  SERVICE_TYPE,
  SERVICE_TYPE_MAP,
  LOG_TYPE,
  LOG_TYPE_MAP
} from '../constants'

/**
 * 格式化金额
 * @param {number} amount - 金额
 * @param {number} decimals - 小数位
 * @returns {string}
 */
export const formatMoney = (amount, decimals = 2) => {
  if (amount === null || amount === undefined) return '-'
  return Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

/**
 * 格式化日期
 * @param {string|Date} date - 日期
 * @param {string} format - 格式
 * @returns {string}
 */
export const formatDate = (date, format = 'YYYY-MM-DD') => {
  if (!date) return '-'
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
}

/**
 * 格式化日期时间
 * @param {string|Date} date - 日期
 * @returns {string}
 */
export const formatDateTime = (date) => {
  if (!date) return '-'
  const d = new Date(date)
  return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 脱敏手机号
 * @param {string} phone - 手机号
 * @returns {string}
 */
export const maskPhone = (phone) => {
  if (!phone) return '-'
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

/**
 * 脱敏微信号
 * @param {string} wechat - 微信号
 * @returns {string}
 */
export const maskWechat = (wechat) => {
  if (!wechat) return '-'
  if (wechat.length <= 4) return '****'
  return wechat.substring(0, 2) + '****' + wechat.substring(wechat.length - 2)
}

/**
 * 延迟函数
 * @param {number} ms - 毫秒
 * @returns {Promise}
 */
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 深拷贝
 * @param {*} obj - 对象
 * @returns {*}
 */
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime())
  if (obj instanceof Array) return obj.map(item => deepClone(item))
  if (obj instanceof Object) {
    const cloned = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key])
      }
    }
    return cloned
  }
  return obj
}

/**
 * HTML转义（防止XSS）
 * @param {string} str - 原始字符串
 * @returns {string}
 */
export const escapeHtml = (str) => {
  if (str === null || str === undefined) return ''
  const div = document.createElement('div')
  div.textContent = String(str)
  return div.innerHTML
}
