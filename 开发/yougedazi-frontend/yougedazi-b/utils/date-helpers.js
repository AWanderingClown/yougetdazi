// utils/date-helpers.js - 日期时间辅助工具

/**
 * 生成临时ID
 * @param {string} prefix - ID前缀，默认为'temp'
 * @returns {string} 临时ID
 */
const generateTempId = (prefix = 'temp') => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
};

/**
 * 格式化时间为 HH:MM
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的时间字符串
 */
const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/**
 * 检查是否需要显示时间分隔符
 * @param {number} prevTime - 上一条消息时间戳
 * @param {number} currTime - 当前消息时间戳
 * @param {number} interval - 间隔阈值（毫秒），默认5分钟
 * @returns {boolean} 是否需要显示时间分隔符
 */
const needTimeSeparator = (prevTime, currTime, interval = 5 * 60 * 1000) => {
  if (!prevTime) return true;
  return currTime - prevTime > interval;
};

module.exports = {
  generateTempId,
  formatTime,
  needTimeSeparator
};
