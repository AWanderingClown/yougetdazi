/**
 * 有个搭子 全局常量定义
 * 用于统一C端、B端和后台的订单状态、保证金档位等常量
 * 修改此文件后需要同步到其他端
 */

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
// 注意：
// - 倒计时值（PAY_COUNTDOWN等）单位为【秒】
// - 时间间隔值（UI_TICK_INTERVAL_MS）单位为【毫秒】
const TIMER = {
  // 支付倒计时【秒】（15分钟）
  PAY_COUNTDOWN: 15 * 60,

  // 抢单倒计时【秒】（30分钟）
  GRAB_COUNTDOWN: 30 * 60,

  // 接单倒计时【秒】（30分钟）
  ACCEPT_COUNTDOWN: 30 * 60,

  // UI刷新间隔【毫秒】- 倒计时每秒更新一次
  UI_TICK_INTERVAL_MS: 1000,

  // 后端同步周期【秒】- 每10秒同步一次订单数据
  BACKEND_SYNC_INTERVAL_SEC: 10
};

// ==================== 订单限制常量 ====================
const ORDER_LIMITS = {
  // 单次服务时长上限（小时）
  MAX_SERVICE_DURATION_HOURS: 24
};

// ==================== 预约相关常量 ====================
const APPOINTMENT = {
  // 预约时间范围（毫秒）- 最多可预约7天后的时间，方便计算日期时直接使用
  RANGE_MS: 7 * 24 * 60 * 60 * 1000
};

// ==================== 地理位置相关常量 ====================
const GEOGRAPHY = {
  // 距离显示单位切换阈值（米）
  // <1000米 显示"250米", >=1000米 显示"2.5公里"
  DISTANCE_DISPLAY_THRESHOLD: 1000,

  // 地图缓存有效期（毫秒）- 地图Key缓存23小时
  MAP_KEY_CACHE_DURATION_MS: 23 * 60 * 60 * 1000
};

// ==================== 地图缩放配置 ====================
// 根据两点坐标差（经纬度差值，取 max(latDiff, lngDiff)）自动调整地图缩放级别
// threshold 表示坐标差的最大值，当实际差值 > threshold 时使用对应的 zoomLevel
const MAP_ZOOM_CONFIG = [
  { threshold: 0.1,   zoomLevel: 10 },    // > 0.1° 用10级（全景视图，距离很远）
  { threshold: 0.05,  zoomLevel: 12 },    // > 0.05° 用12级（距离较远）
  { threshold: 0.01,  zoomLevel: 14 },    // > 0.01° 用14级（距离中等）
  { threshold: 0.005, zoomLevel: 15 },    // > 0.005° 用15级（距离很近）
  { threshold: 0,     zoomLevel: 16 }     // 其他情况用16级（超近景视图）
];

// ==================== LBS定位常量 ====================
const LBS = {
  // 到达阈值（米）
  ARRIVAL_THRESHOLD: 100,

  // 位置更新间隔（毫秒）- C端每30秒刷新一次搭子位置
  UPDATE_INTERVAL: 30000,

  // 服务中上报间隔（毫秒）
  REPORT_INTERVAL: 60000
};

// ==================== 验证相关常量 ====================
const VERIFY = {
  // 人脸识别有效期（毫秒）
  FACE_VERIFY_VALID: 15 * 60 * 1000
};

