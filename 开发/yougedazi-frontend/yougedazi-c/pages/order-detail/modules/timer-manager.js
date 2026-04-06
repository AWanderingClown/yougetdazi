// pages/order-detail/modules/timer-manager.js

const { TIMER, ORDER_STATUS } = require('../../../utils/constants');
const logger = require('../../../utils/logger');

// 状态与定时器映射关系
const STATUS_TIMER_MAP = {
  [ORDER_STATUS.SERVING]: 'serviceTimerInterval',
  [ORDER_STATUS.PENDING_PAYMENT]: 'payCountdownTimer',
  [ORDER_STATUS.WAITING_GRAB]: 'grabCountdownTimer',
  [ORDER_STATUS.PENDING]: 'acceptTimer'
};

class TimerManager {
  constructor(page, onDataChange) {
    this.page = page;
    this.onDataChange = onDataChange || ((data) => this.page?.setData(data));
    this.timers = {
      payCountdownTimer: null,
      grabCountdownTimer: null,
      serviceTimerInterval: null,
      acceptTimer: null
    };
    this.lastServiceData = null;
    this.localRemainingSeconds = 0;
    this.lastDisplayValue = '';
  }

  _createSyncInterval(fetchFn, onData, intervalMs) {
    let lastApiCall = 0;
    let isFetching = false;
    let isDestroyed = false;

    const tick = async () => {
      if (isDestroyed) return;

      const now = Date.now();

      if (now - lastApiCall >= intervalMs && !isFetching) {
        isFetching = true;
        lastApiCall = now;
        try {
          const data = await fetchFn();
          if (!isDestroyed) {
            onData(data);
          }
        } catch (err) {
          if (!isDestroyed) {
            logger.error(logger.Categories.TIMER, 'API调用失败', err);
          }
        } finally {
          if (!isDestroyed) {
            isFetching = false;
          }
        }
      }
    };

    return {
      tick,
      destroy: () => { isDestroyed = true; }
    };
  }

  _startCountdown(timerKey, fetchFn, onTimeout, dataKey) {
    this._stopTimer(timerKey);
    this.lastDisplayValue = '';

    const syncInterval = this._createSyncInterval(
      fetchFn,
      (remaining) => {
        if (remaining !== null) {
          this.localRemainingSeconds = remaining;
        }
      },
      TIMER.BACKEND_SYNC_INTERVAL_SEC * 1000
    );

    const tick = () => {
      syncInterval.tick();

      if (this.localRemainingSeconds > 0) {
        this.localRemainingSeconds--;
      }

      const mm = String(Math.floor(this.localRemainingSeconds / 60)).padStart(2, '0');
      const ss = String(this.localRemainingSeconds % 60).padStart(2, '0');
      const newValue = `${mm}:${ss}`;

      if (newValue !== this.lastDisplayValue) {
        this.lastDisplayValue = newValue;
        this.onDataChange({ [dataKey]: newValue });
      }

      if (this.localRemainingSeconds <= 0) {
        this._stopTimer(timerKey);
        onTimeout?.();
      }
    };

    tick();
    this.timers[timerKey] = setInterval(tick, TIMER.UI_TICK_INTERVAL_MS);
    this.timers[`${timerKey}_sync`] = syncInterval;
  }

  _stopTimer(timerKey) {
    if (this.timers[timerKey]) {
      clearInterval(this.timers[timerKey]);
      this.timers[timerKey] = null;
    }
    const syncKey = `${timerKey}_sync`;
    if (this.timers[syncKey]) {
      this.timers[syncKey].destroy();
      this.timers[syncKey] = null;
    }
  }

  startPayCountdown(fetchRemainingTimeFn, onTimeout) {
    this._startCountdown('payCountdownTimer', fetchRemainingTimeFn, onTimeout, 'payCountdown');
  }

  stopPayCountdown() {
    this._stopTimer('payCountdownTimer');
  }

  startGrabCountdown(fetchRemainingTimeFn, onTimeout) {
    this._startCountdown('grabCountdownTimer', fetchRemainingTimeFn, onTimeout, 'grabCountdown');
  }

  stopGrabCountdown() {
    this._stopTimer('grabCountdownTimer');
  }

