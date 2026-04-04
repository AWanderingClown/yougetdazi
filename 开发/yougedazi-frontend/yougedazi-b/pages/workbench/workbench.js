// pages/workbench/workbench.js - 搭子工作台
const { ORDER_STATUS, DEFAULT_DEPOSIT_CONFIG, checkDepositLevel, TIMER } = require('../../utils/constants');
const { checkAcceptPermission } = require('../../utils/auth');

Page({
  data: {
    isWorking: false,
    todayIncome: 0,
    todayOrders: 0,
    completionRate: 100,
    statusBarHeight: 0,

    // 保证金相关（来自全局常量）
    depositConfig: DEFAULT_DEPOSIT_CONFIG,

    // 搭子数据
    companionStats: {
      totalOrders: 0,      // 历史总订单数
      depositedAmount: 0   // 已缴纳保证金金额
    },

    // 当前保证金状态
    depositStatus: {
      stage: 'rookie',           // rookie:新手期, growth:成长期, mature:成熟期
      stageText: '新手期',
      needDeposit: false,        // 是否需要缴纳
      needAmount: 0,             // 还需缴纳金额
      isFull: false              // 是否已缴满当前阶段
    },

    // 待处理订单等
    pendingOrders: [],
    processingOrders: [],
    rewardTasks: [],

    // 新订单弹窗
    newOrderPopup: {
      show: false,
      acceptCountdown: TIMER.ACCEPT_COUNTDOWN,
      order: {}
    },

    // 防抖标志
    isAcceptingOrder: false
  },

  // 倒计时器
  countdownTimers: {},
  // 弹窗接单倒计时器
  popupCountdownTimer: null,

  onLoad() {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });

    this.loadData();
    this.startRefreshTimer();
    this.startCountdownTimers();

  },

  onShow() {
    this.loadData();
    this.startCountdownTimers();
    this.startServiceTimerDisplay();
    // 更新 TabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      });
    }

    // 消费全局 pendingNewOrders，显示新订单弹窗
    this.consumePendingNewOrders();
  },

  // 消费全局待处理新订单
  consumePendingNewOrders() {
    const app = getApp();
    const pendingOrders = app.globalData.pendingNewOrders || [];
    if (pendingOrders.length === 0) return;

    // 清空已消费的订单
    app.globalData.pendingNewOrders = [];

    // 显示新订单弹窗（多个订单时依次显示）
    this._popupTimeouts = this._popupTimeouts || [];
    pendingOrders.forEach((order, index) => {
      const timeoutId = setTimeout(() => {
        this.showNewOrderPopup(order);
      }, index * 500);
      this._popupTimeouts.push(timeoutId);
    });
  },

  onHide() {
    this.stopCountdownTimers();
    this.stopServiceTimerDisplay();  // 停止倒计时显示更新
    this.clearPopupTimeouts();  // 清理待显示弹窗的 timeout
  },

  onUnload() {
    this.stopRefreshTimer();
    this.stopCountdownTimers();
    this.stopPopupCountdown();
  },

  // 启动倒计时器
  startCountdownTimers() {
    if (!this.countdownTimers) this.countdownTimers = {};
    this.stopCountdownTimers();
    
    // 为每个待接单启动倒计时
    const pendingOrders = this.data.pendingOrders;
    pendingOrders.forEach((order, index) => {
      if (order.countdown > 0) {
        const timerKey = `order_${order.id}`;
        // 先设置初始显示
        const countdownText = this.formatCountdown(order.countdown);
        const textKey = `pendingOrders[${index}].countdownText`;
        this.setData({
          [textKey]: countdownText
        });
        
        this.countdownTimers[timerKey] = setInterval(() => {
          const currentIndex = this.data.pendingOrders.findIndex(o => o.id === order.id);
          if (currentIndex === -1) {
            clearInterval(this.countdownTimers[timerKey]);
            delete this.countdownTimers[timerKey];
            return;
          }
          this.updateCountdown(order.id, currentIndex);
        }, 1000);
      }
    });
  },

  // 停止倒计时器
  stopCountdownTimers() {
    if (!this.countdownTimers) return;
    Object.keys(this.countdownTimers).forEach(key => {
      clearInterval(this.countdownTimers[key]);
      delete this.countdownTimers[key];
    });
    this.countdownTimers = {};
  },

  // 更新倒计时
  updateCountdown(orderId, index) {
    const pendingOrders = this.data.pendingOrders;
    const order = pendingOrders[index];
    
    if (!order || order.countdown <= 0) {
      clearInterval(this.countdownTimers[`order_${orderId}`]);
      delete this.countdownTimers[`order_${orderId}`];
      
      // 倒计时结束，处理过期订单
      if (order && order.countdown <= 0) {
        this.handleOrderExpired(orderId);
      }
      return;
    }
    
    const newCountdown = order.countdown - 1;
    const countdownText = this.formatCountdown(newCountdown);
    
    // 更新特定订单的倒计时
    const key = `pendingOrders[${index}].countdown`;
    const textKey = `pendingOrders[${index}].countdownText`;
    this.setData({
      [key]: newCountdown,
      [textKey]: countdownText
    });
  },

  // 处理订单过期
  handleOrderExpired(orderId) {
    console.log(`[工作台] 订单 ${orderId} 接单倒计时已过期`);
    
    // 从待接单列表中移除
    const pendingOrders = this.data.pendingOrders.filter(o => o.id !== orderId);
    this.setData({ pendingOrders });
    
    // 可选：通知服务器订单已过期
    this.notifyOrderExpired(orderId);
    
    // 可选：显示提示
    wx.showToast({
      title: '有订单已过期',
      icon: 'none',
      duration: 2000
    });
  },

  // 通知服务器订单过期（实际项目中实现）
  notifyOrderExpired(orderId) {
    // 这里应该调用后端API通知订单过期
    // 例如：
    // wx.request({
    //   url: '/api/orders/' + orderId + '/expire',
    //   method: 'POST',
    //   ...
    // });
    console.log(`[工作台] 通知服务器订单 ${orderId} 已过期`);
  },

  // 格式化倒计时显示
  formatCountdown(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  startRefreshTimer() {
    this.refreshTimer = setInterval(() => {
      this.loadData();
    }, 30000);
  },

  stopRefreshTimer() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  },

  // 将秒数格式化为 MM:SS 或 HH:MM:SS 字符串
  _formatCountdown(seconds) {
    if (!seconds || seconds <= 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  },

  // 启动进行中订单的倒计时显示更新（从后端定期查询）
  startServiceTimerDisplay() {
    const app = getApp();

    if (this.serviceTimerDisplayInterval) {
      return; // 已启动
    }

    // 每10秒轮询后端获取服务中订单的最新剩余时间
    this.serviceTimerDisplayInterval = setInterval(() => {
      const processingOrders = this.data.processingOrders;
      const servingOrders = processingOrders.filter(o => o.status === 'serving');
      if (servingOrders.length === 0) return;

      servingOrders.forEach(order => {
        app.request({ url: `/api/b/orders/${order.id}/timer` }).then((res) => {
          if (!res || !res.data) return;
          const remaining = res.data.remaining_seconds || 0;
          const hours = Math.floor(remaining / 3600);
          const mins  = Math.floor((remaining % 3600) / 60);
          const secs  = remaining % 60;
          const newRemainingText = `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

          const updatedOrders = this.data.processingOrders.map(o =>
            o.id === order.id ? { ...o, serviceRemainingText: newRemainingText } : o
          );
          this.setData({ processingOrders: updatedOrders });
        }).catch(() => {});
      });
    }, 10000);
  },

  // 停止倒计时显示更新
  stopServiceTimerDisplay() {
    if (this.serviceTimerDisplayInterval) {
      clearInterval(this.serviceTimerDisplayInterval);
      this.serviceTimerDisplayInterval = null;
    }
  },

  // 预加载服务中订单的剩余时间（从后端获取）
  registerServingOrdersToBackend(processingOrders) {
    const app = getApp();
    processingOrders.forEach(order => {
      if (order.status === 'serving') {
        app.request({ url: `/api/b/orders/${order.id}/timer` }).then((res) => {
          if (!res || !res.data) return;
          const remaining = res.data.remaining_seconds || 0;
          const hours = Math.floor(remaining / 3600);
          const mins  = Math.floor((remaining % 3600) / 60);
          const secs  = remaining % 60;
          const serviceRemainingText = `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
          const updatedOrders = this.data.processingOrders.map(o =>
            o.id === order.id ? { ...o, serviceRemainingText } : o
          );
          this.setData({ processingOrders: updatedOrders });
        }).catch(() => {});
      }
    });
  },

  loadData() {
    const app = getApp();
    app.request({ url: '/api/b/workbench' })
      .then(res => {
        const d = res.data;
        this.setData({
          todayIncome:     (d.today_income || 0) / 100,
          todayOrders:     d.today_orders || 0,
          completionRate:  d.completion_rate || 100,
          isWorking:       d.is_online || false,
          pendingOrders:   (d.pending_orders || []).map(o => ({
            id:             o.id,
            customerName:   o.user && o.user.nickname || '用户',
            customerAvatar: o.user && o.user.avatar || '',
            serviceType:    o.service_name,
            duration:       o.duration + '小时',
            totalAmount:    (o.total_amount || 0) / 100,
            status:         o.status,
            countdown:      o.remaining_seconds || 0,
            countdownText:  this._formatCountdown(o.remaining_seconds || 0)
          })),
          processingOrders: (d.processing_orders || []).map(o => ({
            id:             o.id,
            customerName:   o.user && o.user.nickname || '用户',
            customerAvatar: o.user && o.user.avatar || '',
            serviceType:    o.service_name,
            duration:       o.duration + '小时',
            totalAmount:    (o.total_amount || 0) / 100,
            status:         o.status,
            statusText:     o.status === 'serving' ? '服务中' : '待服务',
            serviceRemainingText: this._formatCountdown(o.remaining_seconds || 0),
            serviceProgress: o.progress || 0
          }))
        });
      })
      .catch(() => {
        // 静默失败，保留上一次的显示数据
      });

    // 注册已在 SERVING 状态的订单到后端倒计时
    this.registerServingOrdersToBackend(this.data.processingOrders);

    // 初始化时检查一次保证金状态
    this.checkDepositStatus();

    // 数据加载完成后启动倒计时
    this.startCountdownTimers();
  },

  // 状态切换（接单/休息）
  onStatusChange(e) {
    const wantToWork = e.detail.value;
    
    // 如果要休息，直接切换
    if (!wantToWork) {
      this.setData({ isWorking: false });
      wx.showToast({
        title: '已停止接单',
        icon: 'none'
      });
      return;
    }
    
    // 要开启接单，先检查保证金
    const checkResult = this.checkDepositStatus();
    
    if (checkResult.canWork) {
      // 保证金已缴满，可以接单
      this.setData({ isWorking: true });
      wx.showToast({
        title: '已开始接单',
        icon: 'success'
      });
    } else {
      // 保证金不足，弹出缴纳提示
      this.showDepositModal(checkResult);
      // 保持开关关闭状态
      this.setData({ isWorking: false });
    }
  },
  
  // 检查保证金状态（调用全局常量中的 checkDepositLevel）
  checkDepositStatus() {
    const { depositConfig, companionStats } = this.data;
    const { totalOrders, depositedAmount } = companionStats;

    const result = checkDepositLevel(totalOrders, depositedAmount, depositConfig);

    // 更新状态
    this.setData({ depositStatus: result });

    return {
      canWork: result.isFull,
      stage: result.stage,
      stageText: result.stageText,
      needAmount: result.needAmount,
      depositedAmount,
      totalOrders
    };
  },
  
  // 显示保证金缴纳弹窗
  showDepositModal(checkResult) {
    const { stageText, needAmount, depositedAmount, totalOrders } = checkResult;
    
    let content = '';
    if (totalOrders <= this.data.depositConfig.rookieMax) {
      content = `您当前处于${stageText}（0-${this.data.depositConfig.rookieMax}单），无需缴纳保证金即可接单。`;
    } else {
      content = `您当前已完成${totalOrders}单，进入${stageText}。\n\n已缴纳保证金：¥${depositedAmount}\n还需缴纳：¥${needAmount}\n\n缴纳后方可开启接单。`;
    }
    
    wx.showModal({
      title: '保证金缴纳提示',
      content: content,
      confirmText: '立即缴纳',
      cancelText: '稍后再说',
      confirmColor: '#667eea',
      success: (res) => {
        if (res.confirm) {
          // 跳转到保证金页面或拉起支付
          this.processDepositPayment(needAmount);
        }
      }
    });
  },
  
  // 处理保证金支付
  processDepositPayment(amount) {
    if (amount <= 0) {
      wx.showToast({ title: '无需缴纳', icon: 'none' });
      return;
    }
    
    wx.showLoading({ title: '发起支付...' });
    
    // 模拟支付流程
    setTimeout(() => {
      wx.hideLoading();
      
      // 模拟支付成功
      wx.showModal({
        title: '确认支付',
        content: `需支付保证金 ¥${amount}，支付后即可开始接单。`,
        confirmText: '确认支付',
        confirmColor: '#667eea',
        success: (res) => {
          if (res.confirm) {
            // 模拟支付成功后的处理
            const newDepositedAmount = this.data.companionStats.depositedAmount + amount;
            this.setData({
              'companionStats.depositedAmount': newDepositedAmount
            });
            
            wx.showToast({
              title: '支付成功',
              icon: 'success',
              duration: 2000
            });
            
            // 重新检查状态，如果缴满了，询问是否立即开启接单
            setTimeout(() => {
              const checkResult = this.checkDepositStatus();
              if (checkResult.canWork) {
                wx.showModal({
                  title: '开启接单',
                  content: '保证金已缴满，是否立即开启接单？',
                  confirmText: '开启接单',
                  success: (res2) => {
                    if (res2.confirm) {
                      this.setData({ isWorking: true });
                      wx.showToast({
                        title: '已开始接单',
                        icon: 'success'
                      });
                    }
                  }
                });
              }
            }, 1500);
          }
        }
      });
    }, 500);
  },

  onDepart(e) {
    // 工作台"出发"跳转到订单详情页，由详情页完成完整流程：
    // 人脸识别 → LBS定位 → 到达100米内 → 开始服务
    const orderId = e.currentTarget.dataset.id;
    if (!orderId) return;
    wx.navigateTo({
      url: '/pages/b-order-detail/b-order-detail?id=' + orderId + '&type=direct'
    });
  },

  onContactUser(e) {
    const { id, name, avatar } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/chat/chat?id=${id}&name=${encodeURIComponent(name)}&avatar=${encodeURIComponent(avatar)}`
    });
  },

  onViewDetail(e) {
    const orderId = e.currentTarget.dataset.id;
    if (!orderId) {
      console.warn('订单ID为空');
      return;
    }
    wx.navigateTo({
      url: '/pages/b-order-detail/b-order-detail?id=' + orderId + '&type=direct',
      fail: (err) => {
        console.error('跳转失败', err);
        wx.showToast({ title: '跳转失败', icon: 'none' });
      }
    });
  },

  onAcceptOrder(e) {
    // 防抖：防止快速重复点击
    if (this.data.isAcceptingOrder) {
      return;
    }

    const orderId = e.currentTarget.dataset.id;
    const order = this.data.pendingOrders.find(o => o.id === orderId);
    if (!order) return;

    // 设置接单中标志
    this.setData({ isAcceptingOrder: true });

    // 检查保证金状态
    const canAccept = checkAcceptPermission({
      showModal: true,
      onCanAccept: () => {
        // 可以接单，显示确认弹窗
        this.showAcceptConfirm(order);
      },
      onCannotAccept: () => {
        // 不能接单，重置标志
        this.setData({ isAcceptingOrder: false });
      }
    });

    // 如果不能接单，直接返回（可以接单时由 onCanAccept 回调处理）
    if (!canAccept) {
      this.setData({ isAcceptingOrder: false });
      return;
    }
  },

  // 显示接单确认弹窗
  showAcceptConfirm(order) {
    wx.showModal({
      title: '确认接单',
      content: `确定接受来自 ${order.customerName} 的订单吗？`,
      confirmText: '立即接单',
      confirmColor: '#667eea',
      success: (res) => {
        // 重置防抖标志
        this.setData({ isAcceptingOrder: false });

        if (!res.confirm) return;

        this.executeAcceptOrder(order);
      }
    });
  },

  // 执行接单操作
  executeAcceptOrder(order) {
    const orderId = order.id;

    // 从待接单移除
    const pendingOrders = this.data.pendingOrders.filter(o => o.id !== orderId);

    // 停止该订单倒计时
    const timerKey = `order_${orderId}`;
    if (this.countdownTimers[timerKey]) {
      clearInterval(this.countdownTimers[timerKey]);
      delete this.countdownTimers[timerKey];
    }

    // 加入进行中（待服务）
    const newProcessing = {
      id: order.id,
      customerName: order.customerName,
      customerAvatar: order.customerAvatar,
      userGender: order.userGender,
      serviceType: order.serviceType,
      duration: order.duration,
      hourlyPrice: order.hourlyPrice,
      totalAmount: order.totalAmount,
      appointmentTime: order.appointmentTime,
      address: order.address,
      statusText: '待服务',
      status: 'accepted',
      serviceRemainingText: '',
      serviceProgress: 0
    };
    const processingOrders = [newProcessing, ...this.data.processingOrders];

    this.setData({ pendingOrders, processingOrders });
    wx.showToast({ title: '接单成功', icon: 'success' });
  },

  goToTaskSquare() {
    wx.navigateTo({
      url: '/pages/task-square/task-square',
      fail: (err) => {
        console.error('跳转失败', err);
        wx.showToast({ title: '跳转失败', icon: 'none' });
      }
    });
  },

  onTaskTap(e) {
    const taskId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/b-order-detail/b-order-detail?id=' + taskId + '&type=reward'
    });
  },

  onAddDeposit() {
    // 检查当前保证金状态并显示弹窗
    const checkResult = this.checkDepositStatus();
    if (checkResult.canWork) {
      wx.showToast({ title: '保证金已缴满', icon: 'none' });
    } else {
      this.showDepositModal(checkResult);
    }
  },
  
  // 显示保证金详情
  showDepositDetail() {
    const { depositStatus, depositConfig, companionStats } = this.data;
    const { stage, isFull } = depositStatus;
    
    let content = '';
    if (stage === 'rookie') {
      content = `当前阶段：新手期\n订单数：${companionStats.totalOrders}/${depositConfig.rookieMax}单\n状态：免保证金\n\n完成${depositConfig.rookieMax + 1}单后进入成长期，需缴纳¥${depositConfig.growthAmount}`;
    } else if (stage === 'growth') {
      content = `当前阶段：成长期\n订单数：${companionStats.totalOrders}单\n已缴纳：¥${companionStats.depositedAmount}\n需缴纳：¥${depositConfig.growthAmount}\n\n${isFull ? '已缴满，可以正常接单' : '缴纳完成后方可接单'}`;
    } else {
      content = `当前阶段：成熟期\n订单数：${companionStats.totalOrders}单\n已缴纳：¥${companionStats.depositedAmount}\n累计需缴：¥${depositConfig.matureAmount}\n\n${isFull ? '已缴满，可以正常接单' : '缴纳完成后方可接单'}`;
    }
    
    wx.showModal({
      title: '保证金详情',
      content: content,
      showCancel: !isFull,
      cancelText: '关闭',
      confirmText: isFull ? '知道了' : '去缴纳',
      success: (res) => {
        if (!isFull && res.confirm) {
          const checkResult = this.checkDepositStatus();
          this.showDepositModal(checkResult);
        }
      }
    });
  },

  // 开始工作/接单
  onStartWork() {
    this.setData({ isWorking: true });
    wx.showToast({
      title: '开始接单',
      icon: 'success'
    });
  },

  // ===== 新订单弹窗相关 =====

  showNewOrderPopup(order) {
    // 先把新订单插入到待接单列表头部（弹窗只是提醒，订单本身在列表中持续存在）
    const newOrder = {
      ...order,
      countdown: 1800,
      countdownText: '30:00',
      status: 'pending_accept'
    };
    const pendingOrders = [newOrder, ...this.data.pendingOrders];
    this.setData({
      pendingOrders,
      newOrderPopup: {
        show: true,
        acceptCountdown: 30,
        order
      }
    });

    // 为新订单启动倒计时
    const timerKey = `order_${order.id}`;
    if (!this.countdownTimers[timerKey]) {
      this.countdownTimers[timerKey] = setInterval(() => {
        const currentIndex = this.data.pendingOrders.findIndex(o => o.id === order.id);
        if (currentIndex === -1) {
          clearInterval(this.countdownTimers[timerKey]);
          delete this.countdownTimers[timerKey];
          return;
        }
        this.updateCountdown(order.id, currentIndex);
      }, 1000);
    }

    // 启动弹窗提醒倒计时
    this.startPopupCountdown();

    // 振动提醒
    wx.vibrateShort({ type: 'heavy' });
    setTimeout(() => wx.vibrateShort({ type: 'medium' }), 300);
    setTimeout(() => wx.vibrateShort({ type: 'heavy' }), 600);
  },

  startPopupCountdown() {
    this.stopPopupCountdown();
    this.popupCountdownTimer = setInterval(() => {
      const cur = this.data.newOrderPopup.acceptCountdown;
      if (cur <= 1) {
        // 倒计时结束，自动关闭弹窗
        this.closeNewOrderPopup();
        return;
      }
      this.setData({ 'newOrderPopup.acceptCountdown': cur - 1 });
    }, 1000);
  },

  stopPopupCountdown() {
    if (this.popupCountdownTimer) {
      clearInterval(this.popupCountdownTimer);
      this.popupCountdownTimer = null;
    }
  },

  closeNewOrderPopup() {
    this.stopPopupCountdown();
    this.setData({ 'newOrderPopup.show': false });
  },

  // 点击蒙层（忽略，不允许随意关闭——订单有紧迫性）
  onPopupOverlayTap() {
    // 不允许点蒙层关闭，保留紧迫感
  },

  stopPropagation() {
    // 阻止事件冒泡
  },

  // 弹窗"查看详情"
  onPopupViewDetail() {
    const orderId = this.data.newOrderPopup.order.id;
    this.closeNewOrderPopup();
    wx.navigateTo({
      url: '/pages/b-order-detail/b-order-detail?id=' + orderId + '&type=direct'
    });
  },

  // 清理弹窗 timeout
  clearPopupTimeouts() {
    if (this._popupTimeouts) {
      this._popupTimeouts.forEach(id => clearTimeout(id));
      this._popupTimeouts = [];
    }
  },

  // 弹窗"立即接单"
  onPopupAccept() {
    const order = this.data.newOrderPopup.order;
    
    // 检查保证金状态
    const canAccept = checkAcceptPermission({
      showModal: true,
      onCanAccept: () => {
        this.showPopupAcceptConfirm(order);
      }
    });

    // 可以接单时由 onCanAccept 回调处理，无需在此重复调用
  },

  // 显示弹窗接单确认
  showPopupAcceptConfirm(order) {
    wx.showModal({
      title: '确认接单',
      content: `确定接受来自 ${order.customerName} 的订单吗？`,
      confirmText: '立即接单',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (!res.confirm) return;

        // 从待接单列表移除
        const pendingOrders = this.data.pendingOrders.filter(o => o.id !== order.id);

        // 停止该订单的倒计时
        const timerKey = `order_${order.id}`;
        if (this.countdownTimers[timerKey]) {
          clearInterval(this.countdownTimers[timerKey]);
          delete this.countdownTimers[timerKey];
        }

        // 加入进行中列表（状态：待服务）
        const newProcessing = {
          id: order.id,
          customerName: order.customerName,
          customerAvatar: order.customerAvatar,
          userGender: order.userGender,
          serviceType: order.serviceType,
          duration: order.duration,
          hourlyPrice: order.hourlyPrice,
          totalAmount: order.totalAmount,
          appointmentTime: order.appointmentTime,
          address: order.address,
          statusText: '待服务',
          status: 'accepted',
          serviceRemainingText: '',
          serviceProgress: 0
        };
        const processingOrders = [newProcessing, ...this.data.processingOrders];

        this.closeNewOrderPopup();
        this.setData({ pendingOrders, processingOrders });
        wx.showToast({ title: '接单成功！', icon: 'success', duration: 2000 });
      }
    });
  },

  onTabChange(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    const pages = [
      '/pages/workbench/workbench',
      '/pages/b-order-list/b-order-list',
      '/pages/message/message',
      '/pages/profile/profile'
    ];
    
    if (index === 0) return;
    
    wx.switchTab({
      url: pages[index]
    });
  }
});
