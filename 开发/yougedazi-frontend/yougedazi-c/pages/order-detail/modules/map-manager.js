// pages/order-detail/modules/map-manager.js
// 地图管理模块 - 地图初始化、位置刷新、标记更新

const { LBS } = require('../../../utils/constants');

/**
 * 地图管理器类
 */
class MapManager {
  /**
   * @param {Object} page - 页面实例引用
   */
  constructor(page) {
    this.page = page;
    this.locationRefreshTimer = null;
  }

  /**
   * 初始化地图
   * @param {Object} companionLocation - 搭子位置
   * @param {Object} orderInfo - 订单信息
   */
  initMap(companionLocation, orderInfo) {
    // 使用真实的搭子位置（如果已获取）或默认值
    const companionLoc = companionLocation || {
      longitude: 116.387428,
      latitude: 39.91923
    };

    // 用户位置（目的地）- 从订单信息中获取实际地址的坐标
    const userLocation = {
      longitude: orderInfo?.addressLongitude || orderInfo?.longitude || 116.397428,
      latitude: orderInfo?.addressLatitude || orderInfo?.latitude || 39.90923
    };

    // 设置地图中心点（两点中间）
    this.page.setData({
      mapCenter: {
        longitude: (userLocation.longitude + companionLoc.longitude) / 2,
        latitude: (userLocation.latitude + companionLoc.latitude) / 2
      },
      mapScale: 13
    });

    // 设置标记点和路线
    this.updateMapMarkers(companionLoc, userLocation, orderInfo);
  }

  /**
   * 更新地图标记和路线
   * @param {Object} companionLoc - 搭子位置
   * @param {Object} userLocation - 用户位置
   * @param {Object} orderInfo - 订单信息
   */
  updateMapMarkers(companionLoc, userLocation, orderInfo) {
    // 如果没有传入位置，从页面数据获取
    if (!companionLoc) {
      companionLoc = this.page.data.companionLocation;
    }
    if (!userLocation) {
      userLocation = {
        longitude: this.page.data.orderInfo?.addressLongitude || this.page.data.orderInfo?.longitude || 116.397428,
        latitude: this.page.data.orderInfo?.addressLatitude || this.page.data.orderInfo?.latitude || 39.90923
      };
    }

    if (!companionLoc) return;

    const markers = [
      {
        id: 1,
        longitude: companionLoc.longitude,
        latitude: companionLoc.latitude,
        iconPath: '/assets/icons/marker-dazi.png',
        width: 40,
        height: 40,
        title: '搭子位置',
        callout: {
          content: '搭子在这里',
          color: '#667eea',
          fontSize: 12,
          borderRadius: 8,
          bgColor: '#fff',
          padding: 8,
          display: 'ALWAYS'
        }
      },
      {
        id: 2,
        longitude: userLocation.longitude,
        latitude: userLocation.latitude,
        iconPath: '/assets/icons/marker-user.png',
        width: 40,
        height: 40,
        title: '我的位置',
        callout: {
          content: '我在这里',
          color: '#4CAF50',
          fontSize: 12,
          borderRadius: 8,
          bgColor: '#fff',
          padding: 8,
          display: 'ALWAYS'
        }
      }
    ];

    // 设置路线
    const polyline = [{
      points: [
        { longitude: companionLoc.longitude, latitude: companionLoc.latitude },
        { longitude: userLocation.longitude, latitude: userLocation.latitude }
      ],
      color: '#7B68EE',
      width: 4,
      dottedLine: false,
      arrowLine: true
    }];

    this.page.setData({ markers, polyline });
  }

  /**
   * 启动搭子位置刷新
   * @param {string} orderId - 订单ID
   * @param {Function} onLocationUpdate - 位置更新回调
   */
  startLocationRefresh(orderId, onLocationUpdate) {
    this.stopLocationRefresh();

    if (!orderId) return;

    // 先刷新一次
    if (onLocationUpdate) onLocationUpdate();

    // 每30秒刷新一次位置
    this.locationRefreshTimer = setInterval(() => {
      // 检查订单状态，如果已经不是进行中的状态则停止刷新
      const currentStatus = this.page.data.status;
      const shouldStop = currentStatus !== 'accepted' && currentStatus !== 'serving';

      if (shouldStop) {
        this.stopLocationRefresh();
        return;
      }

      if (onLocationUpdate) onLocationUpdate();
    }, LBS.UPDATE_INTERVAL);
  }

  /**
   * 停止位置刷新
   */
  stopLocationRefresh() {
    if (this.locationRefreshTimer) {
      clearInterval(this.locationRefreshTimer);
      this.locationRefreshTimer = null;
    }
  }

  /**
   * 加载地图Key
   * @returns {Promise<string>} 地图Key
   */
  loadMapKey() {
    const map = require('../../../utils/map');
    return map.getMapKey()
      .then((key) => {
        this.page.setData({ mapKey: key });
        return key;
      })
      .catch((err) => {
        const logger = require('../../../utils/logger');
        logger.error(logger.Categories.UI, '获取地图Key失败', err);
        throw err;
      });
  }

  /**
   * 刷新搭子位置
   * @param {string} orderId - 订单ID
   * @returns {Promise<Object>} 位置信息
   */
  refreshCompanionLocation(orderId) {
    const map = require('../../../utils/map');

    if (!orderId) return Promise.resolve(null);

    return map.getCompanionLocation(orderId)
      .then((result) => {
        // 格式化距离显示
        const distance = result.distance_to_client;
        const formattedDistance = map.formatDistance(distance);

        // 更新搭子位置信息
        this.page.setData({
          companionLocation: result.companion_location,
          distanceToCompanion: distance,
          distanceToCompanionText: formattedDistance,
          estimatedArrival: map.formatEstimatedArrival(result.estimated_arrival)
        });

        // 更新地图标记
        this.updateMapMarkers(result.companion_location, null, null);

        return result;
      })
      .catch((err) => {
        const logger = require('../../../utils/logger');
        logger.error(logger.Categories.NETWORK, '获取搭子位置失败', err);
        throw err;
      });
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.stopLocationRefresh();
    this.page = null;
  }
}

module.exports = MapManager;
