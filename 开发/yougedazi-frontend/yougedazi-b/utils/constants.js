/**
 * 有个搭子 全局常量定义
 * 用于统一C端、B端和后台的订单状态、保证金档位等常量
 * 修改此文件后需要同步到其他端
 */

// ==================== 错误码常量 ====================
const ERROR_CODE = {
  // 订单已被抢完
  ALREADY_GRABBED: 1001
};

// ==================== 订单状态常量 ====================
// 注意：所有端必须使用这些常量，禁止直接使用字符串
const ORDER_STATUS = {
  // 待支付 - 用户下单后未支付
  PENDING_PAYMENT: 'pending_payment',

  // 待接单 - 已支付，等待搭子接单
  PENDING: 'pending_accept',

  // 已接单 - 搭子已接单，准备前往
  ACCEPTED: 'accepted',

  // 服务中 - 搭子已开始服务
  SERVING: 'serving',

  // 已完成 - 订单已完成
  COMPLETED: 'completed',

  // 已取消 - 订单已取消
  CANCELLED: 'cancelled',

  // 等待抢单 - 悬赏订单特有
  WAITING_GRAB: 'waiting_grab',

  // 搭子已出发 - 已接单后出发
  DEPARTED: 'departed'
};

// 订单状态显示文本
const ORDER_STATUS_TEXT = {
  [ORDER_STATUS.PENDING_PAYMENT]: '待支付',
  [ORDER_STATUS.PENDING]: '待接单',
  [ORDER_STATUS.ACCEPTED]: '已接单',
  [ORDER_STATUS.SERVING]: '服务中',
  [ORDER_STATUS.COMPLETED]: '已完成',
  [ORDER_STATUS.CANCELLED]: '已取消',
  [ORDER_STATUS.WAITING_GRAB]: '等待抢单',
  [ORDER_STATUS.DEPARTED]: '搭子已出发'
};

// 订单状态对应的颜色
const ORDER_STATUS_COLOR = {
  [ORDER_STATUS.PENDING_PAYMENT]: 'warning',
  [ORDER_STATUS.PENDING]: 'warning',
  [ORDER_STATUS.ACCEPTED]: 'primary',
  [ORDER_STATUS.SERVING]: 'success',
  [ORDER_STATUS.COMPLETED]: 'info',
  [ORDER_STATUS.CANCELLED]: 'danger',
  [ORDER_STATUS.WAITING_GRAB]: 'warning',
  [ORDER_STATUS.DEPARTED]: 'info'
};

// ==================== 订单类型常量 ====================
const ORDER_TYPE = {
  // 直接下单
  DIRECT: 'direct',

  // 悬赏任务
  REWARD: 'reward'
};

// ==================== 保证金档位常量 ====================
const DEPOSIT_LEVEL = {
  // 新手期
  ROOKIE: 'rookie',

  // 成长期
  GROWTH: 'growth',

  // 成熟期
  MATURE: 'mature'
};

// 保证金档位显示文本
const DEPOSIT_LEVEL_TEXT = {
  [DEPOSIT_LEVEL.ROOKIE]: '新手期',
  [DEPOSIT_LEVEL.GROWTH]: '成长期',
  [DEPOSIT_LEVEL.MATURE]: '成熟期'
};

// 默认保证金配置
// 注意：后台修改后应同步到此处
const DEFAULT_DEPOSIT_CONFIG = {
  // 新手期最大订单数（0-rookieMax单免保证金）
  rookieMax: 1,

  // 成长期最大订单数
  growthMax: 10,

  // 成长期需缴纳金额
  growthAmount: 99,

  // 成熟期累计需缴纳金额
  matureAmount: 500
};

// ==================== 取消订单规则常量 ====================
const CANCEL_RULE = {
  // 2分钟（毫秒）
  TWO_MINUTES: 2 * 60 * 1000,

  // 15分钟（毫秒）
  FIFTEEN_MINUTES: 15 * 60 * 1000,

  // 24小时（毫秒）
  TWENTY_FOUR_HOURS: 24 * 60 * 60 * 1000,

  // 30分钟（毫秒）- 支付超时和悬赏超时
  THIRTY_MINUTES: 30 * 60 * 1000,

  // 扣除的打车费
  CANCEL_FEE: 50
};

// ==================== 计时器相关常量 ====================
const TIMER = {
  // 支付倒计时（15分钟）
  PAY_COUNTDOWN: 15 * 60,

  // 抢单倒计时（30分钟）
  GRAB_COUNTDOWN: 30 * 60,

  // 接单倒计时（30分钟）
  ACCEPT_COUNTDOWN: 30 * 60
};