  startServiceTimerDisplay(fetchServiceStatusFn, onComplete) {
    this.stopServiceTimer();
    this.lastServiceData = null;

    const syncInterval = this._createSyncInterval(
      fetchServiceStatusFn,
      (status) => {
        if (!status) return;

        const {
          remaining_seconds,
          progress_percent,
          remaining_text,
          show_renewal_hint,
          can_cancel_in_service,
          elapsed_minutes,
          is_completed
        } = status;

        if (is_completed) {
          this.stopServiceTimer();
          onComplete?.();
          return;
        }

        const timerDisplay = this._formatTimeDisplay(remaining_seconds);

        const newData = {};
        const last = this.lastServiceData;

        if (!last || last.hours !== timerDisplay.hours || last.minutes !== timerDisplay.minutes || last.seconds !== timerDisplay.seconds) {
          newData.serviceTimer = timerDisplay;
        }
        if (!last || last.progress !== progress_percent) {
          newData.serviceProgress = progress_percent;
        }
        if (!last || last.remainingText !== remaining_text) {
          newData.remainingTimeText = remaining_text;
        }
        if (!last || last.showRenewalHint !== show_renewal_hint) {
          newData.showRenewalHint = show_renewal_hint;
        }
        if (!last || last.canCancelInService !== can_cancel_in_service) {
          newData.canCancelInService = can_cancel_in_service;
        }
        if (!last || last.serviceElapsedMinutes !== elapsed_minutes) {
          newData.serviceElapsedMinutes = elapsed_minutes;
        }

        if (Object.keys(newData).length > 0) {
          this.onDataChange(newData);
          this.lastServiceData = {
            ...timerDisplay,
            progress: progress_percent,
            remainingText: remaining_text,
            showRenewalHint: show_renewal_hint,
            canCancelInService: can_cancel_in_service,
            serviceElapsedMinutes: elapsed_minutes
          };
        }
      },
      TIMER.BACKEND_SYNC_INTERVAL_SEC * 1000
    );

    syncInterval.tick();
    this.timers.serviceTimerInterval = setInterval(() => syncInterval.tick(), TIMER.UI_TICK_INTERVAL_MS);
    this.timers.serviceTimerInterval_sync = syncInterval;
  }

  _formatTimeDisplay(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      hours: String(hours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(seconds).padStart(2, '0')
    };
  }

  stopServiceTimer() {
    this._stopTimer('serviceTimerInterval');
    this.lastServiceData = null;
  }

  startAcceptTimer(fetchCanCancelFreeStatusFn, onExpired) {
    this.stopAcceptTimer();

    const syncInterval = this._createSyncInterval(
      fetchCanCancelFreeStatusFn,
      (canCancelFree) => {
        if (canCancelFree === false) {
          onExpired?.();
        }
      },
      TIMER.BACKEND_SYNC_INTERVAL_SEC * 1000
    );

    syncInterval.tick();
    this.timers.acceptTimer = setInterval(() => syncInterval.tick(), TIMER.UI_TICK_INTERVAL_MS);
    this.timers.acceptTimer_sync = syncInterval;
  }

  getActiveTimerType() {
    // 从 timers 对象中推导当前活动的定时器类型
    if (this.timers.payCountdownTimer) return 'payCountdownTimer';
    if (this.timers.grabCountdownTimer) return 'grabCountdownTimer';
    if (this.timers.serviceTimerInterval) return 'serviceTimerInterval';
    if (this.timers.acceptTimer) return 'acceptTimer';
    return null;
  }

  hasActiveTimerForStatus(status) {
    const expectedTimer = STATUS_TIMER_MAP[status];
    return expectedTimer && !!this.timers[expectedTimer];
  }

  stopAcceptTimer() {
    this._stopTimer('acceptTimer');
  }

  stopAllTimers() {
    this.stopPayCountdown();
    this.stopGrabCountdown();
    this.stopServiceTimer();
    this.stopAcceptTimer();
  }

  destroy() {
    this.stopAllTimers();
    this.page = null;
    this.onDataChange = null;
    this.lastServiceData = null;
    this.localRemainingSeconds = 0;
    this.lastDisplayValue = '';
  }
}

module.exports = TimerManager;
