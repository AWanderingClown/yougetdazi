// pages/order-detail/order-detail.js
const { ORDER_STATUS, CANCEL_RULE, LBS, CANCEL_REASONS } = require('../../utils/constants');
const api = require('../../utils/api');
const { showCustomerServiceOptions } = require('../../utils/order-service');

// 引入模块
const TimerManager = require('./modules/timer-manager');
const MapManager = require('./modules/map-manager');
const OrderActions = require('./modules/order-actions');
const {
  formatTime,
  formatFullDateTime,
  extractCompanionInfo,
  extractOrderInfo,
  generateTimeLine
} = require('./modules/utils');

const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    id: '',
    status: ORDER_STATUS.SERVING,
    orderType: 'normal',

    statusConfig: {
      pending_payment: { title: '待支付', desc: '请在15分钟内完成支付', icon: '⏳', bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
      pending_accept: { title: '待接单', desc: '正在为您匹配合适的搭子', icon: '🔄', bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
      waiting_grab: { title: '等待抢单', desc: '悬赏已发布，等待搭子抢单', icon: '📢', bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
      accepted: { title: '搭子正在赶来', desc: '搭子已接单，正在前往服务地点', icon: '🚗', bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
      departed: { title: '搭子已出发', desc: '搭子正在前往服务地点，请耐心等待', icon: '🚗', bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
      serving: { title: '服务进行中', desc: '搭子正在为您提供服务', icon: '✨', bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
      completed: { title: '已完成', desc: '订单已完成，感谢使用', icon: '🎉', bgColor: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
      cancelled: { title: '已取消', desc: '订单已取消', icon: '❌', bgColor: 'linear-gradient(135deg, #A8D8FF 0%, #D4A5FF 100%)' }
    },

    payCountdown: '29:59',
    grabCountdown: '30:00',

    companionInfo: {
      id: '',
      nickname: '等待接单',
      avatar: '/assets/images/avatar-default.png',
      gender: 'unknown',
      age: 0,
      tags: [],
      distance: 0,
      estimatedArrival: '',
      location: { longitude: 116.397428, latitude: 39.90923 }
    },

    mapKey: '',
    mapCenter: { longitude: 116.397428, latitude: 39.90923 },
    mapScale: 14,
    markers: [],
    polyline: [],

    companionLocation: null,
    distanceToCompanion: 0,
    distanceToCompanionText: '',
    estimatedArrival: '',

    serviceTimer: { hours: '00', minutes: '00', seconds: '00' },
    serviceProgress: 0,
    remainingTimeText: '2小时',
    showRenewalHint: false,
    serviceStartTime: null,
    serviceTotalDuration: 7200000,
    serviceRemainingTime: 7200000,
    canCancelInService: true,
    serviceElapsedMinutes: 0,
    acceptWithin2Minutes: true,

    orderInfo: {
      orderNo: '',
      createdAt: '',
      paidAt: '',
      serviceType: '',
      duration: 2,
      appointmentTime: '',
      address: '',
      servicePrice: 0,
      totalAmount: 0,
      hasReviewed: false,
      cancelReason: '',
      cancelledAt: ''
    },

    showCancelModal: false,
    cancelReasons: CANCEL_REASONS,
    selectedCancelReason: '',
    showUrgeToast: false,

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

    timeLine: [],
    paymentDeadlineMs: null
  },

  /**
   * 模块管理器实例
   */
  timerManager: null,
  mapManager: null,
  orderActions: null,

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    const { id, status } = options;

    this.setData({
      id: id || 'order_001',
      status: status || ORDER_STATUS.SERVING
    });

    // 初始化模块管理器
    this.timerManager = new TimerManager(this, (data) => this.setData(data));
    this.mapManager = new MapManager(this);
    this.orderActions = new OrderActions(this);

    // 加入订单 Room
    if (id) {
      this._joinOrderRoom(id);
    }

    // 并行加载地图Key和订单详情
    Promise.all([
      this.mapManager.loadMapKey().catch(() => null),
      this.loadOrderDetail()
    ]);
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    const { status } = this.data;

    if (!this.timerManager) return;

    // 智能恢复：检查当前状态是否已有对应定时器在运行
    if (this.timerManager.hasActiveTimerForStatus(status)) {
      // 同类型定时器已在运行，无需重启，避免闪烁
      return;
    }

    // 状态变化或没有对应定时器，停止旧定时器并启动新的
    this.timerManager.stopAllTimers();
    this._startTimerForStatus(status);
  },

  /**
   * 根据状态启动对应计时器
   * @param {string} status - 订单状态
   * @private
   */
  _startTimerForStatus(status) {
    if (status === ORDER_STATUS.SERVING) {
      this.startServiceTimerDisplay();
    } else if (status === ORDER_STATUS.PENDING_PAYMENT) {
      this.startPayCountdown();
    } else if (status === ORDER_STATUS.WAITING_GRAB) {
      this.startGrabCountdown();
    }
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 销毁管理器
    if (this.timerManager) {
      this.timerManager.destroy();
      this.timerManager = null;
    }
    if (this.mapManager) {
      this.mapManager.destroy();
      this.mapManager = null;
    }
    if (this.orderActions) {
      this.orderActions.page = null;
      this.orderActions = null;
    }

    // 离开订单 Room
    this._leaveOrderRoom();
  },

  /**
   * 加入订单房间
   * @param {string} orderId - 订单ID
   * @private
   */
  _joinOrderRoom(orderId) {
    const socket = getApp().globalData.socket;
    if (socket) {
      socket.emit('join:order', orderId);
      this._joinedOrderRoom = true;
      this._joinedOrderId = orderId;
    }
  },

  /**
   * 离开订单房间
   * @private
   */
  _leaveOrderRoom() {
    if (this._joinedOrderRoom && this._joinedOrderId) {
      const socket = getApp().globalData.socket;
      if (socket) {
        socket.emit('leave:order', this._joinedOrderId);
      }
      this._joinedOrderRoom = false;
      this._joinedOrderId = null;
    }
  },

  // ==================== 计时器相关 ====================

  startPayCountdown() {
    this.timerManager.startPayCountdown(
      () => this._fetchPayRemainingTime(),
      () => this.autoCancelOrder()
    );
  },

  _fetchPayRemainingTime() {
    return app.request({ url: api.orders.payCountdown(this.data.id) })
      .then((res) => res?.data?.remaining_seconds ?? null)
      .catch(() => null);
  },

  startGrabCountdown() {
    this.timerManager.startGrabCountdown(
      () => this._fetchGrabRemainingTime(),
      () => this.autoCancelRewardOrder()
    );
  },

  _fetchGrabRemainingTime() {
    return app.request({ url: api.orders.grabCountdown(this.data.id) })
      .then((res) => res?.data?.remaining_seconds ?? null)
      .catch(() => null);
  },

  startServiceTimerDisplay() {
    this.timerManager.startServiceTimerDisplay(
      () => this._fetchServiceStatus(),
      () => this.onServiceEnd()
    );
  },

  _fetchServiceStatus() {
    return app.request({ url: api.orders.serviceStatus(this.data.id) })
      .then((res) => res?.data ?? null)
      .catch(() => null);
  },

  startAcceptTimer() {
    this.timerManager.startAcceptTimer(
      () => this._fetchCanCancelFreeStatus(),
      () => this.setData({ acceptWithin2Minutes: false })
    );
  },

  _fetchCanCancelFreeStatus() {
    return app.request({ url: api.orders.canCancelFree(this.data.id) })
      .then((res) => res?.data?.can_cancel_free ?? false)
      .catch(() => false);
  },

  // ==================== 地图相关 ====================

  initMap() {
    const { companionLocation, orderInfo } = this.data;
    this.mapManager.initMap(companionLocation, orderInfo);
  },

  startCompanionLocationRefresh() {
    this.mapManager.startLocationRefresh(this.data.id, () => {
      this.refreshCompanionLocation();
    });
  },

  refreshCompanionLocation() {
    this.mapManager.refreshCompanionLocation(this.data.id).catch(() => {});
  },

  // ==================== 订单操作 ====================

  onPay() {
    this.orderActions.onPay(this.data.id, () => {
      this.loadOrderDetail();
    });
  },

  confirmCancelOrder() {
    const { selectedCancelReason } = this.data;
    if (!selectedCancelReason) {
      wx.showToast({ title: '请选择取消原因', icon: 'none' });
      return;
    }
    this.hideCancelModal();
    this.orderActions.confirmCancelOrder(this.data.id, () => {
      this.executeCancel();
    });
  },

  executeCancel() {
    this.orderActions.executeCancel(this.data.id, () => {
      this.loadOrderDetail();
    });
  },

  autoCancelOrder() {
    this.orderActions.autoCancelOrder(() => {
      this.setData({ status: ORDER_STATUS.CANCELLED });
    });
  },

  onChangeCompanion() {
    this.orderActions.onChangeCompanion(this.data.id, () => {
      this.loadOrderDetail();
    });
  },

  onEndService() {
    this.orderActions.onEndService(this.data.id, this.data.serviceElapsedMinutes, () => {
      this.loadOrderDetail();
    });
  },

  onServiceEnd() {
    this.orderActions.onServiceEnd(
      this.data.id,
      () => this.onRenewal(),
      () => {
        this.setData({
          status: ORDER_STATUS.COMPLETED,
          'orderInfo.hasReviewed': false
        });
      }
    );
  },

  onUrge() {
    this.orderActions.onUrge(this.data.id);
  },

  onRequestEnd() {
    this.orderActions.onRequestEnd(this.data.id, () => {
      this.executeServiceCancel();
    });
  },

  executeServiceCancel() {
    this.orderActions.executeCancel(this.data.id, () => {
      this.loadOrderDetail();
    });
  },

  onRenewal() {
    this.orderActions.onRenewal(this.data.id, this.data.orderInfo?.duration, () => {
      this.loadOrderDetail();
    });
  },

  onConfirmComplete() {
    const { rating, reviewContent, quickTags, id } = this.data;
    const selectedTags = quickTags.filter(t => t.selected);
    this.orderActions.submitReview(id, rating, reviewContent, selectedTags, () => {
      this.setData({ 'orderInfo.hasReviewed': true });
    });
  },

  onCopyOrderNo() {
    this.orderActions.onCopyOrderNo(this.data.orderInfo.orderNo);
  },

  onCancelReward() {
    this.orderActions.onCancelReward(this.data.id, () => {
      this.loadOrderDetail();
    });
  },

  // ==================== 页面方法 ====================

  loadOrderDetail() {
    const id = this.data.id;
    if (!id) {
      wx.showToast({ title: '订单ID无效', icon: 'none' });
      return;
    }

    // 防止重复加载
    if (this._isLoadingOrder) {
      return;
    }
    this._isLoadingOrder = true;

    wx.showLoading({ title: '加载中' });

    app.request({ url: api.orders.detail(id) })
      .then(res => {
        wx.hideLoading();
        const order = res.data;
        if (!order) {
          wx.showToast({ title: '订单不存在', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 1500);
          return;
        }

        const acceptedLog = (order.operation_logs || []).find(l => l.action === 'accepted');
        const paidRecord = (order.payment_records || []).find(r => r.status === 'paid');
        this._handleOrderDetailLoaded(order, acceptedLog, paidRecord);
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      })
      .finally(() => {
        this._isLoadingOrder = false;
      });
  },

  _handleOrderDetailLoaded(order, acceptedLog, paidRecord) {
    const companionInfo = extractCompanionInfo(order, paidRecord);
    const orderInfo = extractOrderInfo(order, acceptedLog, paidRecord);

    this.setData({
      id: order.id || '',
      status: order.status || ORDER_STATUS.PENDING_PAYMENT,
      orderType: order.order_type === 'reward' ? 'reward' : 'normal',
      companionInfo,
      orderInfo,
      serviceStartTime: order.service_start_at ? new Date(order.service_start_at).getTime() : null,
      paymentDeadlineMs: order.payment_deadline ? new Date(order.payment_deadline).getTime() : null,
      timeLine: generateTimeLine(order, formatTime)
    });

    this.initByStatus();
    this.startAcceptTimer();
  },

  initByStatus() {
    const { status } = this.data;

    switch (status) {
      case ORDER_STATUS.PENDING_PAYMENT:
        this.startPayCountdown();
        break;
      case ORDER_STATUS.ACCEPTED:
      case ORDER_STATUS.DEPARTED:
        this.initMap();
        this.startCompanionLocationRefresh();
        break;
      case ORDER_STATUS.SERVING:
        this.startServiceTimerDisplay();
        this.initMap();
        break;
      case ORDER_STATUS.WAITING_GRAB:
        this.startGrabCountdown();
        break;
      default:
        break;
    }
  },

  autoCancelRewardOrder() {
    wx.showToast({ title: '等待系统处理...', icon: 'none' });
    setTimeout(() => this.loadOrderDetail(), 2000);
  },

  // ==================== UI 事件处理 ====================

  onCancelOrder() {
    this.setData({ showCancelModal: true, selectedCancelReason: '' });
  },

  hideCancelModal() {
    this.setData({ showCancelModal: false });
  },

  onCancelReasonChange(e) {
    this.setData({ selectedCancelReason: e.detail.value });
  },

  onChat() {
    const { id, companionInfo } = this.data;
    wx.navigateTo({
      url: `/pages/chat/chat?id=${id}&companionId=${companionInfo.id}&nickname=${encodeURIComponent(companionInfo.nickname)}`
    });
  },

  onContactService() {
    showCustomerServiceOptions(this.data.id);
  },

  onReorder() {
    const { companionInfo } = this.data;
    wx.navigateTo({
      url: `/pages/dazi-detail/dazi-detail?id=${companionInfo.id || 1}`
    });
  },

  onReview() {
    wx.navigateTo({ url: `/pages/review/review?id=${this.data.id}` });
  },

  onViewReview() {
    wx.navigateTo({ url: `/pages/review/detail?id=${this.data.id}` });
  },

  onCompanionTap() {
    const { companionInfo } = this.data;
    if (companionInfo?.id) {
      wx.navigateTo({ url: `/pages/dazi-detail/dazi-detail?id=${companionInfo.id}` });
    }
  },

  onStarTap(e) {
    const star = parseInt(e.currentTarget.dataset.star);
    const ratingTexts = ['点击星星评分', '非常不满意', '不满意', '一般', '满意', '非常满意'];
    this.setData({ rating: star, ratingText: ratingTexts[star] || '点击星星评分' });
  },

  onReviewInput(e) {
    this.setData({ reviewContent: e.detail.value });
  },

  onTagTap(e) {
    const index = e.currentTarget.dataset.index;
    const tags = this.data.quickTags.map((t, i) =>
      i === index ? { ...t, selected: !t.selected } : t
    );
    this.setData({ quickTags: tags });
  },

  onPullDownRefresh() {
    this.loadOrderDetail();
    wx.stopPullDownRefresh();
  },

  onShareAppMessage() {
    const { orderType, status, orderInfo, id } = this.data;

    if (status === ORDER_STATUS.WAITING_GRAB || orderType === 'reward') {
      const serviceType = orderInfo?.serviceType || '搭子服务';
      const hourlyRate = orderInfo?.hourlyRate || 0;
      return {
        title: `【悬赏】${serviceType} ¥${hourlyRate}/小时 · 等你来抢单！`,
        path: `/pages/task-detail/task-detail?id=${id}&from=share`,
        imageUrl: '/assets/images/share-reward.png'
      };
    }

    return {
      title: '我的订单详情',
      path: `/pages/order-detail/order-detail?id=${id}`
    };
  }
});
