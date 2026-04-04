// pages/b-order-detail/b-order-detail.js - 订单详情
// 业务规则：
// 赏金任务：接单 → 出发（触发人脸识别）→ LBS定位 → 到达100米内 → 开始服务
// 定向任务：直接出发（触发人脸识别）→ LBS定位 → 到达100米内 → 开始服务
const { ORDER_STATUS, LBS, VERIFY } = require('../../utils/constants');
const { checkAcceptPermission } = require('../../utils/auth');

Page({
  data: {
    order: null,
    loading: true,
    countdown: '',
    orderType: 'reward',    // 订单类型：reward=赏金任务 / direct=定向任务
    canAccept: false,        // 显示"接单"按钮（仅赏金任务 pending_accept 状态）
    canDepart: false,        // 显示"出发"按钮
    hasDeparted: false,      // 是否已点击出发（人脸识别完成后为 true）
    // canComplete 已移除：搭子不能主动完成订单，只能由倒计时结束或用户主动结束
    isFaceVerified: false,   // 是否通过人脸识别
    serviceCountdown: '',    // 服务倒计时
    lbsStatus: '未开始',    // LBS定位状态
    statusBarHeight: 0,

    // 位置相关
    companionLocation: null,
    targetLocation: null,
    distanceToTarget: -1,
    hasArrived: false,
    ARRIVAL_THRESHOLD: LBS.ARRIVAL_THRESHOLD,

    // 地图相关
    mapKey: '',                  // 腾讯地图Key（从后端获取）
    mapMarkers: [],              // 地图标记点
    mapScale: 16,                // 地图缩放级别

    // 开始服务按钮提示
    startBtnDisabled: true,
    startBtnText: '前往服务地点中...',

    // LBS状态类型（用于UI颜色区分）
    lbsStatusType: 'pending',    // pending-未开始(灰), progress-进行中(绿), arrived-已到达(红)

    // 防抖标志
    isAcceptingOrder: false
  },

  countdownTimer: null,
  serviceDisplayTimer: null,  // 仅用于UI显示更新，不用于倒计时逻辑
  lbsTimer: null,
  locationUpdateInterval: null,

  onLoad(options) {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight,
      orderType: options.type || 'reward'  // reward=赏金任务 / direct=定向任务
    });

    const orderId = options.id || '';
    this.loadOrderDetail(orderId);
    this.checkFaceVerified(orderId);

    // 加入订单 Room，接收实时推送
    const socket = getApp().globalData.socket;
    if (socket && orderId) {
      socket.emit('join:order', orderId);
    }

    // 加载地图Key
    this.loadMapKey();
  },
  
  onShow() {
    if (!this.data.order || !this.data.order.id) return;

    const app = getApp();
    const orderId = this.data.order.id;

    // 检查 Socket.IO 推送的待处理状态更新（C端取消 / 后台操作等）
    const pendingUpdate = app.globalData.pendingOrderUpdates?.[orderId];
    if (pendingUpdate) {
      delete app.globalData.pendingOrderUpdates[orderId];
      // 重新加载订单详情以反映最新状态
      this.loadOrderDetail(orderId);
      return;
    }

    this.checkFaceVerified(orderId);

    // 如果订单正在服务中，启动服务倒计时展示
    if (this.data.order.status === ORDER_STATUS.SERVING) {
      this.startServiceCountdownDisplay();
    }

    // 已完成时检查是否已评价（从 b-review 返回后同步按钮状态）
    if (this.data.order.status === ORDER_STATUS.COMPLETED) {
      const bReviewedOrders = wx.getStorageSync('b_reviewed_orders') || [];
      if (bReviewedOrders.includes(orderId)) {
        this.setData({ 'order.hasReviewed': true });
      }
    }
  },
  
  onHide() {
    // 页面隐藏时清理UI更新定时器，但全局倒计时继续运行
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.serviceDisplayTimer) {
      clearInterval(this.serviceDisplayTimer);
      this.serviceDisplayTimer = null;
    }
    // 页面隐藏时暂停位置更新，节省电量
    this.stopLocationUpdate();
  },

  onUnload() {
    this.clearAllTimers();
    this.stopLocationUpdate();
    // 离开订单 Room
    const socket  = getApp().globalData.socket;
    const orderId = this.data.order && this.data.order.id;
    if (socket && orderId) {
      socket.emit('leave:order', orderId);
    }
  },

  // 检查是否已通过人脸识别
  checkFaceVerified(orderId) {
    const verified = wx.getStorageSync(`faceVerified_${orderId}`);
    const verifyTime = wx.getStorageSync(`faceVerifyTime_${orderId}`);

    // 验证有效期15分钟，添加类型检查防止存储数据被篡改
    if (verified && 
        typeof verifyTime === 'number' && 
        verifyTime > 0 &&
        (Date.now() - verifyTime < VERIFY.FACE_VERIFY_VALID)) {
      // 已验证 = 已出发，恢复状态并启动定位
      this.setData({ isFaceVerified: true, hasDeparted: true, canDepart: false });
      if (this.data.order && this.data.order.status === ORDER_STATUS.ACCEPTED) {
        this.startLocationTracking();
      }
    }
  },

  loadOrderDetail(id) {
    if (!id) {
      wx.showToast({ title: '订单ID无效', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '加载中' });
    const app = getApp();

    app.request({ url: '/api/b/orders/' + id })
      .then(res => {
        wx.hideLoading();
        const d = res.data;
        if (!d) {
          wx.showToast({ title: '订单不存在', icon: 'none' });
          setTimeout(() => { wx.navigateBack(); }, 1500);
          return;
        }

        const statusTextMap = {
          'pending_accept': '待接单',
          'waiting_grab':   '待抢单',
          'accepted':       '待服务',
          'serving':        '服务中',
          'completed':      '已完成',
          'cancelled':      '已取消'
        };
        const statusDescMap = {
          'pending_accept': '请尽快确认是否接单',
          'waiting_grab':   '悬赏任务，抢单后开始服务',
          'accepted':       '请在预约时间前到达',
          'serving':        '服务进行中，请保持定位开启',
          'completed':      '服务已完成',
          'cancelled':      '订单已取消'
        };

        const orderData = {
          id:              d.id,
          status:          d.status,
          statusText:      statusTextMap[d.status] || d.status,
          statusDesc:      statusDescMap[d.status] || '',
          customerName:    d.user?.nickname || '用户',
          customerAvatar:  d.user?.avatar || '/assets/icons/default-avatar.png',
          customerPhone:   '',
          serviceType:     d.service_name,
          serviceDetail:   d.user_remark || '',
          appointmentTime: d.service_start_at ? d.service_start_at.slice(0, 16).replace('T', ' ') : '',
          duration:        `${d.duration}小时`,
          durationMinutes: d.duration * 60,
          hourlyPrice:     (d.hourly_price || 0) / 100,
          totalAmount:     (d.total_amount || 0) / 100,
          remark:          d.user_remark || '',
          address:         '',
          isNewUser:       false,
          tags:            [],
          serviceStartTime: d.service_start_at || null,
          acceptDeadline:  d.accept_deadline || null  // 添加接单截止时间
        };

        // 服务目的地坐标来自后端订单数据
        const targetLocation = {
          latitude:  d.service_latitude  || null,
          longitude: d.service_longitude || null,
          address:   d.service_address   || '',
        };

        const alreadyDeparted = this.data.hasDeparted;
        let canAccept = false;
        let canDepart = false;
        if (d.status === ORDER_STATUS.PENDING) {
          canAccept = true;
        } else if (d.status === ORDER_STATUS.ACCEPTED && !alreadyDeparted) {
          canDepart = true;
        }

        this.setData({
          order:          orderData,
          targetLocation: targetLocation,
          canAccept:      canAccept,
          canDepart:      canDepart,
          loading:        false
        });

        if (d.status === ORDER_STATUS.PENDING) {
          this.startCountdown();
        } else if (d.status === ORDER_STATUS.SERVING) {
          this.startServiceCountdown();
        }
      })
      .catch(() => {
        wx.hideLoading();
        this.setData({ loading: false });
        wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      });
  },

  // 接单倒计时：从订单的 acceptDeadline 计算剩余时间（与后端15分钟超时一致）
  startCountdown() {
    const order = this.data.order;
    // acceptDeadline 由后端下发（ISO 字符串）
    const deadline = order.acceptDeadline ? new Date(order.acceptDeadline).getTime() : (Date.now() + 15 * 60 * 1000);

    this.countdownTimer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      if (remaining <= 0) {
        clearInterval(this.countdownTimer);
        this.setData({
          countdown: '已过期',
          canAccept: false,
          'order.statusDesc': '接单超时',
        });
        return;
      }
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      this.setData({
        countdown: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
      });
    }, 1000);
  },

  // 服务倒计时：服务开始后启动本地1秒递减 + 每10秒向后端校准
  startServiceCountdown() {
    this.startServiceCountdownDisplay();
  },

  // 从后端获取剩余时间，本地每秒递减展示，每10秒轮询后端校准
  startServiceCountdownDisplay() {
    const orderId = this.data.order.id;
    const app = getApp();

    if (this.serviceDisplayTimer) {
      clearInterval(this.serviceDisplayTimer);
    }

    let localRemaining = 0; // 本地维护的剩余秒数
    let pollCount = 0;

    const fetchAndSync = () => {
      app.request({ url: `/api/b/orders/${orderId}/timer` }).then((res) => {
        if (res && res.data) {
          localRemaining = res.data.remaining_seconds || 0;
        }
      }).catch(() => {});
    };

    // 立即拉取一次
    fetchAndSync();

    this.serviceDisplayTimer = setInterval(() => {
      pollCount++;

      // 每10秒向后端同步一次
      if (pollCount % 10 === 0) {
        fetchAndSync();
      }

      if (localRemaining <= 0) {
        clearInterval(this.serviceDisplayTimer);
        this.serviceDisplayTimer = null;
        this.setData({ serviceCountdown: '00:00:00' });
        this.autoCompleteService();
        return;
      }

      localRemaining = Math.max(0, localRemaining - 1);
      const hours = Math.floor(localRemaining / 3600);
      const mins  = Math.floor((localRemaining % 3600) / 60);
      const secs  = localRemaining % 60;

      this.setData({
        serviceCountdown: `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      });
    }, 1000);
  },

  clearAllTimers() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    if (this.serviceDisplayTimer) {
      clearInterval(this.serviceDisplayTimer);
    }
    if (this.lbsTimer) {
      clearInterval(this.lbsTimer);
    }
    if (this.locationUpdateInterval) {
      clearInterval(this.locationUpdateInterval);
    }
  },

  // 接单（仅赏金任务）
  onAcceptOrder() {
    // 防抖：防止快速重复点击
    if (this.data.isAcceptingOrder) {
      return;
    }

    // 设置接单中标志
    this.setData({ isAcceptingOrder: true });

    // 检查保证金状态
    const canAccept = checkAcceptPermission({
      showModal: true,
      onCanAccept: () => {
        this.showAcceptConfirm();
      },
      onCannotAccept: () => {
        this.setData({ isAcceptingOrder: false });
      }
    });

    if (!canAccept) {
      this.setData({ isAcceptingOrder: false });
      return;
    }
    // 可以接单时由 onCanAccept 回调处理，无需在此重复调用
  },

  // 显示接单确认弹窗
  showAcceptConfirm() {
    wx.showModal({
      title: '确认接单',
      content: '接单后请按时完成服务，爽约将扣除保证金',
      confirmColor: '#667eea',
      success: (res) => {
        // 重置防抖标志
        this.setData({ isAcceptingOrder: false });

        if (res.confirm) {
          const orderId = this.data.order.id;
          const app = getApp();
          wx.showLoading({ title: '接单中...' });

          app.request({
            url: `/api/b/orders/${orderId}/accept`,
            method: 'POST',
          }).then(() => {
            wx.hideLoading();
            wx.showToast({ title: '接单成功', icon: 'success' });
            this.setData({
              'order.status': ORDER_STATUS.ACCEPTED,
              'order.statusText': '待服务',
              'order.statusDesc': '请在预约时间前到达',
              canAccept: false,
              canDepart: true,
            });
          }).catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: err?.message || '接单失败，请重试', icon: 'none' });
          });
        }
      }
    });
  },

  // 出发（触发人脸识别）
  onDepart() {
    wx.showModal({
      title: '确认出发',
      content: '出发后需要完成人脸识别验证，以确保服务安全',
      confirmText: '去人脸识别',
      confirmColor: '#667eea',
      success: (res) => {
        if (res.confirm) {
          this.goToFaceVerify();
        }
      },
      fail: () => {
        this.goToFaceVerify();
      }
    });
  },

  goToFaceVerify() {
    wx.navigateTo({
      url: `/pages/face-verify/face-verify?orderId=${this.data.order.id}`
    });
  },

  // 开始服务（人脸识别完成后，检查是否已到达）
  onStartService() {
    // 检查是否已到达
    if (!this.data.hasArrived) {
      const distance = this.data.distanceToTarget;
      if (distance > 0) {
        wx.showModal({
          title: '尚未到达服务地点',
          content: `您距离服务地点还有 ${Math.round(distance)} 米，请到达100米范围内后再开始服务`,
          confirmText: '我知道了',
          showCancel: false
        });
      } else {
        wx.showToast({ title: '正在定位中，请稍候', icon: 'none' });
      }
      return;
    }

    // 已验证且已到达，开始服务
    this.startServiceConfirmed();
  },

  // 确认开始服务
  startServiceConfirmed() {
    const orderId = this.data.order.id;
    const app = getApp();
    wx.showLoading({ title: '正在开始服务...' });

    app.request({
      url: `/api/b/orders/${orderId}/start`,
      method: 'POST',
    }).then(() => {
      wx.hideLoading();
      // 等待后端 Socket 推送 order:status_changed 来更新UI
      // 但同时更新本地状态让 B端陪玩师立即看到反馈
      this.setData({
        lbsStatus: '服务中',
        'order.status': ORDER_STATUS.SERVING,
        'order.statusText': '服务中',
        'order.statusDesc': '服务进行中，请保持定位开启',
        startBtnDisabled: true,
        startBtnText: '服务进行中'
      });

      // 持续LBS上报（服务中也需要）
      this.startLBSReporting();

      // 标记有活跃订单（供 deposit.js 退还保证金时检查）
      wx.setStorageSync('companionHasActiveOrders', true);

      wx.showToast({ title: '服务开始', icon: 'success' });
    }).catch((err) => {
      wx.hideLoading();
      wx.showToast({ title: err?.message || '操作失败，请重试', icon: 'none' });
    });
  },

  // 人脸识别成功回调（从 face-verify 页面返回后触发）
  onFaceVerifySuccess() {
    this.setData({
      isFaceVerified: true,
      hasDeparted: true,
      canDepart: false
    });
    // 开始位置追踪
    this.startLocationTracking();
    // 初始化地图
    this.initMap();
  },

  // 加载地图Key
  loadMapKey() {
    const map = require('../../utils/map');
    map.getMapKey()
      .then((key) => {
        this.setData({ mapKey: key });
      })
      .catch((err) => {
        console.error('获取地图Key失败', err);
      });
  },

  // 初始化地图标记
  initMap() {
    const { targetLocation, companionLocation } = this.data;
    if (!targetLocation) return;

    const markers = [
      {
        id: 1,
        latitude: targetLocation.latitude,
        longitude: targetLocation.longitude,
        title: '目的地',
        iconPath: '/assets/icons/target-location.png',
        width: 40,
        height: 40,
        anchor: { x: 0.5, y: 1 }
      }
    ];

    // 如果有当前位置，添加当前位置标记
    if (companionLocation) {
      markers.push({
        id: 2,
        latitude: companionLocation.latitude,
        longitude: companionLocation.longitude,
        title: '我的位置',
        iconPath: '/assets/icons/current-location.png',
        width: 30,
        height: 30,
        anchor: { x: 0.5, y: 1 }
      });
    }

    this.setData({ mapMarkers: markers });
  },

  // 更新地图标记（位置变化时调用）
  updateMapMarkers() {
    const { targetLocation, companionLocation, hasArrived } = this.data;
    if (!targetLocation) return;

    const markers = [
      {
        id: 1,
        latitude: targetLocation.latitude,
        longitude: targetLocation.longitude,
        title: '目的地',
        iconPath: '/assets/icons/target-location.png',
        width: 40,
        height: 40,
        anchor: { x: 0.5, y: 1 }
      }
    ];

    // 添加当前位置标记
    if (companionLocation) {
      markers.push({
        id: 2,
        latitude: companionLocation.latitude,
        longitude: companionLocation.longitude,
        title: '我的位置',
        iconPath: '/assets/icons/current-location.png',
        width: 30,
        height: 30,
        anchor: { x: 0.5, y: 1 }
      });
    }

    this.setData({ mapMarkers: markers });
  },

  // 人脸识别超时回调
  onFaceVerifyTimeout() {
    // 验证超时，返回上一页
    wx.showToast({ title: '验证超时，订单已取消', icon: 'none' });
    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
  },

  // 开始位置追踪（每5秒上报后端）
  startLocationTracking() {
    // 检查订单信息是否存在
    if (!this.data.order || !this.data.order.id) {
      console.error('订单信息不存在，无法开始定位');
      this.setData({ lbsStatus: '订单信息错误', lbsStatusType: 'pending' });
      return;
    }

    this.setData({ lbsStatus: '定位中...', lbsStatusType: 'pending' });

    // 先上报一次位置
    this.reportLocationToBackend();

    // 每5秒上报一次位置（上报到后端，由后端计算距离和判断到达状态）
    this.locationUpdateInterval = setInterval(() => {
      this.reportLocationToBackend();
    }, LBS.REPORT_INTERVAL);
  },

  // 停止位置更新
  stopLocationUpdate() {
    if (this.locationUpdateInterval) {
      clearInterval(this.locationUpdateInterval);
      this.locationUpdateInterval = null;
    }
  },

  // 上报位置到后端（核心改动）
  reportLocationToBackend() {
    const map = require('../../utils/map');

    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const companionLocation = {
          latitude: res.latitude,
          longitude: res.longitude,
          accuracy: res.accuracy || 0
        };

        this.setData({ companionLocation });

        // 上报到后端，后端计算距离和判断到达状态
        map.reportLocation(this.data.order.id, companionLocation)
          .then((result) => {
            // 根据状态设置 lbsStatus 和 lbsStatusType
            let lbsStatus, lbsStatusType;
            if (result.has_arrived) {
              lbsStatus = '已到达服务范围';
              lbsStatusType = 'arrived';  // 红色
            } else {
              lbsStatus = `距离目的地 ${result.distance_to_target} 米`;
              lbsStatusType = 'progress';  // 绿色
            }

            // 使用后端返回的数据更新UI
            this.setData({
              distanceToTarget: result.distance_to_target,
              hasArrived: result.has_arrived,
              startBtnDisabled: !result.can_start_service,
              startBtnText: result.can_start_service
                ? '开始服务'
                : `距离目的地 ${result.distance_to_target} 米，请继续前往`,
              lbsStatus: lbsStatus,
              lbsStatusType: lbsStatusType,
              // 更新预计到达时间（后端计算）
              'order.estimatedArrival': result.estimated_arrival
                ? map.formatEstimatedArrival(result.estimated_arrival)
                : null
            });

            // 更新地图标记
            this.updateMapMarkers();
          })
          .catch((err) => {
            console.error('上报位置失败', err);
          });
      },
      fail: (err) => {
        console.error('定位失败', err);
        this.setData({
          lbsStatus: '定位失败，请点击重试',
          lbsStatusType: 'pending',
          startBtnDisabled: true,
          startBtnText: '定位失败，请检查权限'
        });

        wx.showModal({
          title: '定位失败',
          content: '无法获取您的位置，请检查定位权限是否开启',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting();
            }
          }
        });
      }
    });
  },

  // LBS定时上报（服务中状态下继续上报位置）
  startLBSReporting() {
    // 每60秒上报一次位置
    this.lbsTimer = setInterval(() => {
      this.reportLocationToBackend();
      console.log('服务中位置上报:', new Date().toISOString());
    }, LBS.SERVING_REPORT_INTERVAL);
  },

  // 自动完成服务（倒计时结束或用户主动结束）
  autoCompleteService() {
    this.clearAllTimers();
    this.stopLocationUpdate();

    const orderId = this.data.order.id;
    const app = getApp();

    app.request({
      url: `/api/b/orders/${orderId}/complete`,
      method: 'POST',
    }).then(() => {
      this.setData({
        'order.status': ORDER_STATUS.COMPLETED,
        'order.statusText': '待评价',
        'order.statusDesc': '服务已完成',
      });

      wx.showModal({
        title: '服务结束',
        content: '服务已完成，请对用户进行评价',
        showCancel: false,
        confirmText: '去评价',
        success: () => {
          const { order } = this.data;
          const name = encodeURIComponent(order.customerName || '用户');
          const avatar = encodeURIComponent(order.customerAvatar || '');
          const service = encodeURIComponent(`${order.serviceType} · ${order.duration}`);
          wx.navigateTo({
            url: `/pages/b-review/b-review?orderId=${order.id}&customerName=${name}&customerAvatar=${avatar}&service=${service}`
          });
        }
      });
    }).catch((err) => {
      wx.showToast({ title: err?.message || '完成服务失败，请重试', icon: 'none' });
    });
  },

  // 处理换一换通知（被换掉的搭子收到通知）
  // 实际项目中通过WebSocket或轮询接收换人通知
  onSwitchNotify() {
    const order = this.data.order;
    if (!order) return;

    // 清理所有定时器和位置追踪
    this.clearAllTimers();
    this.stopLocationUpdate();

    // 订单进入已取消状态
    this.setData({
      'order.status': ORDER_STATUS.CANCELLED,
      'order.statusText': '已取消',
      'order.statusDesc': '用户已更换搭子，该订单已取消',
      canAccept: false,
      canDepart: false,
      hasDeparted: false,
      startBtnDisabled: true,
      startBtnText: '订单已取消'
    });

    wx.showModal({
      title: '订单已取消',
      content: '用户使用了"换一换"功能，该订单已由其他搭子接手。本次不会影响您的信誉评分。',
      showCancel: false,
      confirmText: '我知道了',
      success: () => {
        // 可选：返回订单列表
      }
    });
  },

  // 处理续费通知（C端用户续费后触发）
  // 实际项目中通过WebSocket或轮询接收续费通知
  onRenewNotify(renewData) {
    const order = this.data.order;
    if (!order || order.status !== ORDER_STATUS.SERVING) return;

    const addHours = renewData.addHours || 1;
    const addAmount = addHours * order.hourlyPrice;
    const newDurationMinutes = order.durationMinutes + addHours * 60;
    const newTotalAmount = order.totalAmount + addAmount;
    const newDuration = (newDurationMinutes / 60) + '小时';

    // 更新订单数据
    this.setData({
      'order.durationMinutes': newDurationMinutes,
      'order.totalAmount': newTotalAmount,
      'order.duration': newDuration
    });

    wx.showModal({
      title: '用户已续费',
      content: `用户续费了${addHours}小时，服务时长已延长至${newDuration}，订单金额更新为¥${newTotalAmount}`,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 去评价用户（已完成状态）
  onReviewUser() {
    const { order } = this.data;
    const name = encodeURIComponent(order.customerName || '用户');
    const avatar = encodeURIComponent(order.customerAvatar || '');
    const service = encodeURIComponent(`${order.serviceType} · ${order.duration}`);
    wx.navigateTo({
      url: `/pages/b-review/b-review?orderId=${order.id}&customerName=${name}&customerAvatar=${avatar}&service=${service}`
    });
  },

  // 联系用户
  onContactUser() {
    const { order } = this.data;
    const name = encodeURIComponent(order.customerName || '用户');
    const avatar = encodeURIComponent(order.customerAvatar || '');
    wx.navigateTo({
      url: `/pages/chat/chat?id=${order.id}&name=${name}&avatar=${avatar}`
    });
  },

  // 返回
  goBack() {
    try {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack({
          fail: () => {
            // 返回失败时跳转到首页
            wx.switchTab({
              url: '/pages/workbench/workbench'
            });
          }
        });
      } else {
        // 没有上一页时跳转到首页
        wx.switchTab({
          url: '/pages/workbench/workbench'
        });
      }
    } catch (e) {
      console.error('返回失败', e);
      wx.switchTab({
        url: '/pages/workbench/workbench'
      });
    }
  }
});
