// app.js - 有个搭子 C端小程序入口
// 模拟数据导入
const mockCompanions = require('./mock-data/companions');
const mockOrders = require('./mock-data/orders');
const mockUser = require('./mock-data/user');
const logger = require('./utils/logger');
const api = require('./utils/api');

// Backend alignment: mixed mode config (mock + real). If not present, default to mock.
let backendConfig = {};
try {
  backendConfig = require('./config/backend-config.js');
} catch (e) {
  backendConfig = { mode: 'mock', realBaseUrl: '' };
}

// 简易会话列表的静态 Mock（用于前端分页与 UI 展示的演示）
const mockConversations = [
  {
    id: 'system',
    type: 'system',
    title: '系统通知',
    avatar: '/images/system-notice.png',
    lastMessage: '欢迎来到有个搭子，发现有趣的陪伴！',
    lastTime: '10:30',
    unreadCount: 1
  },
  {
    id: 1,
    type: 'chat',
    nickname: '张三',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
    lastMessage: '好的，明天见！',
    lastTime: '09:15',
    unreadCount: 2,
    isOnline: true
  },
  {
    id: 2,
    type: 'chat',
    nickname: '李四',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200',
    lastMessage: '请问具体在哪个位置？',
    lastTime: '昨天',
    unreadCount: 0,
    isOnline: false
  }
]

