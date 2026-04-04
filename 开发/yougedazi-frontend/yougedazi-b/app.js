// app.js - 有个搭子 B端（安全强化版）
const mock = require('./utils/mock');
const { ORDER_TYPE } = require('./utils/constants');

// 简单事件发射器（用于全局事件通信）
class EventEmitter {
  constructor() {
    this._events = {};
  }
  on(event, callback) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(callback);
  }
  off(event, callback) {
    if (!this._events[event]) return;
    this._events[event] = this._events[event].filter(cb => cb !== callback);
  }
  emit(event, data) {
    if (!this._events[event]) return;
    this._events[event].forEach(callback => callback(data));
  }
}
// 常量定义
const CONSTANTS = {
  // API 路由
  API_USER_INFO: '/api/user/info',
  API_AUTH_REFRESH: '/api/auth/refresh',
  API_NOTIFICATIONS: '/api/b/notifications/unread-count',

  // HTTP 状态码
  HTTP_OK: 200,
  HTTP_UNAUTHORIZED: 401,
  HTTP_SERVER_ERROR: 500,

  // Socket 事件
  SOCKET_EVENT_ORDER_NEW: 'order:new',
  SOCKET_EVENT_ORDER_REWARD: 'order:new_reward',
  SOCKET_EVENT_ORDER_STATUS: 'order:status_changed',
  SOCKET_EVENT_MESSAGE: 'message:new',
  SOCKET_EVENT_NOTIFICATION: 'notification:new',

  // 路由匹配
  ROUTE_WORKBENCH: 'workbench',
  ROUTE_ORDER_DETAIL: 'b-order-detail',

  // Token 刷新
  MAX_RETRY_COUNT: 1,  // 仅重试一次（避免无限递归）
  TOKEN_REFRESH_TIMEOUT: 5000,  // 5秒超时

  // 数据限制
  MAX_PENDING_ORDERS: 100,
  MAX_PENDING_UPDATES: 100,
};

