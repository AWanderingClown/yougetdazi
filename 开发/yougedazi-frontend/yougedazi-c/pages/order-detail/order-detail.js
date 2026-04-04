// pages/order-detail/order-detail.js
const { ORDER_STATUS, CANCEL_RULE, TIMER, GEOGRAPHY, LBS } = require('../../utils/constants');
const api = require('../../utils/api');
const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 订单ID
    id: '',
    
    // 订单状态: pending_payment(待支付), pending_accept(待接单), accepted(已接单),
    // departed(搭子已出发), serving(服务中), completed(已完成), cancelled(已取消)
    // waiting_grab(等待抢单) - 悬赏订单特有
    status: 'serving',
    
    // 订单类型: normal(普通订单), reward(悬赏订单)
    orderType: 'normal',
    
    // 状态配置
    statusConfig: {
      pending_payment: {
        title: '待支付',
        desc: '请在15分钟内完成支付',
        icon: '⏳',
        bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      },
      pending_accept: {
        title: '待接单',
        desc: '正在为您匹配合适的搭子',
        icon: '🔄',
        bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      },
      waiting_grab: {
        title: '等待抢单',
        desc: '悬赏已发布，等待搭子抢单',
        icon: '📢',
        bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      },
      accepted: {
        title: '搭子正在赶来',
        desc: '搭子已接单，正在前往服务地点',
        icon: '🚗',
        bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      },
      departed: {
        title: '搭子已出发',
        desc: '搭子正在前往服务地点，请耐心等待',
        icon: '🚗',
        bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      },
      serving: {
        title: '服务进行中',
        desc: '搭子正在为您提供服务',
        icon: '✨',
        bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      },
      completed: {
        title: '已完成',
        desc: '订单已完成，感谢使用',
        icon: '🎉',
        bgColor: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'
      },
      cancelled: {
        title: '已取消',
        desc: '订单已取消',
        icon: '❌',
        bgColor: 'linear-gradient(135deg, #A8D8FF 0%, #D4A5FF 100%)'
      }
    },
    
    // 支付倒计时
    payCountdown: '29:59',
    payCountdownTimer: null,
    
    // 抢单倒计时（悬赏订单）
    grabCountdown: '30:00',
    grabCountdownTimer: null,
    
    // 搭子信息
    companionInfo: {
      id: 'companion_001',
      nickname: '小雨同学',
      avatar: '/assets/images/avatar-default.png',
      gender: 'female',
      age: 22,
      tags: ['声音甜美', '温柔体贴', '游戏高手'],
      distance: 2.5,
      estimatedArrival: '15:30',
      location: {
        longitude: 116.397428,
        latitude: 39.90923
      }
    },
    
    // 地图相关
    mapKey: '',                  // 腾讯地图Key（从后端获取）
    mapCenter: {
      longitude: 116.397428,
      latitude: 39.90923
    },
    mapScale: 14,
    markers: [],
    polyline: [],
    
    // 搭子位置刷新
    companionLocation: null,      // 搭子当前位置
    distanceToCompanion: 0,       // 距离搭子（米）
    distanceToCompanionText: '',  // 格式化后的距离显示
    estimatedArrival: '',         // 预计到达时间
    companionLocationRefreshTimer: null,  // 位置刷新定时器
    
    // 服务计时器
    serviceTimer: {
      hours: '00',
      minutes: '00',
      seconds: '00'
    },
    serviceTimerInterval: null,
    serviceProgress: 0,
    remainingTimeText: '2小时',
    showRenewalHint: false,
    serviceStartTime: null,
    serviceTotalDuration: 7200000, // 2小时，单位毫秒
    serviceRemainingTime: 7200000,
    canCancelInService: true, // 服务中是否可以取消（≤15分钟可以）
    serviceElapsedMinutes: 0, // 已服务分钟数
    acceptWithin2Minutes: true, // 是否在接单后2分钟内
    
    // 订单信息
    orderInfo: {
      orderNo: 'PP202603120001',
      createdAt: '2026-03-12 12:00:00',
      paidAt: '2026-03-12 12:05:30',
      serviceType: '游戏搭子 - 王者荣耀',
      duration: 2,
      appointmentTime: '2026-03-12 14:00:00',
      address: '北京市朝阳区三里屯SOHO A座 1201室',
      servicePrice: 200,
      totalAmount: 200,
      hasReviewed: false,
      cancelReason: '',
      cancelledAt: ''
    },
    
    // 取消订单弹窗
    showCancelModal: false,
    cancelReasons: [
      '临时有事，不需要服务了',
      '等待时间太长',
      '价格不合适',
      '更换了其他平台',
      '其他原因'
    ],
    selectedCancelReason: '',
    
    // 提示
    showUrgeToast: false,
    
    // 评价相关
    rating: 0,
    ratingText: '请点击星星进行评分',
    reviewContent: '',
    starList: [1, 2, 3, 4, 5],
    quickTags: [
      { text: '服务态度好', selected: false },
      { text: '准时到达', selected: false },
      { text: '技能专业', selected: false },
      { text: '沟通顺畅', selected: false },
      { text: '形象气质佳', selected: false }
    ],

    // 订单状态时间轴
    timeLine: []
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    const { id, status } = options;

    this.setData({
      id: id || 'order_001',
      status: status || 'serving'
    });

    // 加入订单 Room，接收实时推送
    if (id) {
      const socket = getApp().globalData.socket;
      if (socket) socket.emit('join:order', id);
    }

    // 加载地图Key
    this.loadMapKey();

    // 先加载订单详情，加载完成后再初始化
    // initByStatus 会在 loadOrderDetail 中被调用
    this.loadOrderDetail();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 页面显示时，如果已经有数据且计时器未启动，重新启动计时器
    const { status } = this.data;

    // 先清理可能存在的旧计时器，避免重复创建
    this.stopTimers();

    // 如果页面返回后服务仍在进行中，重新启动UI倒计时（从Redis拉取权威时间）
    if (status === ORDER_STATUS.SERVING) {
      this.startServiceTimerDisplay();
    } else if (status === ORDER_STATUS.PENDING_PAYMENT) {
      this.startPayCountdown();
    }
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 停止所有计时器
    this.stopTimers();
    // 停止位置更新
    this.stopLocationUpdate();
    // 离开订单 Room
    const socket = getApp().globalData.socket;
    if (socket && this.data.id) {
      socket.emit('leave:order', this.data.id);
    }
  },

  /**
   * 加载地图Key
   */
  loadMapKey() {
    const map = require('../../utils/map');
    map.getMapKey()
      .then((key) => {
        this.setData({ mapKey: key });
      })
      .catch((err) => {
        const logger = require('../../utils/logger');
        logger.error(logger.Categories.UI, '获取地图Key失败', err);
      });
  },

  /**
   * 启动搭子位置刷新（每30秒）
   */
  startCompanionLocationRefresh() {
    // 先清除已有定时器，避免重复创建
    if (this.data.companionLocationRefreshTimer) {
      clearInterval(this.data.companionLocationRefreshTimer);
    }

    // 先刷新一次
    this.refreshCompanionLocation();

    // 每30秒刷新一次位置（上报到后端，由后端计算距离和判断到达状态）
    const timer = setInterval(() => {
      // 检查订单状态，如果已经不是进行中的状态则停止刷新
      const currentStatus = this.data.status;
      if (currentStatus !== 'accepted' && currentStatus !== 'serving') {
        clearInterval(timer);
        this.setData({ companionLocationRefreshTimer: null });
        return;
      }
      this.refreshCompanionLocation();
    }, LBS.UPDATE_INTERVAL);

    this.setData({ companionLocationRefreshTimer: timer });
  },

  /**
   * 刷新搭子位置
   */
  refreshCompanionLocation() {
    const map = require('../../utils/map');
    const orderId = this.data.id;

    if (!orderId) return;

    map.getCompanionLocation(orderId)
      .then((result) => {
        // 格式化距离显示（超过1000米显示为公里）
        const distance = result.distance_to_client;
        const formattedDistance = map.formatDistance(distance);

        // 更新搭子位置信息
        this.setData({
          companionLocation: result.companion_location,
          distanceToCompanion: distance,
          distanceToCompanionText: formattedDistance,
          estimatedArrival: map.formatEstimatedArrival(result.estimated_arrival)
        });

        // 更新地图标记
        this.updateMapMarkers();
      })
      .catch((err) => {
        const logger = require('../../utils/logger');
        logger.error(logger.Categories.NETWORK, '获取搭子位置失败', err);
      });
  },

  /**
   * 更新地图标记
   */
  updateMapMarkers() {
    const { companionLocation, orderInfo } = this.data;

    if (!companionLocation) return;

    // 目的地位置（客户位置）- 从订单信息中获取实际坐标
    const targetLocation = {
      longitude: orderInfo?.addressLongitude || orderInfo?.longitude || 116.397428,
      latitude: orderInfo?.addressLatitude || orderInfo?.latitude || 39.90923
    };

    const markers = [
      {
        id: 1,
        longitude: companionLocation.longitude,
        latitude: companionLocation.latitude,
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
        longitude: targetLocation.longitude,
        latitude: targetLocation.latitude,
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

    this.setData({ markers });
  },

  /**
   * 根据状态初始化页面
   */
  initByStatus() {
    const { status, orderType, serviceStartTime, orderInfo } = this.data;

    switch(status) {
      case 'pending_payment':
        this.startPayCountdown();
        break;
      case 'pending_accept':
        // 待接单状态：等待搭子接单，无需额外计时器，页面显示等待动画
        break;
      case 'accepted':
      case 'departed':
        this.initMap();
        this.startCompanionLocationRefresh();  // 启动位置刷新
        this.checkAcceptTime();
        break;
      case 'serving':
        // 服务中状态，统一使用initServiceTimer处理
        this.initServiceTimer();
        this.initMap();
        break;
      case 'waiting_grab':
        // 悬赏订单等待抢单状态，启动倒计时
        this.initGrabCountdown();
        break;
      default:
        break;
    }
  },

  /**
   * 检查是否在接单后2分钟内
   */
  checkAcceptTime() {
    const { orderInfo, status } = this.data;
    if (status !== 'accepted' || !orderInfo.acceptedAt) {
      this.setData({ acceptWithin2Minutes: false });
      return;
    }
    
    const acceptedAt = new Date(orderInfo.acceptedAt).getTime();
    const now = Date.now();
    const acceptWithin2Minutes = (now - acceptedAt) < CANCEL_RULE.TWO_MINUTES;
    
    this.setData({ acceptWithin2Minutes });
    
    // 如果在2分钟内，设置定时器2分钟后更新状态
    if (acceptWithin2Minutes) {
      const remainingTime = CANCEL_RULE.TWO_MINUTES - (now - acceptedAt);
      setTimeout(() => {
        this.setData({ acceptWithin2Minutes: false });
      }, remainingTime);
    }
  },

  /**
   * 启动所有计时器（仅在页面加载完成后调用）
   */
  startTimers() {
    const { status, serviceTimerInterval, payCountdownTimer, grabCountdownTimer } = this.data;
    
    // 避免重复启动计时器
    if (status === ORDER_STATUS.PENDING_PAYMENT && !payCountdownTimer) {
      this.startPayCountdown();
    } else if (status === ORDER_STATUS.SERVING && !serviceTimerInterval) {
      this.startServiceTimer();
    } else if (status === ORDER_STATUS.WAITING_GRAB && !grabCountdownTimer) {
      this.initGrabCountdown();
    }
  },

  /**
   * 停止所有计时器
   */
  stopTimers() {
    if (this.data.payCountdownTimer) {
      clearInterval(this.data.payCountdownTimer);
    }
    if (this.data.serviceTimerInterval) {
      clearInterval(this.data.serviceTimerInterval);
    }
    if (this.data.grabCountdownTimer) {
      clearInterval(this.data.grabCountdownTimer);
    }
    if (this.data.companionLocationRefreshTimer) {
      clearInterval(this.data.companionLocationRefreshTimer);
    }
  },

  /**
   * 停止位置更新
   */
  stopLocationUpdate() {
    // 位置更新定时器已在 stopTimers 中处理
    // 此方法用于兼容 onUnload 中的调用
    if (this.data.companionLocationRefreshTimer) {
      clearInterval(this.data.companionLocationRefreshTimer);
      this.setData({ companionLocationRefreshTimer: null });
    }
  },

  /**
   * 生成订单状态时间轴
   */
  generateTimeLine(order) {
    const timeLine = [];
    const statusMap = {
      'pending_payment': { text: '订单创建', icon: '📝' },
      'paid': { text: '支付成功', icon: '💰' },
      'pending_accept': { text: '等待接单', icon: '⏳' },
      'accepted': { text: '搭子已接单', icon: '✅' },
      'departed': { text: '搭子已出发', icon: '🚗' },
      'serving': { text: '服务进行中', icon: '✨' },
      'completed': { text: '订单完成', icon: '🎉' },
      'cancelled': { text: '订单已取消', icon: '❌' }
    };

    // 根据订单状态和时间生成时间轴
    if (order.created_at) {
      timeLine.push({
        status: 'created',
        text: '订单创建',
        icon: '📝',
        time: this.formatTime(order.created_at),
        isActive: true
      });
    }

    if (order.payment_records && order.payment_records.length > 0) {
      const paidRecord = order.payment_records.find(r => r.status === 'paid');
      if (paidRecord) {
        timeLine.push({
          status: 'paid',
          text: '支付成功',
          icon: '💰',
          time: this.formatTime(paidRecord.pay_time),
          isActive: true
        });
      }
    }

    if (order.operation_logs) {
      // 按时间排序
      const sortedLogs = order.operation_logs.sort((a, b) => {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      sortedLogs.forEach(log => {
        if (statusMap[log.action]) {
          timeLine.push({
            status: log.action,
            text: statusMap[log.action].text,
            icon: statusMap[log.action].icon,
            time: this.formatTime(log.created_at),
            isActive: true
          });
        }
      });
    }

    // 根据当前状态高亮最后一个节点
    if (timeLine.length > 0) {
      const currentStatusIndex = timeLine.findIndex(item => item.status === order.status);
      if (currentStatusIndex >= 0) {
        timeLine[currentStatusIndex].isCurrent = true;
      }
    }

    this.setData({ timeLine });
  },

  /**
   * 格式化时间
   */
  formatTime(timeStr) {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}月${day}日 ${hour}:${minute}`;
  },

  /**
   * 加载订单详情
   */
  loadOrderDetail() {
    const id = this.data.id;
    if (!id) {
      wx.showToast({ title: '订单ID无效', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '加载中' });
    const app = getApp();

    app.request({ url: api.orders.detail(id) })
      .then(res => {
        wx.hideLoading();
        const order = res.data;
        if (!order) {
          wx.showToast({ title: '订单不存在', icon: 'none' });
          setTimeout(() => { wx.navigateBack(); }, 1500);
          return;
        }

        // 找已接单时间（operation_logs 中 action === 'accepted'）
        const acceptedLog = (order.operation_logs || []).find(l => l.action === 'accepted');
        const paidRecord  = (order.payment_records || []).find(r => r.status === 'paid');

        const companionInfo = {
          id:               order.companion?.id || '',
          nickname:         order.companion?.nickname || '等待接单',
          avatar:           order.companion?.avatar || '/assets/images/avatar-default.png',
          gender:           'unknown',
          age:              0,
          tags:             [],
          distance:         0,
          estimatedArrival: '',
          location: { longitude: 116.397428, latitude: 39.90923 }
        };

        const orderInfo = {
          orderNo:         order.order_no,
          createdAt:       order.created_at ? order.created_at.slice(0, 19).replace('T', ' ') : '',
          paidAt:          paidRecord?.pay_time ? paidRecord.pay_time.slice(0, 19).replace('T', ' ') : '',
          acceptedAt:      acceptedLog?.created_at || '',
          serviceType:     order.service_name,
          duration:        order.duration,
          appointmentTime: order.service_start_at ? order.service_start_at.slice(0, 16).replace('T', ' ') : '',
          address:         order.user_remark || '',
          servicePrice:    (order.total_amount || 0) / 100,
          totalAmount:     (order.total_amount || 0) / 100,
          hasReviewed:     false,
          cancelReason:    order.cancel_reason || '',
          cancelledAt:     order.cancelled_at ? order.cancelled_at.slice(0, 19).replace('T', ' ') : ''
        };

        this.setData({
          id:               order.id || '',
          status:           order.status || 'pending_payment',
          orderType:        order.order_type === 'reward' ? 'reward' : 'normal',
          companionInfo,
          orderInfo,
          serviceStartTime:    order.service_start_at ? new Date(order.service_start_at).getTime() : null,
          paymentDeadlineMs:   order.payment_deadline ? new Date(order.payment_deadline).getTime() : null,
          acceptDeadlineMs:    order.accept_deadline  ? new Date(order.accept_deadline).getTime()  : null,
        });

        // 生成订单状态时间轴
        this.generateTimeLine(order);

        this.initByStatus();
        this.checkAcceptTime();
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      });
  },

  /**
   * 启动支付倒计时
   * 使用后端返回的 payment_deadline 计算剩余时间，防止页面刷新后重置
   */
  startPayCountdown() {
    if (this.data.payCountdownTimer) {
      clearInterval(this.data.payCountdownTimer);
    }

    const deadline = this.data.paymentDeadlineMs || (Date.now() + TIMER.PAY_COUNTDOWN * 1000);
    let remainingSeconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));

    if (remainingSeconds <= 0) {
      this.autoCancelOrder();
      return;
    }

    const tick = () => {
      remainingSeconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      this.setData({
        payCountdown: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      });
      if (remainingSeconds <= 0) {
        clearInterval(this.data.payCountdownTimer);
        this.autoCancelOrder();
      }
    };

    tick();
    const timer = setInterval(tick, TIMER.UI_TICK_INTERVAL_MS);
    this.setData({ payCountdownTimer: timer });
  },

  /**
   * 初始化抢单倒计时（悬赏订单）
   */
  initGrabCountdown() {
    // 清除已有的计时器
    if (this.data.grabCountdownTimer) {
      clearInterval(this.data.grabCountdownTimer);
    }
    
    // 计算剩余时间（从订单创建时间开始30分钟）
    const { orderInfo } = this.data;
    const createdAt = new Date(orderInfo.createdAt).getTime();
    const endTime = createdAt + CANCEL_RULE.THIRTY_MINUTES; // 使用常量：30分钟后
    let remainingSeconds = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    
    const timer = setInterval(() => {
      remainingSeconds--;
      
      if (remainingSeconds <= 0) {
        clearInterval(timer);
        // 倒计时结束，自动取消并退款
        this.autoCancelRewardOrder();
        return;
      }
      
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      
      this.setData({
        grabCountdown: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      });
    }, TIMER.UI_TICK_INTERVAL_MS);
    
    this.setData({ 
      grabCountdownTimer: timer,
      grabCountdown: `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`
    });
  },

  /**
   * 悬赏单倒计时归零时的处理
   * 超时取消由后端 BullMQ AcceptTimeout Job 触发，Socket 推送状态变更
   * 前端倒计时结束只需提示用户等待
   */
  autoCancelRewardOrder() {
    wx.showToast({ title: '等待系统处理...', icon: 'none' });
    // 后端 BullMQ Job 会自动取消订单并退款，Socket 会推送状态变更到此页面
    // 主动刷新一次，确保显示最新状态
    setTimeout(() => { this.loadOrderDetail(); }, 2000);
  },

  /**
   * 初始化地图
   */
  initMap() {
    const { companionInfo, orderInfo, companionLocation: realCompanionLocation } = this.data;

    // 使用真实的搭子位置（如果已获取）或默认值
    const companionLoc = realCompanionLocation || {
      longitude: 116.387428,
      latitude: 39.91923
    };

    // 用户位置（目的地）- 从订单信息中获取实际地址的坐标
    const userLocation = {
      longitude: orderInfo?.addressLongitude || orderInfo?.longitude || 116.397428,
      latitude: orderInfo?.addressLatitude || orderInfo?.latitude || 39.90923
    };

    // 设置地图中心点（两点中间）
    this.setData({
      mapCenter: {
        longitude: (userLocation.longitude + companionLoc.longitude) / 2,
        latitude: (userLocation.latitude + companionLoc.latitude) / 2
      },
      mapScale: 13
    });

    // 设置标记点
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

    this.setData({ markers, polyline });
  },

  /**
   * 初始化服务计时器 - 仅在没有设置serviceStartTime时使用
   */
  initServiceTimer() {
    const { serviceStartTime, orderInfo } = this.data;
    
    // 如果已经有serviceStartTime，直接启动计时器
    if (serviceStartTime) {
      this.startServiceTimer();
      return;
    }
    
    // 尝试从orderInfo获取
    if (orderInfo && orderInfo.serviceStartTime) {
      this.setData({
        serviceStartTime: new Date(orderInfo.serviceStartTime).getTime()
      }, () => {
        this.startServiceTimer();
      });
      return;
    }
    
    // 兜底：使用默认时间（仅用于开发测试）
    const logger = require('../../utils/logger');
    logger.warn(logger.Categories.ORDER, '未设置serviceStartTime，使用默认时间');
    const startTime = Date.now() - 10 * 60 * 1000; // 默认10分钟前（用于测试≤15分钟逻辑）
    const totalDuration = (orderInfo && orderInfo.duration ? orderInfo.duration : 2) * 60 * 60 * 1000;
    
    this.setData({
      serviceStartTime: startTime,
      serviceTotalDuration: totalDuration,
      serviceRemainingTime: totalDuration - (Date.now() - startTime)
    }, () => {
      this.startServiceTimer();
    });
  },

  /**
   * 启动服务计时器 - 倒计时模式
   * 后端计时由 B端调用 /api/b/orders/:id/start 时触发，这里只需启动UI显示
   */
  startServiceTimer() {
    this.startServiceTimerDisplay();
  },

  // 从 Redis 权威时间源获取剩余时间，本地每秒递减，每10秒向后端校准一次
  startServiceTimerDisplay() {
    const id = this.data.id;
    const totalDuration = this.data.serviceTotalDuration || (this.data.orderInfo?.duration || 2) * 3600000;

    if (this.data.serviceTimerInterval) {
      clearInterval(this.data.serviceTimerInterval);
    }

    let localRemainingMs = totalDuration;
    let pollCount = 0;

    const fetchAndSync = () => {
      app.request({ url: api.orders.timer(id) }).then((res) => {
        if (res && res.data && res.data.remaining_seconds != null) {
          localRemainingMs = res.data.remaining_seconds * 1000;
        }
      }).catch(() => {});
    };

    fetchAndSync(); // 立即拉取一次

    const updateTimer = () => {
      pollCount++;
      if (pollCount % TIMER.BACKEND_SYNC_INTERVAL_SEC === 0) fetchAndSync(); // 按周期向后端校准

      localRemainingMs = Math.max(0, localRemainingMs - TIMER.UI_TICK_INTERVAL_MS);
      const remaining = localRemainingMs;

      if (remaining <= 0 && this.data.status === ORDER_STATUS.SERVING) {
        clearInterval(this.data.serviceTimerInterval);
        this.setData({ serviceTimerInterval: null });
        this.onServiceEnd();
        return;
      }

      // 倒计时显示（显示剩余时间）
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      // 计算进度（已进行的比例）
      const elapsed = totalDuration - remaining;
      const progress = Math.min(100, Math.floor((elapsed / totalDuration) * 100));

      // 计算剩余时间文本
      const remainingHours = Math.floor(remaining / 3600000);
      const remainingMinutes = Math.floor((remaining % 3600000) / 60000);
      let remainingText = '';
      if (remainingHours > 0) {
        remainingText = `${remainingHours}小时${remainingMinutes}分钟`;
      } else {
        remainingText = `${remainingMinutes}分钟`;
      }

      // 判断是否可以取消服务（≤15分钟可以取消，>15分钟不能取消）
      const canCancelInService = elapsed <= CANCEL_RULE.FIFTEEN_MINUTES;
      const serviceElapsedMinutes = Math.floor(elapsed / 60000);

      this.setData({
        serviceTimer: {
          hours: String(hours).padStart(2, '0'),
          minutes: String(minutes).padStart(2, '0'),
          seconds: String(seconds).padStart(2, '0')
        },
        serviceProgress: progress,
        remainingTimeText: remainingText,
        showRenewalHint: remaining < CANCEL_RULE.FIFTEEN_MINUTES,
        canCancelInService,
        serviceElapsedMinutes
      });
    };

    updateTimer(); // 立即执行一次
    const timer = setInterval(updateTimer, TIMER.UI_TICK_INTERVAL_MS);
    this.setData({ serviceTimerInterval: timer });
  },

  /**
   * 服务结束处理 - 倒计时结束调用后端完成接口
   */
  onServiceEnd() {
    // 先调用后端完成接口
    app.request({
      url: api.orders.complete(this.data.id),
      method: 'POST'
    }).then(() => {
      wx.showModal({
        title: '服务已结束',
        content: '服务时间已用完，是否需要续费？',
        confirmText: '立即续费',
        cancelText: '结束服务',
        success: (res) => {
          if (res.confirm) {
            this.onRenewal();
          } else {
            // 同步更新 direct_orders 本地存储，防止重开 APP 后状态不同步
            const directOrders = wx.getStorageSync('direct_orders') || [];
            const updated = directOrders.map(o =>
              o.id === this.data.id ? { ...o, status: 'completed' } : o
            );
            wx.setStorageSync('direct_orders', updated);

            this.setData({
              status: 'completed',
              'orderInfo.hasReviewed': false
            });
          }
        }
      });
    }).catch(err => {
      wx.showToast({
        title: err?.message || '服务结束处理失败',
        icon: 'none'
      });
    });
  },

  /**
   * 复制订单号
   */
  onCopyOrderNo() {
    wx.setClipboardData({
      data: this.data.orderInfo.orderNo,
      success: () => {
        wx.showToast({
          title: '已复制',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 立即支付
   */
  onPay() {
    const orderId = this.data.id;
    wx.showLoading({ title: '获取支付信息...' });

    app.request({ url: api.orders.pay(orderId), method: 'POST' })
      .then(res => {
        wx.hideLoading();
        const { payment_params } = res.data;
        wx.requestPayment({
          ...payment_params,
          success: () => {
            wx.showToast({ title: '支付成功', icon: 'success' });
            setTimeout(() => { this.loadOrderDetail(); }, 1500);
          },
          fail: (err) => {
            if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
              wx.showToast({ title: '支付失败', icon: 'none' });
            }
          }
        });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err?.message || '获取支付信息失败', icon: 'none' });
      });
  },

  /**
   * 显示取消订单弹窗
   */
  onCancelOrder() {
    this.setData({
      showCancelModal: true,
      selectedCancelReason: ''
    });
  },

  /**
   * 隐藏取消订单弹窗
   */
  hideCancelModal() {
    this.setData({ showCancelModal: false });
  },

  /**
   * 选择取消原因
   */
  onCancelReasonChange(e) {
    this.setData({ selectedCancelReason: e.detail.value });
  },

  /**
   * 确认取消订单 - 查询服务端退款预览后显示确认
   */
  confirmCancelOrder() {
    const { selectedCancelReason } = this.data;
    
    if (!selectedCancelReason) {
      wx.showToast({ title: '请选择取消原因', icon: 'none' });
      return;
    }
    
    this.hideCancelModal();
    
    const orderId = this.data.id;
    wx.showLoading({ title: '查询退款信息...' });
    
    // 调用后端取消预览接口获取准确的退款信息
    app.request({
      url: api.orders.cancelPreview(orderId),
      method: 'GET'
    }).then(res => {
      wx.hideLoading();
      const { can_cancel, refund_amount, cancel_reason } = res.data || {};
      
      if (!can_cancel) {
        wx.showModal({
          title: '无法取消',
          content: cancel_reason || '当前状态不支持取消，如有问题请联系客服',
          showCancel: false,
          confirmText: '我知道了'
        });
        return;
      }
      
      // 显示退款确认弹窗
      const refundText = refund_amount > 0 
        ? `\n\n退款金额：¥${(refund_amount / 100).toFixed(2)}`
        : '\n\n取消后无退款';
      
      wx.showModal({
        title: '确认取消订单',
        content: `${cancel_reason}${refundText}`,
        confirmText: '确认取消',
        confirmColor: '#f44336',
        success: (modalRes) => {
          if (modalRes.confirm) {
            this.executeCancel();
          }
        }
      });
    }).catch(err => {
      wx.hideLoading();
      const logger = require('../../utils/logger');
      logger.error(logger.Categories.ORDER, '查询退款信息失败:', err);
      wx.showToast({ 
        title: err?.message || '查询失败，请重试', 
        icon: 'none' 
      });
    });
  },
  
  /**
   * 执行取消 —— 调后端取消接口，等 Socket 推送刷新 UI
   */
  executeCancel() {
    const orderId = this.data.id;
    wx.showLoading({ title: '处理中...' });

    app.request({
      url: api.orders.cancel(orderId),
      method: 'POST',
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '取消成功', icon: 'success' });
      // 后端会通过 Socket 推送 order:status_changed，UI 自动刷新
      // 同时重新拉一次详情，保证数据最新
      setTimeout(() => { this.loadOrderDetail(); }, 800);
    }).catch((err) => {
      wx.hideLoading();
      wx.showToast({ title: err?.message || '取消失败，请重试', icon: 'none' });
    });
  },

  /**
   * 自动取消订单（支付超时）
   */
  autoCancelOrder() {
    this.setData({
      status: 'cancelled',
      'orderInfo.cancelReason': '支付超时，系统自动取消',
      'orderInfo.cancelledAt': this.formatTime(new Date())
    });
    
    wx.showToast({
      title: '订单已超时取消',
      icon: 'none'
    });
  },

  /**
   * 换一换 - 更换搭子
   */
  onChangeCompanion() {
    wx.showModal({
      title: '确认更换搭子',
      content: '更换后当前搭子将失效，系统会为您重新匹配，是否继续？',
      confirmText: '确认更换',
      confirmColor: '#667eea',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '更换中...' });
          app.request({ url: api.orders.changeCompanion(this.data.id), method: 'POST' })
            .then(() => {
              wx.hideLoading();
              wx.showToast({ title: '已更换，重新匹配中', icon: 'success' });
              setTimeout(() => { this.loadOrderDetail(); }, 1500);
            })
            .catch(err => {
              wx.hideLoading();
              wx.showToast({ title: err?.message || '更换失败', icon: 'none' });
            });
        }
      }
    });
  },

  /**
   * 服务结束 - 用户提前结束服务
   */
  onEndService() {
    const { serviceElapsedMinutes } = this.data;
    
    wx.showModal({
      title: '确认结束服务',
      content: `服务已进行${serviceElapsedMinutes}分钟，确认提前结束吗？`,
      confirmText: '确认结束',
      confirmColor: '#667eea',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          app.request({ url: api.orders.complete(this.data.id), method: 'POST' })
            .then(() => {
              wx.hideLoading();
              if (this.data.serviceTimerInterval) {
                clearInterval(this.data.serviceTimerInterval);
              }
              wx.showToast({ title: '服务已结束', icon: 'success' });
              setTimeout(() => { this.loadOrderDetail(); }, 1500);
            })
            .catch(err => {
              wx.hideLoading();
              wx.showToast({ title: err?.message || '操作失败', icon: 'none' });
            });
        }
      }
    });
  },

  /**
   * 催一催
   */
  onUrge() {
    if (this.data.showUrgeToast) return;
    this.setData({ showUrgeToast: true });
    app.request({ url: api.orders.urge(this.data.id), method: 'POST' })
      .catch(() => {});
    wx.showToast({ title: '已提醒搭子加快进度', icon: 'none', duration: 2000 });
    setTimeout(() => { this.setData({ showUrgeToast: false }); }, 2000);
  },

  /**
   * 聊天
   */
  onChat() {
    const { id, companionInfo } = this.data;
    const companion = companionInfo;
    
    wx.navigateTo({
      url: `/pages/chat/chat?id=${id}&companionId=${companion.id}&nickname=${encodeURIComponent(companion.nickname)}`
    });
  },

  /**
   * 联系客服
   */
  onContactService() {
    wx.showActionSheet({
      itemList: ['在线客服', '客服电话'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 在线客服
          wx.showToast({ title: '正在连接客服...', icon: 'none' });
        } else {
          // 拨打电话
          const config = require('../../config/backend-config.js');
          wx.makePhoneCall({
            phoneNumber: config.customerService.phone
          });
        }
      }
    });
  },

  /**
   * 取消悬赏订单
   */
  onCancelReward() {
    wx.showModal({
      title: '确认取消',
      content: '取消后悬赏将下架，资金将原路退回，是否继续？',
      confirmColor: '#f44336',
      success: (res) => {
        if (res.confirm) {
          // 更新订单状态
          const rewardOrders = wx.getStorageSync('reward_orders') || [];
          const updatedOrders = rewardOrders.map(order => {
            if (order.id === this.data.id) {
              return {
                ...order,
                status: 'cancelled',
                cancelReason: '用户主动取消悬赏'
              };
            }
            return order;
          });
          wx.setStorageSync('reward_orders', updatedOrders);
          
          this.setData({
            status: 'cancelled'
          });
          
          wx.showToast({
            title: '已取消，资金将原路退回',
            icon: 'none',
            duration: 2000
          });
        }
      }
    });
  },

  /**
   * 请求提前结束（服务中取消）
   * 调用后端 /cancel-preview 接口获取退款信息后确认
   */
  onRequestEnd() {
    const orderId = this.data.id;
    wx.showLoading({ title: '查询退款信息...' });
    
    // 调用后端取消预览接口获取准确的退款信息
    app.request({
      url: api.orders.cancelPreview(orderId),
      method: 'GET'
    }).then(res => {
      wx.hideLoading();
      const { can_cancel, refund_amount, cancel_reason } = res.data || {};
      
      if (!can_cancel) {
        wx.showModal({
          title: '无法取消',
          content: cancel_reason || '当前状态不支持取消，如有问题请联系客服',
          showCancel: false,
          confirmText: '我知道了'
        });
        return;
      }
      
      // 显示退款确认弹窗
      const refundText = refund_amount > 0 
        ? `\n\n退款金额：¥${(refund_amount / 100).toFixed(2)}`
        : '\n\n取消后无退款';
      
      wx.showModal({
        title: '确认取消订单',
        content: `${cancel_reason}${refundText}`,
        confirmText: '确认取消',
        cancelText: '再想想',
        confirmColor: '#f44336',
        success: (modalRes) => {
          if (modalRes.confirm) {
            this.executeServiceCancel();
          }
        }
      });
    }).catch(err => {
      wx.hideLoading();
      const logger = require('../../utils/logger');
      logger.error(logger.Categories.ORDER, '查询退款信息失败:', err);
      wx.showToast({ 
        title: err?.message || '查询失败，请重试', 
        icon: 'none' 
      });
    });
  },

  /**
   * 执行服务中取消（扣款50元）—— 调取消接口，由后端计算退款
   */
  executeServiceCancel() {
    wx.showLoading({ title: '处理中...' });
    app.request({ url: api.orders.cancel(this.data.id), method: 'POST' })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '订单已取消', icon: 'success' });
        setTimeout(() => { this.loadOrderDetail(); }, 800);
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err?.message || '取消失败', icon: 'none' });
      });
  },

  /**
   * 确认完成并提交评价 —— 调后端 POST /api/c/orders/:id/review
   */
  onConfirmComplete() {
    const { rating, reviewContent, quickTags, id } = this.data;

    if (rating === 0) {
      wx.showToast({ title: '请先进行星级评分', icon: 'none' });
      return;
    }

    const selectedTags = quickTags.filter(t => t.selected).map(t => t.text);

    wx.showLoading({ title: '提交中...' });

    app.request({
      url: api.orders.review(id),
      method: 'POST',
      data: { rating, content: reviewContent, tags: selectedTags },
    }).then(() => {
      wx.hideLoading();
      this.setData({ 'orderInfo.hasReviewed': true });
      wx.showToast({ title: '评价提交成功', icon: 'success' });
    }).catch((err) => {
      wx.hideLoading();
      wx.showToast({ title: err?.message || '提交失败，请重试', icon: 'none' });
    });
  },

  /**
   * 续费 —— 调后端创建续费订单，拉起微信支付
   */
  onRenewal() {
    const orderId = this.data.id;
    const currentDuration = Math.floor(this.data.orderInfo?.duration || 0);
    const maxDuration = 24;
    const remainingHours = Math.max(0, maxDuration - currentDuration);
    
    if (remainingHours <= 0) {
      wx.showToast({ title: '已达到最大时长限制', icon: 'none' });
      return;
    }
    
    const hoursOptions = Array.from({length: remainingHours}, (_, i) => i + 1);
    const itemList = hoursOptions.map(h => `续费${h}小时`);
    wx.showActionSheet({
      itemList,
      success: (res) => {
        const addedHours = hoursOptions[res.tapIndex];
        
        // 再次校验累计时长
        if (currentDuration + addedHours > maxDuration) {
          wx.showToast({ title: '超过最大时长限制', icon: 'none' });
          return;
        }

        wx.showModal({
          title: '确认续费',
          content: `续费${addedHours}小时，费用由后端按时薪计算`,
          success: (modalRes) => {
            if (!modalRes.confirm) return;
            wx.showLoading({ title: '创建续费订单...' });

            app.request({
              url: api.orders.renew(orderId),
              method: 'POST',
              data: { added_hours: addedHours },
            }).then((res) => {
              wx.hideLoading();
              const { payment_params } = res.data;
              wx.requestPayment({
                ...payment_params,
                success: () => {
                  wx.showToast({ title: '支付成功，续费处理中', icon: 'success' });
                  // 支付成功后等 webhook 回调更新状态
                  setTimeout(() => { this.loadOrderDetail(); }, 2000);
                },
                fail: (err) => {
                  if (err.errMsg && err.errMsg.includes('cancel')) {
                    wx.showToast({ title: '已取消支付', icon: 'none' });
                  } else {
                    wx.showToast({ title: '支付失败，请重试', icon: 'none' });
                  }
                },
              });
            }).catch((err) => {
              wx.hideLoading();
              wx.showToast({ title: err?.message || '创建续费订单失败', icon: 'none' });
            });
          },
        });
      },
    });
  },

  /**
   * 再次下单
   */
  onReorder() {
    const { companionInfo, orderInfo } = this.data;
    
    wx.navigateTo({
      url: `/pages/dazi-detail/dazi-detail?id=${companionInfo.id || 1}`
    });
  },

  /**
   * 去评价
   */
  onReview() {
    wx.navigateTo({
      url: `/pages/review/review?id=${this.data.id}`
    });
  },

  /**
   * 查看评价
   */
  onViewReview() {
    wx.navigateTo({
      url: `/pages/review/detail?id=${this.data.id}`
    });
  },

  /**
   * 格式化时间
   */
  formatTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadOrderDetail();
    wx.stopPullDownRefresh();
  },

  /**
   * 评价 - 点击星星
   */
  onStarTap(e) {
    const star = parseInt(e.currentTarget.dataset.star);
    const ratingTexts = ['点击星星评分', '非常不满意', '不满意', '一般', '满意', '非常满意'];
    this.setData({
      rating: star,
      ratingText: ratingTexts[star] || '点击星星评分'
    });
  },

  /**
   * 评价 - 输入评价内容
   */
  onReviewInput(e) {
    this.setData({
      reviewContent: e.detail.value
    });
  },

  /**
   * 评价 - 点击快捷标签
   */
  onTagTap(e) {
    const index = e.currentTarget.dataset.index;
    const tags = this.data.quickTags;
    tags[index].selected = !tags[index].selected;
    this.setData({ quickTags: tags });
  },

  /**
   * 点击搭子跳转到详情页
   */
  onCompanionTap() {
    const { companionInfo } = this.data;
    if (companionInfo && companionInfo.id) {
      wx.navigateTo({
        url: `/pages/dazi-detail/dazi-detail?id=${companionInfo.id}`
      });
    }
  },

  /**
   * 用户点击右上角分享
   * 也会通过 button open-type="share" 触发
   */
  onShareAppMessage() {
    const { orderType, status, orderInfo, id } = this.data;
    
    // 悬赏订单分享（等待抢单状态）
    if (status === ORDER_STATUS.WAITING_GRAB || orderType === 'reward') {
      const serviceType = orderInfo?.serviceType || '搭子服务';
      const hourlyRate = orderInfo?.hourlyRate || 0;
      return {
        title: `【悬赏】${serviceType} ¥${hourlyRate}/小时 · 等你来抢单！`,
        path: `/pages/task-detail/task-detail?id=${id}&from=share`,
        imageUrl: '/assets/images/share-reward.png'
      };
    }
    
    // 普通订单分享
    return {
      title: '我的订单详情',
      path: `/pages/order-detail/order-detail?id=${id}`
    };
  }
});
