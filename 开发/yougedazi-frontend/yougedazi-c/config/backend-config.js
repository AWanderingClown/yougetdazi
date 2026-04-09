// config/backend-config.js - 后端配置
module.exports = {
  mode: 'mixed',  // 混合模式：部分API走真实后端
  realBaseUrl: 'http://192.168.10.4:3000',
  api: {
    prefix: '/api/c',
    orders: '/api/c/orders',
    companions: '/api/c/companions',
    messages: '/api/c/messages',
    sessions: '/api/c/messages/sessions',
    notifications: '/api/c/notifications',
    tracking: '/api/c/track',
    monitor: '/api/c/monitor/error'
  }
};
