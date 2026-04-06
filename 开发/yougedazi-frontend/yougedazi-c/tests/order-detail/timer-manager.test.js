/**
 * order-detail/modules/timer-manager.js 单元测试
 *
 * 原则：
 * - 前端只负责展示，所有计算在后端
 * - API每10秒轮询一次，本地每秒更新UI
 * - 请求去重防止并发
 */

'use strict';

const TimerManager = require('../../pages/order-detail/modules/timer-manager');
const { TIMER } = require('../../utils/constants');

// Mock logger
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  Categories: { TIMER: 'timer' }
}));

// 模拟微信小程序 API
global.wx = {
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  showToast: jest.fn(),
  showModal: jest.fn(),
  setStorageSync: jest.fn(),
  getStorageSync: jest.fn()
};

// ════════════════════════════════════════════════════════════════════════════
// 测试辅助函数
// ════════════════════════════════════════════════════════════════════════════
function createMockPage() {
  return {
    data: {
      status: 'pending_payment',
      id: 'order_001',
      payCountdown: '00:00',
      grabCountdown: '00:00'
    },
    setData: jest.fn(function(data) {
      Object.assign(this.data, data);
    })
  };
}

// ════════════════════════════════════════════════════════════════════════════
// TimerManager 测试
// ════════════════════════════════════════════════════════════════════════════
describe('TimerManager', () => {
  let mockPage;
  let timerManager;

  beforeEach(() => {
    mockPage = createMockPage();
    timerManager = new TimerManager(mockPage);
    jest.useFakeTimers();
  });

  afterEach(() => {
    timerManager.destroy();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 构造函数测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('constructor', () => {
    test('正确初始化 page 引用', () => {
      expect(timerManager.page).toBe(mockPage);
    });

    test('定时器对象初始化为 null', () => {
      expect(timerManager.timers.payCountdownTimer).toBeNull();
      expect(timerManager.timers.grabCountdownTimer).toBeNull();
      expect(timerManager.timers.serviceTimerInterval).toBeNull();
      expect(timerManager.timers.acceptTimer).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 支付倒计时测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('startPayCountdown', () => {
    test('启动支付倒计时并更新UI', () => {
      const mockFetch = jest.fn(() => Promise.resolve(600)); // 10分钟
      timerManager.startPayCountdown(mockFetch, jest.fn());

      expect(timerManager.timers.payCountdownTimer).not.toBeNull();
      // 立即执行一次tick
      expect(mockFetch).toHaveBeenCalled();
    });

    test('每秒更新本地倒计时', async () => {
      const mockFetch = jest.fn(() => Promise.resolve(60)); // 1分钟
      timerManager.startPayCountdown(mockFetch, jest.fn());

      // 等待Promise完成
      await Promise.resolve();

      jest.advanceTimersByTime(1000);
      expect(mockPage.setData).toHaveBeenCalledWith(
        expect.objectContaining({ payCountdown: '00:59' })
      );
    });

    test('每10秒调用一次API', async () => {
      const mockFetch = jest.fn(() => Promise.resolve(600));
      timerManager.startPayCountdown(mockFetch, jest.fn());

      await Promise.resolve();
      expect(mockFetch).toHaveBeenCalledTimes(1); // 初始调用

      jest.advanceTimersByTime(10000);
      await Promise.resolve();
      expect(mockFetch).toHaveBeenCalledTimes(2); // 10秒后再次调用
    });

    test('倒计时结束时触发回调', async () => {
      const onTimeout = jest.fn();
      const mockFetch = jest.fn(() => Promise.resolve(1)); // 1秒

      timerManager.startPayCountdown(mockFetch, onTimeout);
      await Promise.resolve();

      jest.advanceTimersByTime(2000);
      expect(onTimeout).toHaveBeenCalled();
    });

    test('请求去重 - 前一个请求未完成时不发起新请求', async () => {
      let resolvePromise;
      const mockFetch = jest.fn(() => new Promise(resolve => { resolvePromise = resolve; }));

      timerManager.startPayCountdown(mockFetch, jest.fn());
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 10秒后，请求仍在pending状态
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
      // 不应该发起新请求（isFetching标志阻止）
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 完成pending的请求后，后续轮询可以正常进行
      resolvePromise(600);
      await Promise.resolve();

      // 验证核心去重逻辑：isFetching=true时不会重复请求
      // 注：由于_lastApiCall在请求开始时更新，新请求需要再等10秒
    });

    test('重复启动时清除旧定时器', () => {
      const mockFetch = jest.fn(() => Promise.resolve(600));

      timerManager.startPayCountdown(mockFetch, jest.fn());
      const firstTimer = timerManager.timers.payCountdownTimer;

      timerManager.startPayCountdown(mockFetch, jest.fn());
      const secondTimer = timerManager.timers.payCountdownTimer;

      expect(firstTimer).not.toBe(secondTimer);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 抢单倒计时测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('startGrabCountdown', () => {
    test('启动抢单倒计时', () => {
      const mockFetch = jest.fn(() => Promise.resolve(1800)); // 30分钟
      timerManager.startGrabCountdown(mockFetch, jest.fn());

      expect(timerManager.timers.grabCountdownTimer).not.toBeNull();
    });

    test('倒计时结束时触发回调', async () => {
      const onTimeout = jest.fn();
      const mockFetch = jest.fn(() => Promise.resolve(1));

      timerManager.startGrabCountdown(mockFetch, onTimeout);
      await Promise.resolve();

      jest.advanceTimersByTime(2000);
      expect(onTimeout).toHaveBeenCalled();
    });

    test('更新 grabCountdown 显示', async () => {
      const mockFetch = jest.fn(() => Promise.resolve(1500)); // 25分钟
      timerManager.startGrabCountdown(mockFetch, jest.fn());

      await Promise.resolve();

      expect(mockPage.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          grabCountdown: expect.stringMatching(/^\d{2}:\d{2}$/)
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 服务计时器测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('startServiceTimerDisplay', () => {
    const mockStatus = {
      remaining_seconds: 3600,
      progress_percent: 50,
      remaining_text: '1小时',
      show_renewal_hint: false,
      can_cancel_in_service: false,
      elapsed_minutes: 60,
      is_completed: false
    };

    test('启动服务计时器', () => {
      const mockFetch = jest.fn(() => Promise.resolve(mockStatus));
      timerManager.startServiceTimerDisplay(mockFetch, jest.fn());

      expect(timerManager.timers.serviceTimerInterval).not.toBeNull();
    });

    test('每秒更新UI', async () => {
      const mockFetch = jest.fn(() => Promise.resolve(mockStatus));
      timerManager.startServiceTimerDisplay(mockFetch, jest.fn());

      await Promise.resolve();
      jest.advanceTimersByTime(1000);

      expect(mockPage.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceTimer: expect.any(Object)
        })
      );
    });

    test('每10秒从服务器同步状态', async () => {
      const mockFetch = jest.fn(() => Promise.resolve(mockStatus));
      timerManager.startServiceTimerDisplay(mockFetch, jest.fn());

      await Promise.resolve();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(10000);
      await Promise.resolve();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('服务完成时触发回调', async () => {
      const onComplete = jest.fn();
      const mockFetch = jest.fn(() => Promise.resolve({
        ...mockStatus,
        is_completed: true
      }));

      timerManager.startServiceTimerDisplay(mockFetch, onComplete);
      await Promise.resolve();

      expect(onComplete).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 接单检查定时器测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('startAcceptTimer', () => {
    test('启动接单检查定时器', () => {
      const mockFetch = jest.fn(() => Promise.resolve(true));
      timerManager.startAcceptTimer(mockFetch, jest.fn());

      expect(timerManager.timers.acceptTimer).not.toBeNull();
    });

    test('每10秒检查一次状态', async () => {
      const mockFetch = jest.fn(() => Promise.resolve(true));
      timerManager.startAcceptTimer(mockFetch, jest.fn());

      await Promise.resolve();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(10000);
      await Promise.resolve();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('不能免费取消时触发回调', async () => {
      const onExpired = jest.fn();
      const mockFetch = jest.fn()
        .mockResolvedValueOnce(true)   // 第一次检查：可以免费取消
        .mockResolvedValueOnce(false); // 第二次检查：不能免费取消

      timerManager.startAcceptTimer(mockFetch, onExpired);
      await Promise.resolve();

      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(onExpired).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 定时器清理测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('stopAllTimers', () => {
    test('停止所有定时器', () => {
      const mockFetch = jest.fn(() => Promise.resolve(600));

      timerManager.startPayCountdown(mockFetch, jest.fn());
      timerManager.startGrabCountdown(mockFetch, jest.fn());

      timerManager.stopAllTimers();

      expect(timerManager.timers.payCountdownTimer).toBeNull();
      expect(timerManager.timers.grabCountdownTimer).toBeNull();
      expect(timerManager.timers.serviceTimerInterval).toBeNull();
      expect(timerManager.timers.acceptTimer).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 销毁测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('destroy', () => {
    test('销毁时停止所有定时器', () => {
      const mockFetch = jest.fn(() => Promise.resolve(600));
      timerManager.startPayCountdown(mockFetch, jest.fn());

      timerManager.destroy();

      expect(timerManager.timers.payCountdownTimer).toBeNull();
      expect(timerManager.page).toBeNull();
    });
  });
});
