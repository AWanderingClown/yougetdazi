const app = getApp();
const { TIMER, VALIDATE_MESSAGES } = require('../../utils/constants');
const api = require('../../utils/api');
const configService = require('../../utils/config-service');

Page({
  data: {
    // 表单数据
    serviceType: '',
    hourlyRate: '',
    duration: '',
    requiredCount: 1,
    appointmentTime: '',
    address: '',
    description: '',
    gender: 'any',
    latitude: null,
    longitude: null,

    // 计算金额
    totalAmount: 0,

    // 时间选择器
    timeRange: [],
    timeIndex: [0, 0],

    // 服务类型弹窗
    showServicePopup: false,
    // 服务类型参考首页分类
    serviceTypes: [
      { id: 1, name: '逛街', icon: '/assets/icons/categories/购物车.png' },
      { id: 2, name: '运动', icon: '/assets/icons/categories/棒球.png' },
      { id: 3, name: '餐饮', icon: '/assets/icons/categories/刀叉.png' },
      { id: 4, name: '棋牌/密室', icon: '/assets/icons/categories/扑克.png' },
      { id: 5, name: '电竞', icon: '/assets/icons/categories/游戏.png' },
      { id: 6, name: '酒吧/K歌', icon: '/assets/icons/categories/鸡尾酒.png' },
      { id: 7, name: '派对', icon: '/assets/icons/categories/派对.png' },
      { id: 8, name: '茶艺', icon: '/assets/icons/categories/茶壶.png' },
      { id: 9, name: '电影/影视', icon: '/assets/icons/categories/影视.png' },
      { id: 10, name: '旅游向导', icon: '/assets/icons/categories/飞机.png' }
    ],

    // 表单验证
    canSubmit: false,
    // 是否正在提交
    isSubmitting: false,

    // 支付弹窗
    showPayModal: false,
    // 发布成功弹窗
    showSuccessModal: false,
    // 倒计时（30分钟）
    countdown: TIMER.GRAB_COUNTDOWN,
    countdownText: '30:00',
    countdownTimer: null,
    // 发布的订单ID
    publishedOrderId: ''
  },

  onLoad() {
    this.initTimeRange();
    this.loadLastAddress();
  },

  onUnload() {
    // 页面卸载时清除倒计时
    if (this.data.countdownTimer) {
      clearInterval(this.data.countdownTimer);
    }
  },

  // 初始化时间选择器，默认选中当前时间
  initTimeRange() {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const weekDay = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
      days.push(`${month}月${day}日 ${weekDay}`);
    }

    const hours = [];
    for (let i = 0; i < 24; i++) {
      hours.push(`${i}:00`);
      hours.push(`${i}:30`);
    }

    // 计算默认选中当前时间
    const currentHour = today.getHours();
    const currentMinute = today.getMinutes();
    // 如果当前分钟>30，选下一个整点；否则选当前整点或半点
    let hourIndex;
    if (currentMinute > 30) {
      hourIndex = (currentHour + 1) * 2; // 下一个整点
    } else if (currentMinute > 0) {
      hourIndex = currentHour * 2 + 1; // 当前半点
    } else {
      hourIndex = currentHour * 2; // 当前整点
    }
    // 确保不超过范围
    if (hourIndex >= hours.length) hourIndex = hours.length - 1;

    const defaultDay = days[0];
    const defaultHour = hours[hourIndex];

    this.setData({
      timeRange: [days, hours],
      timeIndex: [0, hourIndex],
      appointmentTime: `${defaultDay} ${defaultHour}`
    });
  },

  // 加载上次使用的地址
  loadLastAddress() {
    const lastAddress = wx.getStorageSync('lastOrderAddress');
    if (lastAddress) {
      this.setData({
        address: lastAddress.address,
        latitude: lastAddress.latitude,
        longitude: lastAddress.longitude
      });
    }
  },

  // 选择服务类型
  onSelectServiceType() {
    this.setData({ showServicePopup: true });
  },

  onClosePopup() {
    this.setData({ showServicePopup: false });
  },

  onPopupContentTap(e) {
    // catchtap 已阻止事件冒泡，无需调用 stopPropagation
    // 保留此方法以防止点击弹窗内容时关闭弹窗
  },

  onSelectService(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      serviceType: item.name,
      showServicePopup: false
    }, () => {
      this.checkCanSubmit();
    });
  },

  // 输入每小时金额
  onHourlyRateInput(e) {
    const value = e.detail.value;
    // 验证最低20元
    if (value && parseFloat(value) < 20) {
      wx.showToast({
        title: VALIDATE_MESSAGES.MINIMUM_HOURLY_RATE,
        icon: 'none'
      });
    }
    this.setData({ hourlyRate: value });
    this.calculateAmount();
    this.checkCanSubmit();
  },

  // 输入服务时长
  onDurationInput(e) {
    const value = e.detail.value;
    // 验证不能超过最大时长限制
    const maxDuration = configService.getMaxServiceDuration();
    if (value && parseFloat(value) > maxDuration) {
      wx.showToast({
        title: VALIDATE_MESSAGES.DURATION_TOO_LONG(maxDuration),
        icon: 'none'
      });
      return;
    }
    this.setData({ duration: value });
    this.calculateAmount();
    this.checkCanSubmit();
  },

  // 调整需要人数
  onDecreaseCount() {
    if (this.data.requiredCount <= 1) return;
    this.setData({
      requiredCount: this.data.requiredCount - 1
    }, () => {
      this.calculateAmount();
    });
  },

  onIncreaseCount() {
    if (this.data.requiredCount >= 10) return;
    this.setData({
      requiredCount: this.data.requiredCount + 1
    }, () => {
      this.calculateAmount();
    });
  },

  // 选择时间
  onTimeChange(e) {
    const [dayIndex, hourIndex] = e.detail.value;
    const day = this.data.timeRange[0][dayIndex];
    const hour = this.data.timeRange[1][hourIndex];
    this.setData({
      timeIndex: [dayIndex, hourIndex],
      appointmentTime: `${day} ${hour}`
    }, () => {
      this.checkCanSubmit();
    });
  },

  // 选择地址
  onSelectAddress() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          address: res.address + (res.name ? ` (${res.name})` : ''),
          latitude: res.latitude,
          longitude: res.longitude
        }, () => {
          this.checkCanSubmit();
        });

        // 保存地址供下次使用
        wx.setStorageSync('lastOrderAddress', {
          address: res.address + (res.name ? ` (${res.name})` : ''),
          latitude: res.latitude,
          longitude: res.longitude
        });
      },
      fail: () => {
        wx.showToast({
          title: '请选择地址',
          icon: 'none'
        });
      }
    });
  },

  // 输入详细需求
  onDescriptionInput(e) {
    const value = e.detail.value;
    this.setData({ description: value }, () => {
      this.checkCanSubmit();
    });
  },

  // 选择性别
  onGenderChange(e) {
    this.setData({ gender: e.currentTarget.dataset.value });
  },

  // 计算总金额
  calculateAmount() {
    const rate = parseFloat(this.data.hourlyRate) || 0;
    const duration = parseFloat(this.data.duration) || 0;
    const count = this.data.requiredCount;
    const total = rate * duration * count;
    this.setData({ totalAmount: total.toFixed(0) });
  },

  // 检查是否可以提交（详细需求非必填）
  checkCanSubmit() {
    const { serviceType, hourlyRate, duration, appointmentTime, address } = this.data;
    const rate = parseFloat(hourlyRate) || 0;
    const dur = parseFloat(duration) || 0;
    // 验证最低20元/小时
    const canSubmit = serviceType && rate >= 20 && dur > 0 && appointmentTime && address;
    this.setData({ canSubmit });
  },

  // 点击提交按钮 - 显示支付确认弹窗
  onSubmit() {
    if (!this.data.canSubmit) return;
    
    this.setData({
      showPayModal: true
    });
  },

  // 关闭支付弹窗
  onClosePayModal() {
    this.setData({
      showPayModal: false
    });
  },

  // 确认支付
  onConfirmPay() {
    // 防止重复点击
    if (this.data.isSubmitting) return;
    this.setData({ isSubmitting: true });
    
    this.setData({
      showPayModal: false
    });
    
    // 调起微信支付
    this.requestPayment();
  },

  // 微信支付
  requestPayment() {
    const app = getApp();
    wx.showLoading({ title: '下单中...' });

    const orderBody = {
      service_id:  this.data.serviceId,
      order_type:  'reward',
      duration:    parseInt(this.data.duration),
      user_remark: this.data.description || undefined,
    };

    app.request({ url: api.orders.create(), method: 'POST', data: orderBody })
      .then(res => {
        const prepayParams = res.data.prepay_params;
        const orderId = res.data.order_id;
        wx.hideLoading();
        wx.requestPayment({
          ...prepayParams,
          success: () => {
            this.afterPaymentSuccess(orderId);
          },
          fail: (err) => {
            if (err.errMsg && err.errMsg.includes('cancel')) {
              wx.showToast({ title: '已取消支付', icon: 'none' });
            } else {
              wx.showToast({ title: '支付失败，请重试', icon: 'none' });
            }
            this.setData({ isSubmitting: false });
          },
        });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '下单失败', icon: 'none' });
        this.setData({ isSubmitting: false });
      });
  },

  // 支付成功后跳转到订单详情
  afterPaymentSuccess(orderId) {
    this.setData({
      showSuccessModal: true,
      publishedOrderId: orderId,
    });
    this.startCountdown();
  },

  // 开始倒计时（30分钟）
  startCountdown() {
    const timer = setInterval(() => {
      let countdown = this.data.countdown - 1;

      if (countdown <= 0) {
        // 倒计时结束，自动退款
        clearInterval(timer);
        this.autoRefund();
        return;
      }

      // 格式化倒计时显示
      const minutes = Math.floor(countdown / 60);
      const seconds = countdown % 60;
      const countdownText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      this.setData({
        countdown,
        countdownText
      });
    }, TIMER.UI_TICK_INTERVAL_MS);
    
    this.setData({
      countdownTimer: timer
    });
  },

  // 自动退款
  autoRefund() {
    // 更新订单状态为已取消（超时退款）
    const rewardOrders = wx.getStorageSync('reward_orders') || [];
    const updatedOrders = rewardOrders.map(order => {
      if (order.id === this.data.publishedOrderId) {
        return {
          ...order,
          status: 'cancelled',
          cancelReason: '超时未接单，自动退款'
        };
      }
      return order;
    });
    wx.setStorageSync('reward_orders', updatedOrders);
    
    // 显示退款提示
    const countdownMinutes = TIMER.GRAB_COUNTDOWN / 60;
    wx.showModal({
      title: '任务超时',
      content: `${countdownMinutes}分钟内无搭子接单，资金已原路退回`,
      showCancel: false,
      success: () => {
        this.setData({
          showSuccessModal: false
        });
        wx.redirectTo({
          url: '/pages/order-list/order-list'
        });
      }
    });
  },

  // 关闭成功弹窗
  onCloseSuccessModal() {
    if (this.data.countdownTimer) {
      clearInterval(this.data.countdownTimer);
    }
    this.setData({
      showSuccessModal: false
    });
    wx.redirectTo({
      url: '/pages/order-detail/order-detail?id=' + this.data.publishedOrderId + '&type=reward'
    });
  },

  // 查看订单详情
  onViewOrder() {
    if (this.data.countdownTimer) {
      clearInterval(this.data.countdownTimer);
    }
    this.setData({
      showSuccessModal: false
    });
    wx.redirectTo({
      url: '/pages/order-detail/order-detail?id=' + this.data.publishedOrderId + '&type=reward'
    });
  }
});