// ==================== 腾讯位置服务配置 ====================
// Key已迁移到后端，通过 /api/config/map-key 接口获取
// 前端不再直接使用Key，所有地图API通过后端代理

// ==================== LBS定位常量 ====================
const LBS = {
  // 到达阈值（米）
  ARRIVAL_THRESHOLD: 100,

  // 位置上报间隔（毫秒）- 改为5秒上报后端
  REPORT_INTERVAL: 5000,

  // 服务中位置上报间隔（毫秒）
  SERVING_REPORT_INTERVAL: 60000
};

// ==================== 验证相关常量 ====================
const VERIFY = {
  // 人脸识别有效期（毫秒）
  FACE_VERIFY_VALID: 15 * 60 * 1000
};

// ==================== 消息相关常量 ====================
const MESSAGE_TYPE = {
  TEXT: 'text',
  IMAGE: 'image',
  LOCATION: 'location',
  SYSTEM: 'system'
};

const MESSAGE_DIRECTION = {
  SEND: 'send',
  RECEIVE: 'receive'
};

const MESSAGE_STATUS = {
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed'
};

// ==================== 常用工具函数 ====================

/**
 * 获取订单状态显示文本
 * @param {string} status - 订单状态码
 * @returns {string} 显示文本
 */
function getOrderStatusText(status) {
  return ORDER_STATUS_TEXT[status] || status;
}

/**
 * 获取订单状态颜色
 * @param {string} status - 订单状态码
 * @returns {string} 颜色类型
 */
function getOrderStatusColor(status) {
  return ORDER_STATUS_COLOR[status] || 'info';
}

/**
 * 检查订单是否可以取消
 * @param {string} status - 订单状态
 * @param {number} serviceDuration - 服务时长（毫秒）
 * @returns {boolean} 是否可以取消
 */
function canCancelOrder(status, serviceDuration = 0) {
  const CANCELABLE_STATUSES = [
    ORDER_STATUS.PENDING_PAYMENT,
    ORDER_STATUS.PENDING,
    ORDER_STATUS.ACCEPTED,
    ORDER_STATUS.SERVING
  ];

  if (!CANCELABLE_STATUSES.includes(status)) {
    return false;
  }

  // 服务中超过15分钟不能取消
  if (status === ORDER_STATUS.SERVING && serviceDuration > CANCEL_RULE.FIFTEEN_MINUTES) {
    return false;
  }

  return true;
}

/**
 * 检查保证金档位
 * @param {number} totalOrders - 历史总订单数
 * @param {number} depositedAmount - 已缴纳金额
 * @param {Object} config - 保证金配置
 * @returns {Object} 档位信息
 */
function checkDepositLevel(totalOrders, depositedAmount, config = DEFAULT_DEPOSIT_CONFIG) {
  const { rookieMax, growthMax, growthAmount, matureAmount } = config;

  if (totalOrders <= rookieMax) {
    return {
      stage: DEPOSIT_LEVEL.ROOKIE,
      stageText: DEPOSIT_LEVEL_TEXT[DEPOSIT_LEVEL.ROOKIE],
      needDeposit: false,
      needAmount: 0,
      isFull: true
    };
  } else if (totalOrders <= growthMax) {
    const isFull = depositedAmount >= growthAmount;
    return {
      stage: DEPOSIT_LEVEL.GROWTH,
      stageText: DEPOSIT_LEVEL_TEXT[DEPOSIT_LEVEL.GROWTH],
      needDeposit: !isFull,
      needAmount: isFull ? 0 : growthAmount - depositedAmount,
      isFull
    };
  } else {
    const isFull = depositedAmount >= matureAmount;
    return {
      stage: DEPOSIT_LEVEL.MATURE,
      stageText: DEPOSIT_LEVEL_TEXT[DEPOSIT_LEVEL.MATURE],
      needDeposit: !isFull,
      needAmount: isFull ? 0 : matureAmount - depositedAmount,
      isFull
    };
  }
}

module.exports = {
  ERROR_CODE,
  ORDER_STATUS,
  ORDER_STATUS_TEXT,
  ORDER_STATUS_COLOR,
  ORDER_TYPE,
  DEPOSIT_LEVEL,
  DEPOSIT_LEVEL_TEXT,
  DEFAULT_DEPOSIT_CONFIG,
  CANCEL_RULE,
  TIMER,
  LBS,
  VERIFY,
  MESSAGE_TYPE,
  MESSAGE_DIRECTION,
  MESSAGE_STATUS,
  getOrderStatusText,
  getOrderStatusColor,
  canCancelOrder,
  checkDepositLevel
};
