/**
 * 埋点/数据分析模块
 * 用于追踪用户行为、性能指标和业务事件
 */

const api = require('./api');

// 埋点配置
const TRACKING_CONFIG = {
  // 是否启用埋点
  enabled: true,
  // 采样率 (0-1)
  sampleRate: 1.0,
  // 上报地址
  endpoint: api.monitor.track(),
  // 批量上报数量阈值
  batchSize: 10,
  // 上报间隔（毫秒）
  flushInterval: 5000
};

// 埋点队列
let trackQueue = [];
let flushTimer = null;

/**
 * 初始化埋点系统
 */
function init() {
  if (flushTimer) {
    clearInterval(flushTimer);
  }
  flushTimer = setInterval(flush, TRACKING_CONFIG.flushInterval);
}

/**
 * 上报埋点数据
 * @param {string} event - 事件名称
 * @param {object} params - 事件参数
 * @param {string} category - 事件类别
 */
function track(event, params = {}, category = 'behavior') {
  if (!TRACKING_CONFIG.enabled || Math.random() > TRACKING_CONFIG.sampleRate) {
    return;
  }

  const app = getApp();
  const globalData = (app && app.globalData) || {};
  const userInfo = globalData.userInfo || {};
  
  const trackData = {
    event,
    category,
    params,
    timestamp: Date.now(),
    userId: userInfo.id || 'anonymous',
    sessionId: getSessionId(),
    page: getCurrentPage(),
    device: globalData.deviceInfo || {}
  };

  trackQueue.push(trackData);

  // 达到批量阈值立即上报
  if (trackQueue.length >= TRACKING_CONFIG.batchSize) {
    flush();
  }
}

/**
 * 页面浏览埋点
 * @param {string} pageName - 页面名称
 * @param {object} params - 页面参数
 */
function trackPageView(pageName, params = {}) {
  track('page_view', { page: pageName, ...params }, 'page');
}

/**
 * 按钮点击埋点
 * @param {string} buttonName - 按钮名称
 * @param {object} params - 点击参数
 */
function trackButtonClick(buttonName, params = {}) {
  track('button_click', { button: buttonName, ...params }, 'interaction');
}

/**
 * 订单事件埋点
 * @param {string} action - 订单动作
 * @param {object} orderData - 订单数据
 */
function trackOrder(action, orderData = {}) {
  track('order_' + action, orderData, 'order');
}

/**
 * 错误埋点
 * @param {string} errorType - 错误类型
 * @param {object} errorInfo - 错误信息
 */
function trackError(errorType, errorInfo = {}) {
  track('error', { type: errorType, ...errorInfo }, 'error');
}

/**
 * 性能埋点
 * @param {string} metric - 性能指标名称
 * @param {number} value - 性能值（毫秒）
 * @param {object} params - 附加参数
 */
function trackPerformance(metric, value, params = {}) {
  track('performance', { metric, value, ...params }, 'performance');
}

/**
 * 立即上报所有埋点数据
 */
function flush() {
  if (trackQueue.length === 0) return;

  const data = [...trackQueue];
  trackQueue = [];

  const app = getApp();
  if (!app || typeof app.request !== 'function') {
    // App 尚未初始化完成，数据回滚等待下次上报
    trackQueue = [...data, ...trackQueue];
    return;
  }
  
  app.request({
    url: TRACKING_CONFIG.endpoint,
    method: 'POST',
    data: { events: data }
  }).catch(err => {
    // 上报失败，数据回滚
    trackQueue = [...data, ...trackQueue];
    const logger = require('./logger');
    logger.error(logger.Categories.SYSTEM, '埋点上报失败', err);
  });
}

/**
 * 获取当前会话ID
 */
function getSessionId() {
  let sessionId = wx.getStorageSync('tracking_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    wx.setStorageSync('tracking_session_id', sessionId);
  }
  return sessionId;
}

/**
 * 获取当前页面路径
 */
function getCurrentPage() {
  const pages = getCurrentPages();
  if (pages.length > 0) {
    const page = pages[pages.length - 1];
    return page.route || page.__route__ || 'unknown';
  }
  return 'unknown';
}

/**
 * 在页面卸载时上报剩余数据
 */
function onPageUnload() {
  flush();
}

module.exports = {
  init,
  track,
  trackPageView,
  trackButtonClick,
  trackOrder,
  trackError,
  trackPerformance,
  flush,
  onPageUnload,
  // 预设的事件名称常量
  Events: {
    // 页面事件
    PAGE_VIEW: 'page_view',
    PAGE_STAY: 'page_stay',
    
    // 交互事件
    BUTTON_CLICK: 'button_click',
    FORM_SUBMIT: 'form_submit',
    SEARCH: 'search',
    
    // 订单事件
    ORDER_CREATE: 'order_create',
    ORDER_PAY: 'order_pay',
    ORDER_CANCEL: 'order_cancel',
    ORDER_COMPLETE: 'order_complete',
    
    // 用户事件
    LOGIN: 'login',
    REGISTER: 'register',
    SHARE: 'share',
    
    // 错误事件
    ERROR: 'error',
    API_ERROR: 'api_error',
    
    // 性能事件
    PAGE_LOAD_TIME: 'page_load_time',
    API_RESPONSE_TIME: 'api_response_time'
  }
};