// ==================== 验证消息常量 ====================
const VALIDATE_MESSAGES = {
  // 时长验证
  DURATION_TOO_LONG: (maxDuration) => `单次服务时长不能超过${maxDuration}小时`,
  MINIMUM_DURATION: (minDuration) => `最低${minDuration}小时起`,
  MINIMUM_HOURLY_RATE: '最低20元/小时'
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
 * 检查订单是否可以取消（前端预估）
 * 注意：实际能否取消及退款金额以服务端 /cancel-preview 接口为准
 * @param {string} status - 订单状态
 * @param {number} serviceDuration - 服务时长（毫秒）
 * @returns {boolean} 是否可以取消
 */
function canCancelOrder(status, serviceDuration = 0) {
  const CANCELABLE_STATUSES = [
    ORDER_STATUS.PENDING_PAYMENT,
    ORDER_STATUS.PENDING,
    ORDER_STATUS.WAITING_GRAB,
    ORDER_STATUS.ACCEPTED,
    ORDER_STATUS.SERVING
  ];

  if (!CANCELABLE_STATUSES.includes(status)) {
    return false;
  }

  // 服务中超过15分钟不能取消（预估）
  if (status === ORDER_STATUS.SERVING && serviceDuration > CANCEL_RULE.FIFTEEN_MINUTES) {
    return false;
  }

  return true;
}

/**
 * 获取取消提示信息
 * 注意：退款金额由服务端计算，此函数仅用于显示提示
 * @param {string} status - 订单状态
 * @returns {string} 提示信息
 */
function getCancelTip(status) {
  switch (status) {
    case ORDER_STATUS.PENDING_PAYMENT:
      return '订单未支付，取消后无退款';
    case ORDER_STATUS.PENDING:
    case ORDER_STATUS.WAITING_GRAB:
      return '搭子未接单，取消后将全额退款';
    case ORDER_STATUS.ACCEPTED:
      return '搭子已接单，取消规则请查看退款预览';
    case ORDER_STATUS.SERVING:
      return '服务进行中，取消规则请查看退款预览';
    default:
      return '当前状态可能不支持取消';
  }
}

/**
 * 根据下单时间计算订单时间状态
 * @param {number} orderTime - 下单时间戳（毫秒）
 * @returns {Object} 时间状态对象
 *   - isWithin2Minutes: boolean - 是否在2分钟内
 *   - isWithin15Minutes: boolean - 是否在15分钟内
 *   - exceeded15Minutes: boolean - 是否超过15分钟
 *   - minutesElapsed: number - 已过去多少分钟
 */
function getOrderTimeStatus(orderTime) {
  if (!orderTime) {
    return {
      isWithin2Minutes: true,
      isWithin15Minutes: true,
      exceeded15Minutes: false,
      minutesElapsed: 0
    };
  }

  const now = Date.now();
  const elapsed = now - orderTime;
  const minutesElapsed = Math.floor(elapsed / (60 * 1000));

  return {
    isWithin2Minutes: elapsed < CANCEL_RULE.TWO_MINUTES,
    isWithin15Minutes: elapsed < CANCEL_RULE.FIFTEEN_MINUTES,
    exceeded15Minutes: elapsed >= CANCEL_RULE.FIFTEEN_MINUTES,
    minutesElapsed
  };
}

/**
 * 根据订单时间和状态获取待支付订单的按钮配置
 * @param {string} status - 订单状态
 * @param {number} orderTime - 下单时间戳（毫秒）
 * @returns {Array|null} 按钮配置数组，非待支付状态返回null
 */
function getPendingPaymentActions(status, orderTime) {
  if (status !== ORDER_STATUS.PENDING_PAYMENT) {
    return null;
  }

  const timeStatus = getOrderTimeStatus(orderTime);

  // 超过15分钟：订单自动取消，只显示查看详情
  if (timeStatus.exceeded15Minutes) {
    return [
      { text: '查看详情', action: 'detail', type: 'default' }
    ];
  }

  // 2-15分钟内：只显示支付按钮（取消会扣50%）
  if (!timeStatus.isWithin2Minutes && timeStatus.isWithin15Minutes) {
    return [
      { text: '立即支付', action: 'pay', type: 'primary' },
      { text: '查看详情', action: 'detail', type: 'default' }
    ];
  }

  // 2分钟内：显示取消和支付按钮
  return [
    { text: '立即支付', action: 'pay', type: 'primary' },
    { text: '取消订单', action: 'cancel', type: 'default' },
    { text: '查看详情', action: 'detail', type: 'default' }
  ];
}

/**
 * 获取等待接单状态的按钮配置
 * @param {string} status - 订单状态
 * @param {number} orderTime - 下单时间戳（毫秒）
 * @returns {Array|null} 按钮配置数组
 */
function getWaitingGrabActions(status, orderTime) {
  if (status !== ORDER_STATUS.WAITING_GRAB) {
    return null;
  }

  const timeStatus = getOrderTimeStatus(orderTime);

  // >15分钟：保持等待或自动取消，只显示查看详情
  if (timeStatus.exceeded15Minutes) {
    return [
      { text: '查看详情', action: 'detail', type: 'default' }
    ];
  }

  // 2-15分钟：取消订单 + 查看详情（等待抢单状态没有换一换）
  if (!timeStatus.isWithin2Minutes && timeStatus.isWithin15Minutes) {
    return [
      { text: '取消订单', action: 'cancel', type: 'default' },
      { text: '查看详情', action: 'detail', type: 'default' }
    ];
  }

  // ≤2分钟：取消(免扣费) + 查看详情
  return [
    { text: '取消订单', action: 'cancel', type: 'default' },
    { text: '查看详情', action: 'detail', type: 'default' }
  ];
}

/**
 * 获取已接单状态的按钮配置
 * @param {string} status - 订单状态
 * @param {number} acceptedAt - 接单时间戳（毫秒）
 * @returns {Array|null} 按钮配置数组
 */
function getAcceptedActions(status, acceptedAt) {
  if (status !== ORDER_STATUS.ACCEPTED) {
    return null;
  }

  // 使用接单时间计算时间状态
  const timeStatus = getOrderTimeStatus(acceptedAt);

  // 2-15分钟：取消(扣50元) + 联系搭子 + 换一换 + 查看详情
  if (!timeStatus.isWithin2Minutes && timeStatus.isWithin15Minutes) {
    return [
      { text: '联系搭子', action: 'contact', type: 'primary' },
      { text: '换一换', action: 'change', type: 'default' },
      { text: '取消订单', action: 'cancel', type: 'default' },
      { text: '查看详情', action: 'detail', type: 'default' }
    ];
  }

  // ≤2分钟：取消(免扣费) + 联系搭子 + 查看详情
  return [
    { text: '联系搭子', action: 'contact', type: 'primary' },
    { text: '取消订单', action: 'cancel', type: 'default' },
    { text: '查看详情', action: 'detail', type: 'default' }
  ];
}

/**
 * 获取搭子已出发状态的按钮配置
 * @param {string} status - 订单状态
 * @returns {Array|null} 按钮配置数组
 */
function getDepartedActions(status) {
  if (status !== ORDER_STATUS.DEPARTED) {
    return null;
  }

  // 任何时间：取消(扣50元) + 联系搭子 + 查看详情
  return [
    { text: '联系搭子', action: 'contact', type: 'primary' },
    { text: '取消订单', action: 'cancel', type: 'default' },
    { text: '查看详情', action: 'detail', type: 'default' }
  ];
}

/**
 * 获取服务中状态的按钮配置
 * @param {string} status - 订单状态
 * @param {number} serviceStartTime - 服务开始时间戳（毫秒）
 * @returns {Array|null} 按钮配置数组
 */
function getServingActions(status, serviceStartTime) {
  if (status !== ORDER_STATUS.SERVING) {
    return null;
  }

  // 如果没有服务开始时间，默认使用当前时间
  const startTime = serviceStartTime || Date.now();
  const elapsed = Date.now() - startTime;
  const isWithin15Minutes = elapsed < CANCEL_RULE.FIFTEEN_MINUTES;

  // ≤15分钟：取消(扣50元) + 联系搭子 + 查看详情
  if (isWithin15Minutes) {
    return [
      { text: '联系搭子', action: 'contact', type: 'primary' },
      { text: '取消订单', action: 'cancel', type: 'default' },
      { text: '查看详情', action: 'detail', type: 'default' }
    ];
  }

  // >15分钟：续费 + 服务结束 + 联系搭子 + 查看详情
  return [
    { text: '续费', action: 'renew', type: 'primary' },
    { text: '服务结束', action: 'complete', type: 'primary' },
    { text: '联系搭子', action: 'contact', type: 'default' },
    { text: '查看详情', action: 'detail', type: 'default' }
  ];
}

/**
 * 获取已完成状态的按钮配置
 * @param {string} status - 订单状态
 * @param {number} completionTime - 订单完成时间戳（毫秒）
 * @returns {Array|null} 按钮配置数组
 */
function getCompletedActions(status, completionTime) {
  if (status !== ORDER_STATUS.COMPLETED) {
    return null;
  }

  // 如果没有完成时间，假设已超过24小时
  if (!completionTime) {
    return [
      { text: '联系客服', action: 'contact_service', type: 'default' },
      { text: '查看详情', action: 'detail', type: 'default' }
    ];
  }

  const elapsed = Date.now() - completionTime;
  const isWithin24Hours = elapsed < CANCEL_RULE.TWENTY_FOUR_HOURS;

  // ≤24小时：评价 + 联系客服 + 查看详情
  if (isWithin24Hours) {
    return [
      { text: '提交评价', action: 'review', type: 'primary' },
      { text: '联系客服', action: 'contact_service', type: 'default' },
      { text: '查看详情', action: 'detail', type: 'default' }
    ];
  }

  // >24小时：联系客服 + 查看详情
  return [
    { text: '联系客服', action: 'contact_service', type: 'default' },
    { text: '查看详情', action: 'detail', type: 'default' }
  ];
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
  ORDER_STATUS,
  ORDER_STATUS_TEXT,
  ORDER_STATUS_COLOR,
  ORDER_TYPE,
  DEPOSIT_LEVEL,
  DEPOSIT_LEVEL_TEXT,
  DEFAULT_DEPOSIT_CONFIG,
  CANCEL_RULE,
  TIMER,
  ORDER_LIMITS,
  APPOINTMENT,
  GEOGRAPHY,
  MAP_ZOOM_CONFIG,
  LBS,
  VERIFY,
  VALIDATE_MESSAGES,
  MESSAGE_TYPE,
  MESSAGE_DIRECTION,
  MESSAGE_STATUS,
  getOrderStatusText,
  getOrderStatusColor,
  canCancelOrder,
  getCancelTip,
  getOrderTimeStatus,
  getPendingPaymentActions,
  getWaitingGrabActions,
  getAcceptedActions,
  getDepartedActions,
  getServingActions,
  getCompletedActions,
  checkDepositLevel
};
