/**
 * 日志工具模块
 * 统一日志输出，支持分级和分类
 */

const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// 当前日志级别（生产环境可调整为WARN或ERROR）
const CURRENT_LEVEL = LogLevel.DEBUG;

// 日志分类前缀
const Categories = {
  ORDER: '[Order]',
  NETWORK: '[Network]',
  SOCKET: '[Socket]',
  AUTH: '[Auth]',
  UI: '[UI]',
  SYSTEM: '[System]'
};

/**
 * 格式化日志消息
 */
function formatMessage(category, level, args) {
  const timestamp = new Date().toISOString();
  const levelStr = Object.keys(LogLevel).find(k => LogLevel[k] === level);
  return [`${timestamp} ${levelStr} ${category}`, ...args];
}

/**
 * 基础日志函数
 */
function log(level, category, ...args) {
  if (level < CURRENT_LEVEL) return;
  
  const formatted = formatMessage(category, level, args);
  
  switch (level) {
    case LogLevel.DEBUG:
      console.log(...formatted);
      break;
    case LogLevel.INFO:
      console.info(...formatted);
      break;
    case LogLevel.WARN:
      console.warn(...formatted);
      break;
    case LogLevel.ERROR:
      console.error(...formatted);
      // 生产环境可上报到监控系统
      break;
  }
}

/**
 * 导出日志函数
 */
module.exports = {
  debug: (category, ...args) => log(LogLevel.DEBUG, category, ...args),
  info: (category, ...args) => log(LogLevel.INFO, category, ...args),
  warn: (category, ...args) => log(LogLevel.WARN, category, ...args),
  error: (category, ...args) => log(LogLevel.ERROR, category, ...args),
  Categories,
  LogLevel
};