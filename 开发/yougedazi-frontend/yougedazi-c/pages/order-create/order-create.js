// pages/order-create/order-create.js
const api = require('../../utils/api');
const configService = require('../../utils/config-service');
const { VALIDATE_MESSAGES } = require('../../utils/constants');

Page({
  data: {
    // 搭子信息
    companionInfo: {
      id: 1,
      nickname: '张三',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
      gender: '女',
      age: 22,
      location: '厦门市'
    },
    
    // 已选服务
    selectedService: {
      id: 1,
      name: '派对',
      price: 300,
      duration: 60,
      image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=200'
    },
    
    // 时长和费用
    duration: 3,
    minDuration: 3,
    servicePrice: 900,
    totalAmount: 900,
    
    // 预约时间
    selectedDate: '',
    selectedDateValue: '',
    today: '',
    maxDate: '',
    selectedTime: '',
    
    // 地址
    selectedAddress: '',
    
    // 备注
    remark: '',
    
    // 提交状态
    canSubmit: false,
    isSubmitting: false
  },

  navTimer: null,

  // 检查字符串是否包含表情符号（全面的Unicode范围）
  containsEmoji(str) {
    const emojiRegex = /[\u{1F000}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F300}-\u{1F5FF}]|[\u{200D}]|[\u{20E3}]|[\u{FE0F}]/gu;
    return emojiRegex.test(str);
  },

  // 过滤字符串中的表情符号
  filterEmoji(str) {
    return str.replace(/[\u{1F000}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F300}-\u{1F5FF}]|[\u{200D}]|[\u{20E3}]|[\u{FE0F}]/gu, '');
  },

  onUnload() {
    if (this.navTimer) clearTimeout(this.navTimer);
  },

  onLoad(options) {
    // 接收详情页传递的参数
    if (options.serviceId) {
      // 解码服务名称（处理 URL 编码的中文）
      let serviceName = options.serviceType || '服务项目';
      try {
        serviceName = decodeURIComponent(serviceName);
      } catch (e) {
        // 解码失败则保持原值
      }
      
      // 解码 icon 路径（处理 URL 编码的 / 和中文字符）
      let iconPath = options.icon || '';
      try {
        iconPath = decodeURIComponent(iconPath);
      } catch (e) {
        // 解码失败则保持原值
      }
      
      this.setData({
        'selectedService.id': parseInt(options.serviceId),
        'selectedService.name': serviceName,
        'selectedService.price': parseInt(options.price) || 0,
        'selectedService.icon': iconPath,
        duration: parseInt(options.duration) || 3,
        minDuration: parseInt(options.duration) || 3
      });
    }
    
    if (options.companionId) {
      this.loadCompanionInfo(options.companionId);
    }
    
    this.calculatePrice();
    
    // 初始化日期范围和时间段
    this.initDateTimePickers();
    
    // 设置默认预约时间
    this.setDefaultAppointmentTime();
  },
  
  // 设置默认预约时间：当前时间
  setDefaultAppointmentTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');

    // 设置日期值（YYYY-MM-DD格式）
    const dateValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const timeValue = `${hour}:${minute}`;

    this.setData({
      selectedDateValue: dateValue,
      selectedDate: `${month}月${day}日`,
      selectedTime: timeValue
    });

    this.checkCanSubmit();
  },

  // 加载搭子信息（从后端获取）
  loadCompanionInfo(companionId) {
    const app = getApp();
    app.request({ url: api.companions.detail(companionId) })
      .then(res => {
        if (res && res.data) {
          this.setData({ companionInfo: res.data });
        }
      })
      .catch(() => {
        wx.showToast({ title: '加载搭子信息失败', icon: 'none' });
      });
  },

  // 减少时长
  onDecreaseDuration() {
    if (this.data.duration <= this.data.minDuration) {
      wx.showToast({
        title: VALIDATE_MESSAGES.MINIMUM_DURATION(this.data.minDuration),
        icon: 'none'
      });
      return;
    }
    const newDuration = this.data.duration - 1;
    this.setData({ duration: newDuration });
    this.calculatePrice();
  },

  // 增加时长
  onIncreaseDuration() {
    const newDuration = this.data.duration + 1;
    const maxDuration = configService.getMaxServiceDuration();
    if (newDuration > maxDuration) {
      wx.showToast({
        title: VALIDATE_MESSAGES.DURATION_TOO_LONG(maxDuration),
        icon: 'none'
      });
      return;
    }
    this.setData({ duration: newDuration });
    this.calculatePrice();
  },

  // 计算价格
  calculatePrice() {
    const servicePrice = this.data.selectedService.price * this.data.duration;
    const totalAmount = servicePrice;
    
    this.setData({
      servicePrice,
      totalAmount
    });
    
    this.checkCanSubmit();
  },

  // 初始化日期和时间选择器
  initDateTimePickers() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    // 今天日期字符串（YYYY-MM-DD 格式）
    const today = `${year}-${month}-${day}`;

    // N天后最大日期（使用规则控制预约范围）
    const maxDate = new Date(now.getTime() + configService.getAppointmentRangeMs());
    const maxYear = maxDate.getFullYear();
    const maxMonth = String(maxDate.getMonth() + 1).padStart(2, '0');
    const maxDay = String(maxDate.getDate()).padStart(2, '0');
    const maxDateStr = `${maxYear}-${maxMonth}-${maxDay}`;

    this.setData({
      today,
      maxDate: maxDateStr
    });
  },

  // 日期选择变化
  onDateChange(e) {
    const dateValue = e.detail.value;
    const date = new Date(dateValue);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    this.setData({
      selectedDateValue: dateValue,
      selectedDate: `${month}月${day}日`
    });
    
    this.checkCanSubmit();
  },

  // 时间选择变化
  onTimeChange(e) {
    const timeValue = e.detail.value;

    this.setData({
      selectedTime: timeValue
    });

    this.checkCanSubmit();
  },

  // 选择地址
  onSelectAddress() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          selectedAddress: res.name || res.address
        });
        this.checkCanSubmit();
      }
    });
  },

  // 备注输入
  onRemarkInput(e) {
    const value = e.detail.value;
    // 实时过滤表情符号
    const filteredValue = this.filterEmoji(value);
    
    this.setData({
      remark: filteredValue
    });
    
    // 如果输入包含表情符号，显示提示
    if (value !== filteredValue) {
      wx.showToast({
        title: '描述不能包含表情符号',
        icon: 'none',
        duration: 1500
      });
    }
    
    // 返回过滤后的值以更新输入框显示
    return filteredValue;
  },

  // 检查是否可以提交
  checkCanSubmit() {
    const canSubmit = this.data.selectedDate &&
                      this.data.selectedTime &&
                      this.data.selectedAddress &&
                      this.data.totalAmount > 0;
    this.setData({ canSubmit });
  },

  // 提交订单
  onSubmit() {
    if (this.data.isSubmitting) {
      wx.showToast({ title: '正在提交，请勿重复点击', icon: 'none' });
      return;
    }

    // 5: 过往时间校验（不能选择过去的时间 - 支持跨天验证）
    try {
      const label = this.data.selectedDate
      const timeStr = this.data.selectedTime
      if (label && timeStr) {
        const m = label.match(/(\d+)月(\d+)日/)
        const t = timeStr.match(/(\d+):(\d+)/)
        if (m && t) {
          const y = new Date().getFullYear()
          const month = parseInt(m[1], 10) - 1
          const day = parseInt(m[2], 10)
          const hour = parseInt(t[1], 10)
          const minute = parseInt(t[2], 10)
          const now = new Date()

          // 构建完整的日期时间对象进行比较（支持跨天验证）
          const selectedDateTime = new Date(y, month, day, hour, minute, 0)

          if (selectedDateTime < now) {
            wx.showToast({ title: '不能选择过去的时间', icon: 'none' })
            return
          }
        }
      }
    } catch (err) {
        const logger = require('../../utils/logger');
        logger.error(logger.Categories.UI, 'Time validation error', err);
    }

    // 验证备注字段是否包含表情符号
    if (this.data.remark && this.containsEmoji(this.data.remark)) {
      wx.showToast({ title: '描述不能包含表情符号', icon: 'none' });
      return;
    }

    // 验证地址是否包含表情符号
    if (this.data.selectedAddress && this.containsEmoji(this.data.selectedAddress)) {
      wx.showToast({ title: '地址不能包含表情符号', icon: 'none' });
      return;
    }

    if (!this.data.canSubmit) {
      if (!this.data.selectedDate || !this.data.selectedTime) {
        wx.showToast({ title: '请选择预约时间', icon: 'none' });
      } else if (!this.data.selectedAddress) {
        wx.showToast({ title: '请选择服务地址', icon: 'none' });
      }
      return;
    }

    // 后端 API 需要的字段（POST /api/c/orders）
    const orderData = {
      companion_id: this.data.companionInfo.id,   // 后端：companion_id (uuid)
      service_id:   this.data.selectedService.id, // 后端：service_id (uuid)
      order_type:   'direct',                     // 后端：order_type = 'direct' | 'reward'
      duration:     this.data.duration,           // 后端：duration (小时，1-24)
      user_remark:  this.data.remark || undefined // 后端：user_remark (optional)
    };

    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '提交中...' });

    const app = getApp();
    app.request({ url: api.orders.create(), method: 'POST', data: orderData })
      .then(res => {
        wx.hideLoading();
        this.setData({ isSubmitting: false });
        // 后端返回 order.id 和 prepay_params，直接调起支付
        const orderId = res.data && res.data.id;
        const prepayParams = res.data && res.data.prepay_params;
        
        if (!prepayParams) {
          wx.showToast({ title: '获取支付参数失败', icon: 'none' });
          return;
        }
        
        wx.requestPayment({
          timeStamp: prepayParams.timeStamp,
          nonceStr: prepayParams.nonceStr,
          package: prepayParams.package,
          signType: prepayParams.signType || 'RSA',
          paySign: prepayParams.paySign,
          success: () => {
            // 支付成功，跳转到订单详情
            wx.navigateTo({
              url: `/pages/order-detail/order-detail?id=${orderId}`
            });
          },
          fail: (err) => {
            // 支付失败或取消，停留在当前页面
            if (err.errMsg && err.errMsg.includes('cancel')) {
              wx.showToast({ title: '支付已取消', icon: 'none' });
            } else {
              wx.showToast({ title: '支付失败，请重试', icon: 'none' });
            }
          }
        });
      })
      .catch(err => {
        wx.hideLoading();
        this.setData({ isSubmitting: false });
        wx.showToast({ title: (err && err.message) || '下单失败，请重试', icon: 'none' });
      });
  },

});
