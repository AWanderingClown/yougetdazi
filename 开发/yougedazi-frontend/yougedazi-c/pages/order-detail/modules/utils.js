// pages/order-detail/modules/utils.js
// 订单详情页工具函数模块

const { ORDER_STATUS } = require('../../../utils/constants');

/**
 * 格式化日期时间（用于显示）
 * @param {string|Date} timeStr - 时间字符串或Date对象
 * @returns {string} 格式化后的时间（如：3月12日 12:05）
 */
function formatTime(timeStr) {
  if (!timeStr) return '';
  const date = new Date(timeStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hour}:${minute}`;
}

/**
 * 格式化完整日期时间（用于存储）
 * @param {Date} date - Date对象
 * @returns {string} 格式化后的时间（如：2026-03-12 12:05:30）
 */
function formatFullDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * 从订单数据中提取搭子信息
 * @param {Object} order - 订单数据
 * @param {Object} paidRecord - 支付记录
 * @returns {Object} 搭子信息对象
 */
function extractCompanionInfo(order, paidRecord) {
  return {
    id: order.companion?.id || '',
    nickname: order.companion?.nickname || '等待接单',
    avatar: order.companion?.avatar || '/assets/images/avatar-default.png',
    gender: 'unknown',
    age: 0,
    tags: [],
    distance: 0,
    estimatedArrival: '',
    location: { longitude: 116.397428, latitude: 39.90923 }
  };
}

/**
 * 从订单数据中提取订单信息
 * @param {Object} order - 订单数据
 * @param {Object} acceptedLog - 接单日志
 * @param {Object} paidRecord - 支付记录
 * @returns {Object} 订单信息对象
 */
function extractOrderInfo(order, acceptedLog, paidRecord) {
  return {
    orderNo: order.order_no,
    createdAt: order.created_at ? order.created_at.slice(0, 19).replace('T', ' ') : '',
    paidAt: paidRecord?.pay_time ? paidRecord.pay_time.slice(0, 19).replace('T', ' ') : '',
    acceptedAt: acceptedLog?.created_at || '',
    serviceType: order.service_name,
    duration: order.duration,
    appointmentTime: order.service_start_at ? order.service_start_at.slice(0, 16).replace('T', ' ') : '',
    address: order.user_remark || '',
    servicePrice: (order.total_amount || 0) / 100,
    totalAmount: (order.total_amount || 0) / 100,
    hasReviewed: false,
    cancelReason: order.cancel_reason || '',
    cancelledAt: order.cancelled_at ? order.cancelled_at.slice(0, 19).replace('T', ' ') : ''
  };
}

/**
 * 生成订单状态时间轴
 * @param {Object} order - 订单数据
 * @param {Function} formatTimeFn - 格式化时间函数
 * @returns {Array} 时间轴数据
 */
function generateTimeLine(order, formatTimeFn) {
  const timeLine = [];
  const statusMap = {
    [ORDER_STATUS.PENDING_PAYMENT]: { text: '订单创建', icon: '📝' },
    'paid': { text: '支付成功', icon: '💰' },
    [ORDER_STATUS.PENDING_ACCEPT]: { text: '等待接单', icon: '⏳' },
    [ORDER_STATUS.ACCEPTED]: { text: '搭子已接单', icon: '✅' },
    [ORDER_STATUS.DEPARTED]: { text: '搭子已出发', icon: '🚗' },
    [ORDER_STATUS.SERVING]: { text: '服务进行中', icon: '✨' },
    [ORDER_STATUS.COMPLETED]: { text: '订单完成', icon: '🎉' },
    [ORDER_STATUS.CANCELLED]: { text: '订单已取消', icon: '❌' }
  };

  // 根据订单状态和时间生成时间轴
  if (order.created_at) {
    timeLine.push({
      status: 'created',
      text: '订单创建',
      icon: '📝',
      time: formatTimeFn(order.created_at),
      isActive: true
    });
  }

  if (order.payment_records && order.payment_records.length > 0) {
    const paidRecord = order.payment_records.find(r => r.status === 'paid');
    if (paidRecord) {
      timeLine.push({
        status: 'paid',
        text: '支付成功',
        icon: '💰',
        time: formatTimeFn(paidRecord.pay_time),
        isActive: true
      });
    }
  }

  if (order.operation_logs) {
    // 按时间排序
    const sortedLogs = order.operation_logs.sort((a, b) => {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    sortedLogs.forEach(log => {
      if (statusMap[log.action]) {
        timeLine.push({
          status: log.action,
          text: statusMap[log.action].text,
          icon: statusMap[log.action].icon,
          time: formatTimeFn(log.created_at),
          isActive: true
        });
      }
    });
  }

  // 根据当前状态高亮最后一个节点
  if (timeLine.length > 0) {
    const currentStatusIndex = timeLine.findIndex(item => item.status === order.status);
    if (currentStatusIndex >= 0) {
      timeLine[currentStatusIndex].isCurrent = true;
    }
  }

  return timeLine;
}

module.exports = {
  formatTime,
  formatFullDateTime,
  extractCompanionInfo,
  extractOrderInfo,
  generateTimeLine
};
