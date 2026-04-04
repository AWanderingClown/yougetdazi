/**
 * 地图工具函数 - C端（客户）使用
 * 用于获取搭子位置、显示地图等
 */

const app = getApp();
const api = require('./api');
const { GEOGRAPHY, MAP_ZOOM_CONFIG } = require('./constants');

// 缓存地图Key
let mapKeyCache = null;
let mapKeyExpireTime = 0;

/**
 * 获取腾讯地图Key（从后端）
 * 带缓存，避免频繁请求
 */
function getMapKey() {
  return new Promise((resolve, reject) => {
    // 检查缓存是否有效（缓存23小时）
    if (mapKeyCache && Date.now() < mapKeyExpireTime) {
      resolve(mapKeyCache);
      return;
    }

    // 从后端获取
    app.request({
      url: '/api/config/map-key',
      method: 'GET',
      success: (res) => {
        if (res.code === 0 && res.data && res.data.key) {
          mapKeyCache = res.data.key;
          // 缓存时间使用常量控制（Key通常24小时过期，缓存23小时）
          mapKeyExpireTime = Date.now() + GEOGRAPHY.MAP_KEY_CACHE_DURATION_MS;
          resolve(mapKeyCache);
        } else {
          reject(new Error('获取地图Key失败'));
        }
      },
      fail: reject
    });
  });
}

/**
 * 获取搭子当前位置（C端调用）
 * @param {string} orderId - 订单ID
 */
function getCompanionLocation(orderId) {
  return new Promise((resolve, reject) => {
    app.request({
      url: api.orders.companionLocation(orderId),
      method: 'GET',
      success: (res) => {
        if (res.code === 0 && res.data) {
          resolve(res.data);
        } else {
          reject(new Error(res.message || '获取位置失败'));
        }
      },
      fail: reject
    });
  });
}

/**
 * 获取订单轨迹（用于显示路径）
 * @param {string} orderId - 订单ID
 */
function getOrderTrajectory(orderId) {
  return new Promise((resolve, reject) => {
    app.request({
      url: `/api/orders/${orderId}/trajectory`,
      method: 'GET',
      success: (res) => {
        if (res.code === 0) {
          resolve(res.data);
        } else {
          reject(new Error(res.message || '获取轨迹失败'));
        }
      },
      fail: reject
    });
  });
}

/**
 * 将轨迹点转换为地图markers
 * @param {Array} points - 轨迹点数组 [{latitude, longitude}]
 */
function convertToMapMarkers(points) {
  if (!points || points.length === 0) return [];

  return points.map((point, index) => ({
    id: index,
    latitude: point.latitude,
    longitude: point.longitude,
    iconPath: index === points.length - 1 ? '/assets/icons/companion-location.png' : '/assets/icons/path-point.png',
    width: index === points.length - 1 ? 30 : 10,
    height: index === points.length - 1 ? 30 : 10
  }));
}

/**
 * 将轨迹点转换为polyline
 * @param {Array} points - 轨迹点数组
 */
function convertToPolyline(points) {
  if (!points || points.length < 2) return [];

  return [{
    points: points.map(p => ({
      latitude: p.latitude,
      longitude: p.longitude
    })),
    color: '#7B68EE',
    width: 4,
    arrowLine: true
  }];
}

/**
 * 计算地图中心点和缩放级别
 * @param {Array} points - 轨迹点数组或两个位置点
 */
function calculateMapRegion(points) {
  if (!points || points.length === 0) {
    return {
      latitude: 39.90469,
      longitude: 116.40717,
      scale: 16
    };
  }

  // 计算边界
  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  points.forEach(p => {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  });

  // 中心点
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // 根据距离计算缩放级别（使用常量配置）
  const latDiff = maxLat - minLat;
  const lngDiff = maxLng - minLng;
  const maxDiff = Math.max(latDiff, lngDiff);

  // 按照MAP_ZOOM_CONFIG配置查找对应的缩放级别（从高精度到低精度递推）
  let scale = MAP_ZOOM_CONFIG[MAP_ZOOM_CONFIG.length - 1].zoomLevel;  // 默认值
  for (const config of MAP_ZOOM_CONFIG) {
    if (maxDiff > config.threshold) {
      scale = config.zoomLevel;
      break;
    }
  }

  return {
    latitude: centerLat,
    longitude: centerLng,
    scale: scale
  };
}

/**
 * 格式化距离显示
 * @param {number} meters - 距离（米）
 */
function formatDistance(meters) {
  if (meters < GEOGRAPHY.DISTANCE_DISPLAY_THRESHOLD) {
    return `${Math.round(meters)}米`;
  } else {
    return `${(meters / GEOGRAPHY.DISTANCE_DISPLAY_THRESHOLD).toFixed(1)}公里`;
  }
}

/**
 * 格式化预计到达时间
 * @param {string} isoTime - ISO格式时间字符串
 */
function formatEstimatedArrival(isoTime) {
  if (!isoTime) return '计算中...';

  const arrival = new Date(isoTime);

  // 检查是否为有效日期
  if (isNaN(arrival.getTime())) {
    const logger = require('./logger');
    logger.warn(logger.Categories.UI, '无效的预计到达时间:', isoTime);
    return '计算中...';
  }

  const now = new Date();
  const diffMinutes = Math.ceil((arrival - now) / (1000 * 60));

  if (diffMinutes <= 0) return '即将到达';
  if (diffMinutes < 60) return `预计${diffMinutes}分钟后到达`;

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `预计${hours}小时${minutes}分钟后到达`;
}

module.exports = {
  getMapKey,
  getCompanionLocation,
  getOrderTrajectory,
  convertToMapMarkers,
  convertToPolyline,
  calculateMapRegion,
  formatDistance,
  formatEstimatedArrival
};
