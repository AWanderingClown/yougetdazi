// utils/api.js - API URL 构建工具
const config = require('../config/backend-config.js');

/**
 * 构建完整的 API URL
 * @param {string} endpoint - API 端点（如 'orders', 'companions'）或完整路径
 * @param {string|number} id - 资源 ID（可选）
 * @param {string} action - 动作（如 'pay', 'cancel', 'review'，可选）
 * @returns {string} 完整的 API URL
 * 
 * 使用示例：
 *   api.url('orders')              // /api/c/orders
 *   api.url('orders', 123)         // /api/c/orders/123
 *   api.url('orders', 123, 'pay')  // /api/c/orders/123/pay
 *   api.url('/api/c/custom/path')  // /api/c/custom/path
 */
function url(endpoint, id, action) {
  // 如果 endpoint 已经是完整路径（以 / 开头），直接使用
  if (endpoint.startsWith('/')) {
    return endpoint;
  }
  
  // 从配置中获取基础路径
  const baseUrl = config.api[endpoint] || `${config.api.prefix}/${endpoint}`;
  
  // 构建完整 URL
  let fullUrl = baseUrl;
  if (id !== undefined && id !== null) {
    fullUrl = `${fullUrl}/${id}`;
    if (action) {
      fullUrl = `${fullUrl}/${action}`;
    }
  }
  
  return fullUrl;
}

/**
 * 订单相关 API
 */
const orders = {
  list: () => url('orders'),
  detail: (id) => url('orders', id),
  create: () => url('orders'),
  delete: (id) => url('orders', id),  // DELETE method
  pay: (id) => url('orders', id, 'pay'),
  cancel: (id) => url('orders', id, 'cancel'),
  cancelPreview: (id) => url('orders', id, 'cancel-preview'),
  complete: (id) => url('orders', id, 'complete'),
  review: (id) => url('orders', id, 'review'),
  renew: (id) => url('orders', id, 'renew'),
  urge: (id) => url('orders', id, 'urge'),
  changeCompanion: (id) => url('orders', id, 'change-companion'),
  timer: (id) => url('orders', id, 'timer'),
  companionLocation: (id) => url('orders', id, 'companion-location')
};

/**
 * 搭子相关 API
 */
const companions = {
  list: () => url('companions'),
  search: () => url('/api/c/companions/list'),  // 搭子列表搜索接口
  detail: (id) => url('companions', id),
  like: (id) => url('companions', id, 'like')
};

/**
 * 消息相关 API
 */
const messages = {
  sessions: () => url('sessions'),
  history: (companionId) => url('messages', companionId),
  send: () => url('messages')
};

/**
 * 通知相关 API
 */
const notifications = {
  list: () => url('notifications'),
  unreadCount: () => url('notifications') + '/unread-count',
  readAll: () => url('notifications') + '/read-all',
  read: (id) => url('notifications', id, 'read')
};

/**
 * 监控和追踪 API
 */
const monitor = {
  error: () => url('monitor'),
  track: () => url('tracking')
};

/**
 * 配置相关 API
 */
const configApi = {
  businessRules: () => url('/api/config/business-rules')
};

module.exports = {
  url,
  orders,
  companions,
  messages,
  notifications,
  monitor,
  configApi,
  config
};
