// config/backend-config.js - 后端配置
module.exports = {
  mode: 'mock',  // 临时使用mock模式，后端域名未部署
  realBaseUrl: 'https://api.ppmate.com',
  customerService: {
    phone: '400-888-8888',
    online: true
  },
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
