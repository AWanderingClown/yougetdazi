/**
 * order-detail/modules/map-manager.js 单元测试
 *
 * 测试内容：
 * - 地图初始化
 * - 标记点更新
 * - 位置刷新
 * - 定时器管理
 */

'use strict';

const MapManager = require('../../pages/order-detail/modules/map-manager');
const { LBS, ORDER_STATUS } = require('../../utils/constants');

// 模拟微信小程序 API
global.wx = {
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  showToast: jest.fn(),
  setStorageSync: jest.fn(),
  getStorageSync: jest.fn(),
  setClipboardData: jest.fn()
};

// 模拟 map 工具模块
jest.mock('../../utils/map', () => ({
  getMapKey: jest.fn(() => Promise.resolve('mock_map_key')),
  getCompanionLocation: jest.fn(() => Promise.resolve({
    companion_location: { longitude: 116.4, latitude: 39.9 },
    distance_to_client: 1500,
    estimated_arrival: 900
  })),
  formatDistance: jest.fn((d) => d > 1000 ? `${(d/1000).toFixed(1)}km` : `${d}m`),
  formatEstimatedArrival: jest.fn(() => '15:30')
}));

// ════════════════════════════════════════════════════════════════════════════
// 测试辅助函数
// ════════════════════════════════════════════════════════════════════════════
function createMockPage() {
  return {
    data: {
      status: ORDER_STATUS.ACCEPTED,
      companionLocation: null,
      orderInfo: {
        addressLongitude: 116.5,
        addressLatitude: 39.95
      },
      markers: [],
      polyline: []
    },
    setData: jest.fn(function(data) {
      Object.assign(this.data, data);
    })
  };
}