App({
  // 全局事件发射器（供页面间通信）
  globalEvent: new EventEmitter(),
  globalData: {
    userInfo: null,
    companionInfo: null,
    systemInfo: null,
    location: null,
    isOnline: false,
    token: null,
    refreshToken: null,
    apiBaseUrl: 'https://api.ppmate.com',
    // apiBaseUrl: 'http://localhost:3000', // 本地调试时切换
    pushServerUrl: 'wss://api.ppmate.com',  // 推送服务器地址（生产）/ 本地调试改为 ws://localhost:3002
    isMock: true,   // 开发模式，使用模拟数据

    // Socket.IO 实例（后端接入后使用）
    socket: null,
    // 离线期间积压的通知数（用于消息角标）
    pendingNotificationsCount: 0,
    // Socket.IO 推送的待处理订单状态更新 { [orderId]: { status, message, updatedAt } }
    pendingOrderUpdates: {},
    // Socket.IO 推送的待处理新订单列表（供工作台页面消费）
    pendingNewOrders: [],

    // Token 刷新相关（防止并发刷新）
    isRefreshing: false,        // 刷新状态标记
    tokenRefreshPromise: null,  // 缓存当前的刷新 Promise
  },

  onLaunch() {
    // 获取系统信息
    wx.getSystemInfo({
      success: (res) => {
        this.globalData.systemInfo = res;
      }
    });

    // 检查登录状态（带token有效性校验）
    this.validateAndRestoreSession();

    // 已登录时建立 Socket 连接
    this.initSocket();
  },

  /**
   * 消费已处理的新订单（页面显示弹窗后调用）
   * @param {string} orderId 订单 ID
   */
  consumeNewOrder(orderId) {
    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      console.error('[App] consumeNewOrder: invalid orderId', orderId);
      return;
    }
    const orders = this.globalData.pendingNewOrders || [];
    this.globalData.pendingNewOrders = orders.filter(o => o.orderId !== orderId);
  },

  /**
   * 验证并恢复会话 - 乐观方式，第一个请求时检查 token 有效性
   * 避免启动时多余的 API 调用
   * 安全策略：
   * 1. 从存储读取 token 到内存
   * 2. 异步验证 token（不阻塞启动）
   */
  validateAndRestoreSession() {
    const token = wx.getStorageSync('token');
    const refreshToken = wx.getStorageSync('refresh_token');

    if (!token || !refreshToken) {
      return;
    }

    // 恢复 token 到内存
    this.globalData.token = token;
    this.globalData.refreshToken = refreshToken;
    this.checkLoginStatus();

    // 后台验证 token 有效性（不阻塞启动）
    // 如果失败，下一个 API 请求会触发刷新
    this._validateToken().catch(() => {
      // token 无效，等待下一次 API 调用时自动刷新
    });
  },

  /**
   * 验证 token 有效性（带 5 秒超时）
   * @returns {Promise<void>} 成功时 resolve，失败时 reject
   */
  _validateToken() {
    return new Promise((resolve, reject) => {
      if (!this.globalData.token) {
        reject(new Error('No token'));
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error('Token validation timeout'));
      }, CONSTANTS.TOKEN_REFRESH_TIMEOUT);

      wx.request({
        url: this.globalData.apiBaseUrl + CONSTANTS.API_USER_INFO,
        method: 'GET',
        header: {
          'Authorization': 'Bearer ' + this.globalData.token
        },
        success: (res) => {
          clearTimeout(timer);
          if (res.statusCode === CONSTANTS.HTTP_OK && res.data.code === 0) {
            // Token 有效，更新用户信息
            this.globalData.userInfo = res.data.data;
            resolve();
          } else if (res.statusCode === CONSTANTS.HTTP_UNAUTHORIZED || res.data.code === CONSTANTS.HTTP_UNAUTHORIZED) {
            // Token 已过期
            reject(new Error('Token expired'));
          } else {
            // 其他错误，也 reject（可能是网络或服务器问题）
            reject(new Error(`Validate failed: ${res.statusCode}`));
          }
        },
        fail: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  },

  /**
   * 检查并恢复本地存储的登录状态
   * @returns {Object} { success: boolean, hasToken: boolean, hasUserInfo: boolean }
   */
  checkLoginStatus() {
    try {
      const token = wx.getStorageSync('token');
      const refreshToken = wx.getStorageSync('refresh_token');
      const userInfo = wx.getStorageSync('userInfo');

      const result = {
        success: true,
        hasToken: !!token,
        hasUserInfo: !!userInfo
      };

      if (token) {
        this.globalData.token = token;
        this.globalData.refreshToken = refreshToken || null;
      }

      if (userInfo) {
        this.globalData.userInfo = userInfo;
      }

      return result;
    } catch (err) {
      console.error('[Auth] checkLoginStatus 失败:', err);
      return {
        success: false,
        hasToken: false,
        hasUserInfo: false
      };
    }
  },

  // 获取当前位置
  getLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.globalData.location = {
            latitude: res.latitude,
            longitude: res.longitude
          };
          resolve(res);
        },
        fail: reject
      });
    });
  },

  /**
   * 更新在线状态
   * @param {boolean} isOnline 是否在线
   */
  updateOnlineStatus(isOnline) {
    if (typeof isOnline !== 'boolean') {
      console.error('[App] updateOnlineStatus: isOnline must be boolean', isOnline);
      return;
    }
    this.globalData.isOnline = isOnline;
    // TODO: 发送状态到服务器的 API 调用
  },

  // ============================================
  // Socket.IO 连接管理
  // ============================================

  /**
   * 退出登录（清理所有本地状态和 Socket 连接）
   * 清空内存、本地存储，断开 Socket，跳转到登录页
   */
  logout() {
    this.globalData.token = null;
    this.globalData.refreshToken = null;
    this.globalData.userInfo = null;
    this.globalData.isRefreshing = false;
    this.globalData.tokenRefreshPromise = null;
    wx.removeStorageSync('token');
    wx.removeStorageSync('refresh_token');
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('auditStatus');
    this.disconnectSocket();
    wx.reLaunch({ url: '/pages/login/login' });
  },

  /**
   * 初始化 Socket 连接
   * 调用时机：登录成功后 / onLaunch 发现已有 token 时
   * 职责：建立 WebSocket 连接，监听订单、消息、通知等推送事件
   */
  initSocket() {
    if (!this.globalData.token) return;
    if (this.globalData.socket) return; // 已连接，防止重复

    const io     = require('./utils/weapp-socket.io');
    const socket = io(this.globalData.pushServerUrl, {
      auth: { token: this.globalData.token }
    });

    // 连接成功：拉取离线通知
    socket.on('connect', () => {
      this._fetchPendingNotifications();
    });

    // 重连成功：拉取离线通知（通过去重机制避免重复）
    socket.on('reconnect', () => {
      this._fetchPendingNotifications();
    });

    // 指定单新订单通知
    socket.on(CONSTANTS.SOCKET_EVENT_ORDER_NEW, (orderInfo) => {
      this._handleNewOrder(orderInfo, 'direct');
    });

    // 悬赏单广播
    socket.on(CONSTANTS.SOCKET_EVENT_ORDER_REWARD, (orderInfo) => {
      this._handleNewOrder(orderInfo, 'reward');
    });

    // 订单状态变更（C端取消、系统超时完成等）
    socket.on(CONSTANTS.SOCKET_EVENT_ORDER_STATUS, (payload) => {
      const { orderId, toStatus, message } = payload;

      // 防止无界增长：限制待处理更新数量
      const updates = this.globalData.pendingOrderUpdates;
      const updateKeys = Object.keys(updates);
      if (updateKeys.length >= CONSTANTS.MAX_PENDING_UPDATES) {
        // 删除最旧的更新
        const oldest = updateKeys.reduce((oldest, key) =>
          !oldest || updates[key].updatedAt < updates[oldest].updatedAt ? key : oldest
        );
        delete updates[oldest];
      }

      // 存入待处理字典，供 b-order-detail onShow 消费
      updates[orderId] = {
        status:    toStatus,
        message:   message || '',
        updatedAt: Date.now()
      };

      // 如果订单详情页正在展示，直接刷新
      const pages       = getCurrentPages();
      const currentPage = pages.length > 0 ? pages[pages.length - 1] : null;
      if (currentPage && currentPage.route &&
          currentPage.route.includes(CONSTANTS.ROUTE_ORDER_DETAIL)) {
        if (typeof currentPage.loadOrderDetail === 'function') {
          try {
            currentPage.loadOrderDetail(orderId);
          } catch (err) {
            // 页面方法调用失败，静默处理
          }
        }
      }

      if (toStatus === 'cancelled') {
        wx.showToast({ title: '订单已被用户取消', icon: 'none', duration: 3000 });
      }
    });

    // 新消息：更新通知角标
    socket.on(CONSTANTS.SOCKET_EVENT_MESSAGE, (msg) => {
      this.globalData.pendingNotificationsCount++;
    });

    // 系统/订单通知：更新角标
    socket.on(CONSTANTS.SOCKET_EVENT_NOTIFICATION, (notification) => {
      this.globalData.pendingNotificationsCount++;
    });

    socket.on('connect_error', (err) => {
      // Socket 连接错误，静默处理（通常会自动重连）
    });

    socket.on('disconnect', (reason) => {
      // Socket 连接断开，等待自动重连
    });

    this.globalData.socket = socket;
  },

  /**
   * 断开 Socket 连接并清理所有事件监听器
   * 防止内存泄漏，通常在注销时调用
   */
  disconnectSocket() {
    if (this.globalData.socket) {
      // 清理所有事件监听器，防止内存泄漏
      this.globalData.socket.off(CONSTANTS.SOCKET_EVENT_ORDER_NEW);
      this.globalData.socket.off(CONSTANTS.SOCKET_EVENT_ORDER_REWARD);
      this.globalData.socket.off(CONSTANTS.SOCKET_EVENT_ORDER_STATUS);
      this.globalData.socket.off(CONSTANTS.SOCKET_EVENT_MESSAGE);
      this.globalData.socket.off(CONSTANTS.SOCKET_EVENT_NOTIFICATION);
      this.globalData.socket.off('connect');
      this.globalData.socket.off('reconnect');
      this.globalData.socket.off('connect_error');
      this.globalData.socket.off('disconnect');

      this.globalData.socket.disconnect();
      this.globalData.socket = null;
    }
  },

  /**
   * 刷新 Token（Token 过期时调用）
   * @returns {Promise<void>}
   */
  _refreshToken() {
    const that = this;
    return new Promise((resolve, reject) => {
      const refreshToken = wx.getStorageSync('refresh_token');
      if (!refreshToken) {
        reject(new Error('无refreshToken'));
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error('Token刷新超时'));
      }, CONSTANTS.TOKEN_REFRESH_TIMEOUT);

      wx.request({
        url: that.globalData.apiBaseUrl + CONSTANTS.API_AUTH_REFRESH,
        method: 'POST',
        data: { refresh_token: refreshToken },
        header: { 'Content-Type': 'application/json' },
        success(res) {
          clearTimeout(timer);
          if (res.statusCode === CONSTANTS.HTTP_OK && res.data.code === 0) {
            const { token, refresh_token } = res.data.data || {};
            if (token && refresh_token) {
              wx.setStorageSync('token', token);
              wx.setStorageSync('refresh_token', refresh_token);
              that.globalData.token = token;
              that.globalData.refreshToken = refresh_token;
              resolve();
            } else {
              reject(new Error('刷新响应数据不完整'));
            }
          } else {
            reject(new Error('刷新失败:' + (res.data.message || '未知错误')));
          }
        },
        fail(err) {
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  },

  /**
   * 拉取离线通知 - 带去重防止重复调用
   * 连接/重连时调用，仅在 5 秒内拉取一次
   */
  _fetchPendingNotifications() {
    const now = Date.now();
    const lastFetch = this.globalData._lastNotificationFetchTime || 0;
    const FETCH_INTERVAL = 5000; // 5 秒内最多拉取一次

    // 防止频繁调用（Socket 重连时可能多次触发）
    if (now - lastFetch < FETCH_INTERVAL) {
      return;
    }

    this.globalData._lastNotificationFetchTime = now;

    this.request({ url: CONSTANTS.API_NOTIFICATIONS })
      .then((res) => {
        if (res && res.data && typeof res.data.count === 'number') {
          // 仅在数值变化时更新，避免不必要的通知
          if (this.globalData.pendingNotificationsCount !== res.data.count) {
            this.globalData.pendingNotificationsCount = res.data.count;
          }
        }
      })
      .catch((err) => {
        // 静默失败，不影响其他逻辑
      });
  },

  /**
   * 处理新订单推送（Socket order:new / order:new_reward 事件）
   * 将订单存入待处理列表，供工作台页面消费；如果工作台当前正显示，直接通知它
   * @param {Object} orderInfo 订单信息对象
   * @param {string} type 订单类型（'direct' 或 'reward'）
   */
  _handleNewOrder(orderInfo, type) {
    if (!orderInfo || !orderInfo.orderId) {
      wx.reportEvent?.('error', { msg: 'invalid_order_info' });
      return;
    }

    const validTypes = [ORDER_TYPE.DIRECT, ORDER_TYPE.REWARD];
    if (!type || !validTypes.includes(type)) {
      wx.reportEvent?.('error', { msg: 'invalid_order_type', type });
      return;
    }

    // 存入待处理列表（限制最多100条，防内存泄漏）
    let pendingNewOrders = this.globalData.pendingNewOrders || [];

    if (pendingNewOrders.length >= CONSTANTS.MAX_PENDING_ORDERS) {
      pendingNewOrders.shift();  // 移除最早的订单
    }

    pendingNewOrders.push({
      orderId: orderInfo.orderId,
      orderType: type,
      createdAt: orderInfo.createdAt,
      totalAmount: orderInfo.totalAmount
    });
    this.globalData.pendingNewOrders = pendingNewOrders;

    // 如果工作台页面正在显示，直接通知它
    const pages = getCurrentPages();
    const workbenchPage = pages.find((p) => {
      return p && p.route && p.route.includes(CONSTANTS.ROUTE_WORKBENCH);
    });

    if (workbenchPage && typeof workbenchPage.onNewOrderPush === 'function') {
      try {
        workbenchPage.onNewOrderPush(orderInfo, type);
      } catch (err) {
        wx.reportEvent?.('error', { msg: 'workbench_callback_error', error: err.message });
      }
    }
  },

  /**
   * 全局请求封装 - 统一处理 URL、Header、Token 刷新
   * @param {Object} options 请求配置
   * @param {string} options.url API 端点（如 '/api/user/info'）
   * @param {string} [options.method='GET'] HTTP 方法
   * @param {Object} [options.data={}] 请求体
   * @param {number} [_retryCount=0] 内部重试计数（仅用于递归调用）
   * @returns {Promise<Object>} API 响应
   */
  request(options, _retryCount = 0) {
    const that = this;
    const MAX_RETRIES = 1; // 仅允许单次重试，防止无限递归

    // 参数验证
    if (!options || !options.url) {
      return Promise.reject(new Error('Request URL is required'));
    }

    return new Promise((resolve, reject) => {
      wx.request({
        url: that.globalData.apiBaseUrl + options.url,
        method: options.method || 'GET',
        data: options.data || {},
        header: {
          'Content-Type': 'application/json',
          'Authorization': that.globalData.token ? 'Bearer ' + that.globalData.token : ''
        },
        success(res) {
          if (res.data.code === 0) {
            resolve(res.data);
          } else if ((res.statusCode === CONSTANTS.HTTP_UNAUTHORIZED || res.data.code === CONSTANTS.HTTP_UNAUTHORIZED) &&
                     _retryCount < MAX_RETRIES) {
            // Token 过期，尝试刷新
            if (that.globalData.isRefreshing) {
              // 已在刷新中，等待刷新完成后重试
              that.globalData.tokenRefreshPromise
                .then(() => that.request(options, _retryCount + 1))
                .then(resolve)
                .catch(reject);
            } else {
              // 标记开始刷新，防止并发
              that.globalData.isRefreshing = true;
              // 存储 Promise 到 globalData，供并发请求等待
              const refreshPromise = that._refreshToken()
                .then(() => {
                  // 刷新成功后重试请求
                  return that.request(options, _retryCount + 1);
                })
                .catch(() => {
                  that.logout();
                  throw new Error('Token refresh failed');
                })
                .finally(() => {
                  // 无论刷新成功失败，都清理状态和缓存
                  that.globalData.isRefreshing = false;
                  that.globalData.tokenRefreshPromise = null;
                });

              that.globalData.tokenRefreshPromise = refreshPromise;

              // 使用本地 refreshPromise 变量，正确传递响应给调用者
              refreshPromise
                .then(resolve)
                .catch(reject);
            }
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
});