App({
  globalData: {
    userInfo: null,
    systemInfo: null,
    deviceInfo: null,
    windowInfo: null,
    location: null,
    token: null,
    refreshToken: null,
    // 开发配置：使用模拟数据模式
    useMockData: true,
    // 从配置文件读取API地址，便于环境切换
    apiBaseUrl: (backendConfig && backendConfig.realBaseUrl) || '',  // mock模式下不使用真实API
    pushServerUrl: (backendConfig && backendConfig.pushServerUrl) || 'wss://api.ppmate.com',

    // Socket.IO 实例（后端接入后使用）
    socket: null,
    // 离线期间积压的通知数（用于消息角标）
    pendingNotificationsCount: 0,

    pendingOrderUpdates: {},

    // 客服配置（从后端动态获取）
    customerServicePhone: '400-888-8888'
  },

  onLaunch(options) {
    this.getSystemInfo();
    // 初始化埋点系统
    const tracking = require('./utils/tracking');
    tracking.init();
    tracking.track('app_launch', { scene: options.scene }, 'system');

    // 加载业务规则配置（异步后台加载，不阻塞首屏初始化）
    // 规则会在loadRules完成时被使用，页面打开时大概率已经加载完成
    const configService = require('./utils/config-service');
    configService.loadRules().catch(err => {
      console.warn('[App] 业务规则加载失败，使用本地默认值:', err.message);
    });

    // 加载客服配置
    this.loadCustomerServiceConfig();

    // 开发阶段：自动设置模拟登录状态
    if (this.globalData.useMockData) {
      this.setupMockLogin();
    } else {
      this.checkLoginStatus();
      this.initSocket();
    }
    // 网络状态监听：离线后重新上线时尝试刷新当前页面
    try {
      this._wasOffline = false;
      const self = this;
      wx.onNetworkStatusChange((res) => {
        if (res.isConnected) {
          if (self._wasOffline) {
            self._wasOffline = false;
            const pages = getCurrentPages();
            const current = pages[pages.length - 1];
            if (current && typeof current.onShow === 'function') {
              current.onShow();
            }
          }
        } else {
          self._wasOffline = true;
        }
      });
    } catch (e) {
      // 忽略网络状态监听失败
    }
  },

  // 开发阶段：设置模拟登录
  setupMockLogin() {
    console.log('[Mock] 使用模拟数据模式');
    this.globalData.token = mockUser.token.access_token;
    this.globalData.refreshToken = mockUser.token.refresh_token;
    this.globalData.userInfo = mockUser.currentUser;
    wx.setStorageSync('token', mockUser.token.access_token);
    wx.setStorageSync('refresh_token', mockUser.token.refresh_token);
    wx.setStorageSync('userInfo', mockUser.currentUser);
  },

  onShow(options) {
    // 应用显示
  },

  onHide() {
    console.log('App Hide');
  },

  onError(msg) {
    // 应用错误上报到监控后台（使用 error-reporter.js 以便测试与替换）
    try {
      const apiBase = (this.globalData && this.globalData.apiBaseUrl) || '';
      if (!apiBase) return;
      const reporter = require('./utils/error-reporter');
      const payload = reporter.buildErrorPayload(msg, this.globalData.userInfo, apiBase);
      wx.request({
        url: payload.url,
        method: payload.method,
        data: payload.data,
        fail() {
          // 忽略上报失败，防止影响正常流程
        }
      })
    } catch (e) {
      // 忽略异常，避免影响主流程
    }
  },

  // 获取系统信息
  getSystemInfo() {
    const deviceInfo = wx.getDeviceInfo();
    this.globalData.deviceInfo = deviceInfo;
    
    const windowInfo = wx.getWindowInfo();
    this.globalData.windowInfo = windowInfo;
    
    const appBaseInfo = wx.getAppBaseInfo();
    
    this.globalData.systemInfo = {
      ...deviceInfo,
      ...windowInfo,
      ...appBaseInfo
    };
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token');
    const refreshToken = wx.getStorageSync('refresh_token');
    if (token) {
      this.globalData.token = token;
      this.globalData.refreshToken = refreshToken || null;
      this.getUserInfo();
    }
  },

  // 获取用户信息
  getUserInfo() {
    const that = this;
    // mock模式下使用本地数据
    if (backendConfig.mode === 'mock') {
      that.globalData.userInfo = mockUser.currentUser;
      return;
    }
    wx.request({
      url: that.globalData.apiBaseUrl + '/api/user/info',
      header: {
        'Authorization': 'Bearer ' + that.globalData.token
      },
      success(res) {
        if (res.data.code === 0) {
          that.globalData.userInfo = res.data.data;
        }
      }
    });
  },

  // 初始化 Socket 连接
  initSocket() {
    if (!this.globalData.token) return;
    if (this.globalData.socket) return;

    const io = require('./utils/weapp-socket.io');
    const socket = io(this.globalData.pushServerUrl, {
      auth: { token: this.globalData.token }
    });

    socket.on('connect', () => {
      console.log('[Socket] C端已连接');
      this._fetchPendingNotifications();
    });

    socket.on('reconnect', () => {
      console.log('[Socket] C端重连成功');
      this._fetchPendingNotifications();
    });

    socket.on('order:status_changed', (payload) => {
      const { orderId, toStatus, message } = payload;
      console.log('[Socket] 订单状态变更:', orderId, toStatus);

      this.globalData.pendingOrderUpdates[orderId] = {
        status: toStatus,
        message: message || '',
        updatedAt: Date.now()
      };

      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      if (currentPage && currentPage.route &&
          currentPage.route.indexOf('order-detail') !== -1) {
        currentPage.loadOrderDetail && currentPage.loadOrderDetail();
      }

      const tips = {
        accepted: '搭子已接单，正在前往',
        serving: '服务已开始',
        completed: '服务已完成，请评价',
        cancelled: '订单已取消'
      };
      if (tips[toStatus]) {
        wx.showToast({ title: tips[toStatus], icon: 'none', duration: 3000 });
      }
    });

    socket.on('message:new', (msg) => {
      console.log('[Socket] 收到新消息:', msg.session_id);
      this.globalData.pendingNotificationsCount++;
      // 更新TabBar消息角标（非聊天页面时）
      this.updateMessageBadge();
    });

    socket.on('notification:new', (notification) => {
      console.log('[Socket] 收到通知:', notification.title);
      this.globalData.pendingNotificationsCount++;
    });

    socket.on('connect_error', (err) => {
      logger.error(logger.Categories.SOCKET, 'C端连接错误:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] C端断开:', reason);
    });

    this.globalData.socket = socket;
  },

  // 断开 Socket 连接
  disconnectSocket() {
    if (this.globalData.socket) {
      this.globalData.socket.disconnect();
      this.globalData.socket = null;
      console.log('[Socket] 已断开');
    }
  },

  // 更新TabBar消息角标（仅显示红点，不显示数字）
  updateMessageBadge() {
    const count = this.globalData.pendingNotificationsCount;
    
    // 检查当前页面是否包含TabBar（部分页面如登录页没有TabBar）
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    const hasTabBar = !currentPage || !currentPage.route || 
                      !['/pages/login/login', '/pages/chat/chat'].includes(currentPage.route);
    
    if (!hasTabBar) return;
    
    if (count > 0) {
      // V1.0规则：Tab角标仅显示红点，不显示数字
      wx.showTabBarRedDot({
        index: 3 // 消息Tab的索引
      });
    } else {
      wx.hideTabBarRedDot({
        index: 3
      });
    }
  },

  // 清除消息角标
  clearMessageBadge() {
    this.globalData.pendingNotificationsCount = 0;
    wx.removeTabBarBadge({
      index: 3
    });
  },

  // 加载客服配置（从后端获取）
  loadCustomerServiceConfig() {
    // mock模式下使用默认值
    if (this.globalData.useMockData) {
      return Promise.resolve();
    }
    
    return this.request({ url: '/api/config/customer-service' })
      .then(res => {
        if (res.data && res.data.phone) {
          this.globalData.customerServicePhone = res.data.phone;
        }
      })
      .catch(err => {
        console.warn('[App] 获取客服配置失败，使用默认值:', err.message);
      });
  },

  // 拉取离线通知
  _fetchPendingNotifications() {
    this.request({ url: api.notifications.list() + '?is_read=false' }).then(res => {
      const list = res.data && res.data.list;
      if (!list || list.length === 0) return;

      this.globalData.pendingNotificationsCount = list.length;
      console.log('[Socket] 收到离线通知:', list.length, '条');
      
      // 更新TabBar消息角标
      this.updateMessageBadge();

      this._ackPendingNotifications(list.map(n => n.id));
    }).catch(err => {
      logger.error(logger.Categories.SOCKET, '拉取离线通知失败:', err);
    });
  },

  // 确认离线通知已接收
  _ackPendingNotifications(ids) {
    this.request({
      url: api.notifications.readAll(),
      method: 'POST',
      data: { ids }
    }).catch(err => {
      logger.error(logger.Categories.SOCKET, '确认离线通知失败:', err);
    });
  },

  // 退出登录
  logout() {
    this.globalData.token = null;
    this.globalData.refreshToken = null;
    this.globalData.userInfo = null;
    wx.removeStorageSync('token');
    wx.removeStorageSync('refresh_token');
    wx.removeStorageSync('userInfo');
    this.disconnectSocket();
    wx.reLaunch({ url: '/pages/login/login' });
  },

  // 用 refresh_token 换新 token
  _refreshToken() {
    const that = this;
    return new Promise((resolve, reject) => {
      if (!that.globalData.refreshToken) {
        return reject(new Error('no refresh token'));
      }
      // mock模式下模拟成功
      if (backendConfig.mode === 'mock') {
        resolve(mockUser.token.access_token);
        return;
      }
      wx.request({
        url: that.globalData.apiBaseUrl + '/api/auth/refresh',
        method: 'POST',
        data: { refresh_token: that.globalData.refreshToken },
        header: { 'Content-Type': 'application/json' },
        success(res) {
          if (res.data.code === 0) {
            const { access_token, refresh_token } = res.data.data;
            that.globalData.token = access_token;
            that.globalData.refreshToken = refresh_token;
            wx.setStorageSync('token', access_token);
            wx.setStorageSync('refresh_token', refresh_token);
            resolve(access_token);
          } else {
            reject(new Error('refresh failed'));
          }
        },
        fail(err) { reject(err); }
      });
    });
  },

  // 全局请求封装（支持模拟数据/混合模式）
  request(options) {
    const that = this;
    // 读取模式与端点对齐
    const mode = (backendConfig && backendConfig.mode) || 'mock';
    const realBase = (backendConfig && backendConfig.realBaseUrl) || '';
    const isRealEndpoint = (url) => {
      const endpoints = [
        '/api/c/messages/sessions',
        '/api/c/messages/',  // 匹配 /api/c/messages/:companionId 消息历史
        '/api/user/info',
        '/api/c/monitor/error',
        '/api/c/orders',
        '/api/auth/refresh',
        '/api/c/notifications',  // GET /api/c/notifications?is_read=false
        '/api/c/notifications/',  // POST /api/c/notifications/:id/read 和 PATCH /api/c/notifications/:id/read
        '/api/c/notifications/unread-count',
        '/api/c/notifications/read-all',
        '/api/c/companions',  // GET /api/c/companions 搭子列表
        '/api/c/companions/',  // 匹配 /api/c/companions/:id 搭子详情 和 /api/c/companions/:id/like 心动
      ];
      return endpoints.some(ep => url.startsWith(ep) || url.includes(ep));
    };

    const useReal = (mode === 'real') || (mode === 'mixed' && isRealEndpoint(options.url));
    if (useReal) {
      // 真实请求
      return new Promise((resolve, reject) => {
        wx.request({
          url: (realBase || that.globalData.apiBaseUrl) + options.url,
          method: options.method || 'GET',
          data: options.data || {},
          header: {
            'Content-Type': 'application/json',
            'Authorization': that.globalData.token ? 'Bearer ' + that.globalData.token : ''
          },
          success(res) {
            if (res.data.code === 0) {
              resolve(res.data);
            } else if (res.statusCode === 401 || res.data.code === 401) {
              that._refreshToken().then(() => {
                that.request(options).then(resolve).catch(reject);
              }).catch(() => {
                wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' });
                that.logout();
                reject(res.data);
              });
            } else {
              reject(res.data);
            }
          },
          fail(err) {
            wx.showToast({ title: '网络错误', icon: 'none' });
            reject(err);
          }
        });
      });
    }

    // 否则走模拟数据路径
    
    // 使用模拟请求
    return this._mockRequest(options);
  },

  // 模拟请求（开发阶段使用）
  _mockRequest(options) {
    console.log('[Mock] API请求:', options.url, options.method || 'GET');

    const formatRemainingTime = (ms) => {
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      if (hours > 0) {
        return `${hours}小时${minutes}分钟`;
      } else if (minutes > 0) {
        return `${minutes}分钟${seconds}秒`;
      } else {
        return `${seconds}秒`;
      }
    };
    
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const url = options.url;
        
        // 获取搭子列表
        if (url === '/api/c/companions' || url === '/api/c/companions/list' || url.startsWith('/api/c/companions?') || url.startsWith('/api/c/companions/list?')) {
          resolve({
            code: 0,
            data: {
              list: mockCompanions.companions,
              total: mockCompanions.companions.length,
              has_more: false
            }
          });
          return;
        }
        // 获取会话列表（演示用，页内分页通过 historyPage 实现）
        if (url === '/api/c/messages/sessions' || url.includes('/api/c/messages/sessions')) {
          resolve({
            code: 0,
            data: {
              list: mockConversations,
              total: mockConversations.length,
              has_more: false
            }
          });
          return;
        }
        // 历史消息（聊天历史）- 匹配 /api/c/messages/:companionId
        if (url.match(/\/api\/c\/messages\/[^\/]+$/)) {
          resolve({
            code: 0,
            data: {
              list: [
                {
                  id: 'h1',
                  type: 'receive',
                  senderId: '搭子',
                  content: '历史消息示例 1',
                  time: '09:50',
                  status: 'sent'
                },
                {
                  id: 'h2',
                  type: 'send',
                  senderId: '你',
                  content: '历史消息示例 2',
                  time: '09:52',
                  status: 'sent'
                }
              ],
              total: 2,
              has_more: false
            }
          });
          return;
        }
        
        // 获取搭子详情
        if (url.includes('/api/c/companions/')) {
          const id = url.split('/').pop();
          const companion = mockCompanions.companions.find(c => c.id === id);
          if (companion) {
            resolve({
              code: 0,
              data: {
                ...companion,
                minDuration: 1,
                maxDuration: 8,
                tags: companion.services.map(s => s.name)
              }
            });
          } else {
            resolve({ code: 404, message: '搭子不存在' });
          }
          return;
        }
        
        // 获取订单列表
        if (url === '/api/c/orders' || url.startsWith('/api/c/orders?')) {
          resolve({
            code: 0,
            data: {
              list: mockOrders.orders,
              total: mockOrders.orders.length,
              has_more: false
            }
          });
          return;
        }

        // 获取订单详情 (GET /api/c/orders/:id)
        if (url.match(/\/api\/c\/orders\/[^\/]+$/) && (!options.method || options.method === 'GET')) {
          const id = url.split('/').pop();
          const order = mockOrders.orders.find(o => o.id === id);
          if (order) {
            resolve({
              code: 0,
              data: {
                id: order.id,
                order_no: order.order_no,
                status: order.status,
                order_type: order.order_type || 'normal',
                created_at: new Date(order.created_at).toISOString(),
                service_name: order.service_name,
                duration: order.duration,
                service_start_at: order.service_start_time ? new Date(order.service_start_time).toISOString() : null,
                total_amount: order.total_price,
                user_remark: order.appointment_date + ' ' + order.appointment_time,
                companion: order.companion_id ? {
                  id: order.companion_id,
                  nickname: order.companion_name,
                  avatar: order.companion_avatar
                } : null,
                accepted_at: order.accepted_at ? new Date(order.accepted_at).toISOString() : null,
                payment_records: [
                  {
                    id: 'pay_001',
                    status: order.status === 'pending_payment' ? 'pending' : 'paid',
                    pay_time: order.status !== 'pending_payment' ? new Date(order.created_at + 60000).toISOString() : null,
                    amount: order.total_price
                  }
                ],
                operation_logs: order.accepted_at ? [
                  {
                    action: 'accepted',
                    created_at: order.accepted_at
                  }
                ] : [],
                cancel_reason: order.cancel_reason || '',
                cancelled_at: order.cancelled_at ? new Date(order.cancelled_at).toISOString() : null
              }
            });
          } else {
            resolve({ code: 404, message: '订单不存在' });
          }
          return;
        }

        // 获取支付倒计时 (GET /api/c/orders/:id/pay-countdown)
        if (url.match(/\/api\/c\/orders\/[^\/]+\/pay-countdown$/) && (!options.method || options.method === 'GET')) {
          const id = url.split('/').pop();
          const order = mockOrders.orders.find(o => o.id === id);
          if (order) {
            if (order.status === 'pending_payment') {
              const PAY_COUNTDOWN_SECONDS = 15 * 60;
              const elapsed = Math.floor((Date.now() - order.created_at) / 1000);
              const remaining = Math.max(0, PAY_COUNTDOWN_SECONDS - elapsed);
              resolve({
                code: 0,
                data: { remaining_seconds: remaining }
              });
            } else {
              resolve({ code: 0, data: { remaining_seconds: null } });
            }
          } else {
            resolve({ code: 404, message: '订单不存在' });
          }
          return;
        }

        // 获取抢单倒计时 (GET /api/c/orders/:id/grab-countdown)
        if (url.match(/\/api\/c\/orders\/[^\/]+\/grab-countdown$/) && (!options.method || options.method === 'GET')) {
          const id = url.split('/').pop();
          const order = mockOrders.orders.find(o => o.id === id);
          if (order) {
            if (order.status === 'waiting_grab') {
              const GRAB_COUNTDOWN_SECONDS = 30 * 60;
              const elapsed = Math.floor((Date.now() - order.created_at) / 1000);
              const remaining = Math.max(0, GRAB_COUNTDOWN_SECONDS - elapsed);
              resolve({
                code: 0,
                data: { remaining_seconds: remaining }
              });
            } else {
              resolve({ code: 0, data: { remaining_seconds: null } });
            }
          } else {
            resolve({ code: 404, message: '订单不存在' });
          }
          return;
        }

        // 获取服务状态 (GET /api/c/orders/:id/service-status)
        if (url.match(/\/api\/c\/orders\/[^\/]+\/service-status$/) && (!options.method || options.method === 'GET')) {
          const id = url.split('/').pop();
          const order = mockOrders.orders.find(o => o.id === id);
          if (order) {
            if (order.status === 'serving') {
              const SERVICE_DURATION_MS = (order.duration || 2) * 60 * 60 * 1000;
              const elapsed = order.service_start_time ? Date.now() - order.service_start_time : 0;
              const remaining = Math.max(0, SERVICE_DURATION_MS - elapsed);
              const remainingSeconds = Math.floor(remaining / 1000);
              const progressPercent = Math.min(100, Math.floor((elapsed / SERVICE_DURATION_MS) * 100));
              resolve({
                code: 0,
                data: {
                  remaining_seconds: remainingSeconds,
                  progress_percent: progressPercent,
                  remaining_text: formatRemainingTime(remaining),
                  show_renewal_hint: remainingSeconds < 15 * 60,
                  can_cancel_in_service: elapsed < 15 * 60 * 1000,
                  elapsed_minutes: Math.floor(elapsed / 60000),
                  is_completed: false
                }
              });
            } else {
              resolve({ code: 0, data: null });
            }
          } else {
            resolve({ code: 404, message: '订单不存在' });
          }
          return;
        }

        // 获取取消是否免费 (GET /api/c/orders/:id/can-cancel-free)
        if (url.match(/\/api\/c\/orders\/[^\/]+\/can-cancel-free$/) && (!options.method || options.method === 'GET')) {
          const id = url.split('/').pop();
          const order = mockOrders.orders.find(o => o.id === id);
          if (order) {
            if (order.status === 'accepted' && order.accepted_at) {
              const elapsed = Date.now() - new Date(order.accepted_at).getTime();
              const canCancelFree = elapsed < 2 * 60 * 1000;
              resolve({ code: 0, data: { can_cancel_free: canCancelFree } });
            } else {
              resolve({ code: 0, data: { can_cancel_free: false } });
            }
          } else {
            resolve({ code: 404, message: '订单不存在' });
          }
          return;
        }

        // 获取用户信息
        if (url === '/api/user/info' || url.includes('/api/user/info')) {
          resolve({
            code: 0,
            data: mockUser.currentUser
          });
          return;
        }
        
        // 心动/取消心动
        if (url.match(/\/api\/c\/companions\/[^\/]+\/like/)) {
          const isLike = options.method === 'POST';
          resolve({
            code: 0,
            data: {
              liked: isLike,
              message: isLike ? '心动成功' : '已取消心动'
            }
          });
          return;
        }

        // 获取通知列表 (GET /api/c/notifications?is_read=false)
        if (url.startsWith('/api/c/notifications') && !url.includes('/unread-count') && !url.includes('/read-all')) {
          resolve({
            code: 0,
            data: {
              list: [],
              total: 0,
              has_more: false
            }
          });
          return;
        }

        // 标记通知为已读 (POST /api/c/notifications/:id/read)
        if (url.match(/\/api\/c\/notifications\/[^\/]+\/read$/)) {
          resolve({
            code: 0,
            data: { success: true }
          });
          return;
        }

        // 获取未读通知数 (GET /api/c/notifications/unread-count)
        if (url === '/api/c/notifications/unread-count' || url.includes('/api/c/notifications/unread-count')) {
          resolve({
            code: 0,
            data: { count: 0 }
          });
          return;
        }

        // 一键已读所有通知 (POST /api/c/notifications/read-all)
        if (url === '/api/c/notifications/read-all' || url.includes('/api/c/notifications/read-all')) {
          resolve({
            code: 0,
            data: { success: true }
          });
          return;
        }

        // 取消订单预览 (GET /api/c/orders/:id/cancel-preview)
        if (url.match(/\/api\/c\/orders\/[^\/]+\/cancel-preview$/)) {
          resolve({
            code: 0,
            data: {
              can_cancel: true,
              refund_amount: 5000,  // 模拟退款50元
              cancel_reason: ''
            }
          });
          return;
        }

        // 取消订单 (POST /api/c/orders/:id/cancel)
        if (url.match(/\/api\/c\/orders\/[^\/]+\/cancel$/) && options.method === 'POST') {
          resolve({
            code: 0,
            data: { success: true, message: '订单已取消' }
          });
          return;
        }

        // 删除订单 (DELETE /api/c/orders/:id)
        if (url.match(/\/api\/c\/orders\/[^\/]+$/) && options.method === 'DELETE') {
          resolve({
            code: 0,
            data: { success: true, message: '订单已删除' }
          });
          return;
        }

        // 完成订单 (POST /api/c/orders/:id/complete)
        if (url.match(/\/api\/c\/orders\/[^\/]+\/complete$/) && options.method === 'POST') {
          resolve({
            code: 0,
            data: { success: true, message: '订单已完成' }
          });
          return;
        }

        // 获取订单计时器 (GET /api/c/orders/:id/timer)
        if (url.match(/\/api\/c\/orders\/[^\/]+\/timer$/)) {
          resolve({
            code: 0,
            data: { remaining_seconds: 3600 }  // 模拟剩余1小时
          });
          return;
        }

        // 埋点上报 (POST /api/c/track)
        if (url === '/api/c/track' && options.method === 'POST') {
          resolve({
            code: 0,
            data: { count: (options.data && options.data.events) ? options.data.events.length : 0 }
          });
          return;
        }

        // 默认返回空数据
        resolve({
          code: 0,
          data: {},
          message: '模拟数据：该接口尚未配置'
        });
        
      }, 300); // 模拟网络延迟
    });
  }
});