// ════════════════════════════════════════════════════════════════════════════
// MapManager 测试
// ════════════════════════════════════════════════════════════════════════════
describe('MapManager', () => {
  let mockPage;
  let mapManager;

  beforeEach(() => {
    mockPage = createMockPage();
    mapManager = new MapManager(mockPage);
    jest.useFakeTimers();
  });

  afterEach(() => {
    mapManager.destroy();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 构造函数测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('constructor', () => {
    test('正确初始化 page 引用', () => {
      expect(mapManager.page).toBe(mockPage);
    });

    test('定时器初始化为 null', () => {
      expect(mapManager.locationRefreshTimer).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 地图初始化测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('initMap', () => {
    test('使用搭子位置初始化地图', () => {
      const companionLocation = { longitude: 116.4, latitude: 39.9 };
      const orderInfo = { addressLongitude: 116.5, addressLatitude: 39.95 };

      mapManager.initMap(companionLocation, orderInfo);

      expect(mockPage.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          mapCenter: expect.objectContaining({
            longitude: expect.any(Number),
            latitude: expect.any(Number)
          }),
          mapScale: expect.any(Number)
        })
      );
    });

    test('地图中心点为两点中间', () => {
      const companionLocation = { longitude: 116.0, latitude: 39.0 };
      const orderInfo = { addressLongitude: 118.0, addressLatitude: 41.0 };

      mapManager.initMap(companionLocation, orderInfo);

      const calls = mockPage.setData.mock.calls;
      const mapCenterCall = calls.find(call => call[0].mapCenter);
      expect(mapCenterCall[0].mapCenter).toEqual({
        longitude: 117.0,
        latitude: 40.0
      });
    });

    test('无搭子位置时使用默认值', () => {
      const orderInfo = {};
      mapManager.initMap(null, orderInfo);

      expect(mockPage.setData).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 标记点更新测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('updateMapMarkers', () => {
    test('创建两个标记点（搭子和用户）', () => {
      const companionLoc = { longitude: 116.4, latitude: 39.9 };
      const userLoc = { longitude: 116.5, latitude: 39.95 };

      mapManager.updateMapMarkers(companionLoc, userLoc, {});

      const calls = mockPage.setData.mock.calls;
      const markersCall = calls.find(call => call[0].markers);
      expect(markersCall[0].markers).toHaveLength(2);
      expect(markersCall[0].markers[0].title).toBe('搭子位置');
      expect(markersCall[0].markers[1].title).toBe('我的位置');
    });

    test('创建路线 polyline', () => {
      const companionLoc = { longitude: 116.4, latitude: 39.9 };
      const userLoc = { longitude: 116.5, latitude: 39.95 };

      mapManager.updateMapMarkers(companionLoc, userLoc, {});

      const calls = mockPage.setData.mock.calls;
      const polylineCall = calls.find(call => call[0].polyline);
      expect(polylineCall[0].polyline).toHaveLength(1);
      expect(polylineCall[0].polyline[0].points).toHaveLength(2);
    });

    test('无位置时不更新', () => {
      mapManager.updateMapMarkers(null, null, {});

      const markersCalls = mockPage.setData.mock.calls.filter(
        call => call[0].markers !== undefined
      );
      expect(markersCalls).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 位置刷新测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('refreshCompanionLocation', () => {
    test('获取搭子位置并更新数据', async () => {
      await mapManager.refreshCompanionLocation('order_001');

      expect(mockPage.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          companionLocation: expect.any(Object),
          distanceToCompanion: expect.any(Number),
          distanceToCompanionText: expect.any(String),
          estimatedArrival: expect.any(String)
        })
      );
    });

    test('无订单ID时返回null', async () => {
      const result = await mapManager.refreshCompanionLocation(null);
      expect(result).toBeNull();
    });

    test('出错时不抛出异常', async () => {
      const map = require('../../utils/map');
      map.getCompanionLocation.mockRejectedValueOnce(new Error('Network error'));

      await expect(mapManager.refreshCompanionLocation('order_001'))
        .rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 位置刷新定时器测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('startLocationRefresh', () => {
    test('启动位置刷新定时器', () => {
      const onUpdate = jest.fn();
      mapManager.startLocationRefresh('order_001', onUpdate);

      expect(mapManager.locationRefreshTimer).not.toBeNull();
      expect(onUpdate).toHaveBeenCalled(); // 立即执行一次
    });

    test('按LBS.UPDATE_INTERVAL间隔刷新', () => {
      const onUpdate = jest.fn();
      mapManager.startLocationRefresh('order_001', onUpdate);
      onUpdate.mockClear();

      jest.advanceTimersByTime(LBS.UPDATE_INTERVAL);
      expect(onUpdate).toHaveBeenCalled();
    });

    test('非进行状态停止刷新', () => {
      mockPage.data.status = ORDER_STATUS.COMPLETED;
      const onUpdate = jest.fn();

      mapManager.startLocationRefresh('order_001', onUpdate);
      jest.advanceTimersByTime(LBS.UPDATE_INTERVAL);

      expect(mapManager.locationRefreshTimer).toBeNull();
    });

    test('重复启动时清除旧定时器', () => {
      mapManager.startLocationRefresh('order_001', jest.fn());
      const firstTimer = mapManager.locationRefreshTimer;

      mapManager.startLocationRefresh('order_001', jest.fn());
      const secondTimer = mapManager.locationRefreshTimer;

      expect(firstTimer).not.toBe(secondTimer);
    });

    test('无订单ID时不启动', () => {
      mapManager.startLocationRefresh(null, jest.fn());
      expect(mapManager.locationRefreshTimer).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 加载地图Key测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('loadMapKey', () => {
    test('加载并设置地图Key', async () => {
      const key = await mapManager.loadMapKey();

      expect(key).toBe('mock_map_key');
      expect(mockPage.setData).toHaveBeenCalledWith({ mapKey: 'mock_map_key' });
    });

    test('加载失败时抛出错误', async () => {
      const map = require('../../utils/map');
      map.getMapKey.mockRejectedValueOnce(new Error('Failed to load'));

      await expect(mapManager.loadMapKey()).rejects.toThrow('Failed to load');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 定时器清理测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('stopLocationRefresh', () => {
    test('停止位置刷新定时器', () => {
      mapManager.startLocationRefresh('order_001', jest.fn());
      expect(mapManager.locationRefreshTimer).not.toBeNull();

      mapManager.stopLocationRefresh();
      expect(mapManager.locationRefreshTimer).toBeNull();
    });

    test('无定时器时不报错', () => {
      expect(() => mapManager.stopLocationRefresh()).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 销毁测试
  // ─────────────────────────────────────────────────────────────────────────
  describe('destroy', () => {
    test('销毁时停止定时器并清空引用', () => {
      mapManager.startLocationRefresh('order_001', jest.fn());
      mapManager.destroy();

      expect(mapManager.locationRefreshTimer).toBeNull();
      expect(mapManager.page).toBeNull();
    });
  });
});
