// pages/deposit/deposit.js - 保证金缴纳页
// 与后台一致：按订单量阶段计算保证金
Page({
  data: {
    // 当前订单数量
    orderCount: 0,
    
    // 保证金配置（从后台获取）
    depositConfig: {
      rookieMax: 1,        // 新手期最大订单数（0-rookieMax单免保证金）
      growthMax: 10,       // 成长期最大订单数（rookieMax+1 到 growthMax单）
      growthAmount: 99,    // 成长期需缴纳金额
      matureAmount: 500    // 成熟期累计需缴纳金额
    },
    
    // 当前阶段信息
    currentStage: 'rookie', // rookie: 新手期, growth: 成长期, mature: 成熟期
    currentStageText: '新手期',
    
    // 已缴纳保证金
    depositedAmount: 0,
    
    // 当前阶段状态
    stageStatus: 'free', // free: 免保证金, partial: 部分缴纳, full: 已缴满
    
    // 支付相关
    paymentMethod: 'wechat',
    paying: false,
    
    // 协议同意
    agreementChecked: false
  },

  onLoad() {
    this.loadDepositData();
  },

  onShow() {
    this.loadDepositData();
  },

  // 加载保证金数据
  loadDepositData() {
    // 从服务器或本地存储获取数据
    const orderCount = wx.getStorageSync('companionOrderCount') || 0;
    const depositedAmount = wx.getStorageSync('depositedAmount') || 0;
    
    // 获取后台配置（实际应从服务器获取）
    const config = wx.getStorageSync('depositConfig') || this.data.depositConfig;
    
    // 计算当前阶段
    const stageInfo = this.calculateStage(orderCount, depositedAmount, config);
    
    this.setData({
      orderCount,
      depositedAmount,
      depositConfig: config,
      ...stageInfo
    });
  },

  // 计算当前阶段和状态
  calculateStage(orderCount, depositedAmount, config) {
    let currentStage, currentStageText, stageStatus, needPay = 0;
    
    if (orderCount <= config.rookieMax) {
      // 新手期：0-rookieMax单，免保证金
      currentStage = 'rookie';
      currentStageText = '新手期';
      stageStatus = 'free';
    } else if (orderCount <= config.growthMax) {
      // 成长期：rookieMax+1 到 growthMax单
      currentStage = 'growth';
      currentStageText = '成长期';
      
      if (depositedAmount >= config.growthAmount) {
        stageStatus = 'full';
      } else {
        stageStatus = 'partial';
        needPay = config.growthAmount - depositedAmount;
      }
    } else {
      // 成熟期：growthMax+1单及以上
      currentStage = 'mature';
      currentStageText = '成熟期';
      
      if (depositedAmount >= config.matureAmount) {
        stageStatus = 'full';
      } else {
        stageStatus = 'partial';
        needPay = config.matureAmount - depositedAmount;
      }
    }
    
    return { currentStage, currentStageText, stageStatus, needPay };
  },

  // 选择支付方式
  selectPayment(e) {
    this.setData({
      paymentMethod: e.currentTarget.dataset.method
    });
  },

  // 切换协议同意
  toggleAgreement() {
    this.setData({
      agreementChecked: !this.data.agreementChecked
    });
  },

  // 显示保证金协议
  showAgreementModal() {
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=deposit'
    });
  },

  // 支付保证金
  onPay() {
    if (!this.data.agreementChecked) {
      wx.showToast({
        title: '请先同意保证金协议',
        icon: 'none'
      });
      return;
    }

    const { needPay, paymentMethod } = this.data;
    
    if (needPay <= 0) {
      wx.showToast({
        title: '当前无需缴纳保证金',
        icon: 'none'
      });
      return;
    }

    this.setData({ paying: true });
    wx.showLoading({ title: '支付中...' });

    // 模拟支付流程
    setTimeout(() => {
      wx.hideLoading();
      
      wx.showModal({
        title: '确认支付',
        content: `使用${paymentMethod === 'wechat' ? '微信支付' : '支付宝'}支付¥${needPay}？`,
        confirmText: '确认支付',
        success: (res) => {
          if (res.confirm) {
            this.processPayment(needPay);
          } else {
            this.setData({ paying: false });
          }
        }
      });
    }, 500);
  },

  // 处理支付（TODO: 接入微信支付后调用 POST /api/b/deposit/pay 获取 prepay_id）
  processPayment(amount) {
    this.setData({ paying: false });
    wx.showModal({
      title: '保证金缴纳开发中',
      content: '微信支付接口正在接入中，预计近期上线，届时您将可以通过微信支付缴纳保证金。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 申请退还保证金
  onRefund() {
    wx.showModal({
      title: '申请退还保证金',
      content: '退还保证金后，您将无法继续接单。确认申请退还吗？',
      confirmText: '确认申请',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          this.checkActiveOrders();
        }
      }
    });
  },

  // 检查进行中的订单
  checkActiveOrders() {
    const hasActiveOrders = wx.getStorageSync('companionHasActiveOrders') || false;

    if (hasActiveOrders) {
      wx.showModal({
        title: '无法退还',
        content: '您有进行中的订单，请先完成所有订单后再申请退还保证金。',
        showCancel: false
      });
    } else {
      wx.showLoading({ title: '提交申请...' });
      
      setTimeout(() => {
        wx.hideLoading();
        wx.showModal({
          title: '申请已提交',
          content: '您的退还申请已提交，平台将在7个工作日内审核，审核通过后保证金将原路退回。',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
      }, 1000);
    }
  },

  // 联系客服
  contactService() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-888-8888\n服务时间：9:00-21:00',
      confirmText: '拨打',
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({
            phoneNumber: '400-888-8888'
          });
        }
      }
    });
  },

  // 返回
  goBack() {
    wx.navigateBack();
  }
});
