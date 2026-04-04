/**
 * 地图工具函数 - 通过后端API调用（不暴露Key）
 * 所有地图相关操作都通过后端代理，前端不再直接使用腾讯地图Key
 */

const app = getApp();

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
          // 缓存23小时（Key通常24小时过期）
          mapKeyExpireTime = Date.now() + 23 * 60 * 60 * 1000;
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
 * 上报位置到后端（B端使用，每5秒调用）
 * @param {string} orderId - 订单ID
 * @param {Object} location - {latitude, longitude, accuracy}
 */
function reportLocation(orderId, location) {
  return new Promise((resolve, reject) => {
    app.request({
      url: `/api/b/orders/${orderId}/location`,
      method: 'POST',
      data: {
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy || 0
        }
      },
      success: (res) => {
        if (res.code === 0) {
          resolve(res.data);
        } else {
          reject(new Error(res.message || '上报位置失败'));
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
      url: `/api/b/orders/${orderId}/trajectory`,
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
    iconPath: index === points.length - 1 ? '/assets/icons/current-location.png' : '/assets/icons/path-point.png',
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
    color: '#4A90E2',
    width: 4,
    arrowLine: true
  }];
}

/**
 * 计算地图中心点和缩放级别
 * @param {Array} points - 轨迹点数组
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

  // 根据距离计算缩放级别
  const latDiff = maxLat - minLat;
  const lngDiff = maxLng - minLng;
  const maxDiff = Math.max(latDiff, lngDiff);
  
  let scale = 16;
  if (maxDiff > 0.1) scale = 10;
  else if (maxDiff > 0.05) scale = 12;
  else if (maxDiff > 0.01) scale = 14;
  else if (maxDiff > 0.005) scale = 15;

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
  if (meters < 1000) {
    return `${Math.round(meters)}米`;
  } else {
    return `${(meters / 1000).toFixed(1)}公里`;
  }
}

/**
 * 格式化预计到达时间
 * @param {string} isoTime - ISO格式时间字符串
 */
function formatEstimatedArrival(isoTime) {
  if (!isoTime) return '计算中...';
  
  const arrival = new Date(isoTime);
  const now = new Date();
  const diffMinutes = Math.ceil((arrival - now) / (1000 * 60));
  
  if (diffMinutes <= 0) return '即将到达';
  if (diffMinutes < 60) return `预计${diffMinutes}分钟后到达`;
  
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `预计${hours}小时${minutes}分钟后到达`;
}

// 保留原有的辅助函数，但改为调用后端
/**
 * 逆地址解析：坐标转地址
 * 改为调用后端代理接口
 */
function reverseGeocode(latitude, longitude) {
  return new Promise((resolve, reject) => {
    app.request({
      url: `/api/map/reverse-geocode?lat=${latitude}&lng=${longitude}`,
      method: 'GET',
      success: (res) => {
        if (res.code === 0 && res.data) {
          resolve(res.data);
        } else {
          reject(new Error(res.message || '解析失败'));
        }
      },
      fail: reject
    });
  });
}

/**
 * 获取打开腾讯地图APP的链接
 */
function getNavigationUrl(latitude, longitude, name, address) {
  const encodedName = encodeURIComponent(name || '');
  const encodedAddress = encodeURIComponent(address || '');
  return `https://apis.map.qq.com/uri/v1/marker?marker=coord:${latitude},${longitude};title:${encodedName};addr:${encodedAddress}&referer=有个搭子`;
}

module.exports = {
  // 新增函数
  getMapKey,
  reportLocation,
  getOrderTrajectory,
  convertToMapMarkers,
  convertToPolyline,
  calculateMapRegion,
  formatEstimatedArrival,
  // 保留的原有函数
  reverseGeocode,
  formatDistance,
  getNavigationUrl
};
