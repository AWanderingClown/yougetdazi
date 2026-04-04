/**
 * 业务规则配置服务
 * 从后端获取动态规则，在app启动时一次性加载
 * 如果无法访问后端，降级到本地默认值
 */

const api = require('./api');
const { TIMER, ORDER_LIMITS, APPOINTMENT, GEOGRAPHY } = require('./constants');

/**
 * 本地默认规则（降级用）
 * 与后端 DEFAULT_RULES 保持一致
 */
const DEFAULT_RULES = {
  order_limits: {
    max_service_duration_hours: ORDER_LIMITS.MAX_SERVICE_DURATION_HOURS,
    min_hourly_rate: 20
  },
  appointment: {
    range_days: 7
  },
  geography: {
    distance_display_threshold: GEOGRAPHY.DISTANCE_DISPLAY_THRESHOLD
  },
  pricing: {
    platform_commission: 0.2
  }
};

/**
 * 配置服务单例
 */
class ConfigService {
  constructor() {
    this.rules = DEFAULT_RULES;
    this.loaded = false;
    this.error = null;
    this._cachedAppointmentRangeMs = null;  // 缓存预约范围毫秒值
  }

  /**
   * 从后端获取业务规则
   * 在 app.onLaunch 中调用一次
   *
   * @returns {Promise<Object>} 规则数据
   */
  async loadRules() {
    if (this.loaded) {
      return this.rules;
    }

    try {
      const app = getApp();
      const res = await app.request({
        url: api.configApi.businessRules(),
        method: 'GET'
      });

      if (res.code === 0 && res.data) {
        const { order_limits, appointment, geography, pricing } = res.data;

        // 验证数据结构（防止后端返回非法数据）
        if (order_limits && appointment && geography && pricing) {
          this.rules = {
            order_limits,
            appointment,
            geography,
            pricing
          };
          // 规则更新后清除缓存，保证新规则立即生效
          this._cachedAppointmentRangeMs = null;
          console.log('[ConfigService] 业务规则加载成功');
        }
      }
    } catch (error) {
      this.error = error;
      console.warn('[ConfigService] 获取业务规则失败，使用本地默认值:', error.message);
    }

    // 标记已加载（无论成功或失败）
    this.loaded = true;
    return this.rules;
  }

  /**
   * 获取订单时长限制（小时）
   * 有类型检查和默认值保护，防止后端异常数据导致崩溃
   * @returns {number}
   */
  getMaxServiceDuration() {
    const value = this.rules?.order_limits?.max_service_duration_hours;
    return typeof value === 'number' && value > 0 ? value : DEFAULT_RULES.order_limits.max_service_duration_hours;
  }

  /**
   * 获取最低时薪（元）
   * @returns {number}
   */
  getMinHourlyRate() {
    const value = this.rules?.order_limits?.min_hourly_rate;
    return typeof value === 'number' && value > 0 ? value : DEFAULT_RULES.order_limits.min_hourly_rate;
  }

  /**
   * 获取预约范围（天）
   * @returns {number}
   */
  getAppointmentRangeDays() {
    const value = this.rules?.appointment?.range_days;
    return typeof value === 'number' && value > 0 ? value : DEFAULT_RULES.appointment.range_days;
  }

  /**
   * 获取预约范围（毫秒，用于计算时间）
   * 第一次调用时计算并缓存结果
   * @returns {number}
   */
  getAppointmentRangeMs() {
    if (this._cachedAppointmentRangeMs !== null) {
      return this._cachedAppointmentRangeMs;
    }
    const days = this.getAppointmentRangeDays();
    this._cachedAppointmentRangeMs = days * 24 * 60 * 60 * 1000;
    return this._cachedAppointmentRangeMs;
  }

  /**
   * 获取距离显示阈值（米）
   * @returns {number}
   */
  getDistanceDisplayThreshold() {
    const value = this.rules?.geography?.distance_display_threshold;
    return typeof value === 'number' && value > 0 ? value : DEFAULT_RULES.geography.distance_display_threshold;
  }

  /**
   * 获取平台佣金比例（0-1）
   * @returns {number}
   */
  getPlatformCommission() {
    const value = this.rules?.pricing?.platform_commission;
    return typeof value === 'number' && value >= 0 && value <= 1 ? value : DEFAULT_RULES.pricing.platform_commission;
  }
}

module.exports = new ConfigService();
