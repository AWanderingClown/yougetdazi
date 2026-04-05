// utils/date-helpers.js - 日期时间辅助工具

// 模块级辅助函数，避免重复创建
const pad = n => String(n).padStart(2, '0');

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
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

/**
 * 格式化倒计时为 MM:SS 或 HH:MM:SS
 * @param {number} seconds - 秒数
 * @param {boolean} showHours - 是否显示小时
 * @returns {string} 格式化后的时间字符串
 */
const formatCountdown = (seconds, showHours = false) => {
  if (!seconds || seconds <= 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (showHours && h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
};

/**
 * 获取当前月份日期范围
 * @returns {Object} { startDate, endDate }
 */
const getCurrentMonthRange = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${pad(now.getDate())}`
  };
};

module.exports = {
  generateTempId,
  formatTime,
  needTimeSeparator,
  formatCountdown,
  getCurrentMonthRange
};
