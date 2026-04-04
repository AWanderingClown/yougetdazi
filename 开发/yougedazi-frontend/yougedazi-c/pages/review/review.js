// pages/review/review.js
const { CANCEL_RULE } = require('../../utils/constants');

Page({
  data: {
    // 导航栏高度
    navBarHeight: 88,
    statusBarHeight: 20,
    
    // 订单信息
    id: '',
    
    // 搭子信息
    companionInfo: {
      nickname: '张三',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200'
    },
    serviceType: '电竞',
    duration: 2,
    
    // 评分
    rating: 5,
    ratingText: '非常满意',
    
    // 评价标签
    tags: [
      { id: 1, name: '服务态度好', selected: false },
      { id: 2, name: '准时到达', selected: false },
      { id: 3, name: '技术专业', selected: false },
      { id: 4, name: '沟通顺畅', selected: false },
      { id: 5, name: '形象气质佳', selected: false },
      { id: 6, name: '值得推荐', selected: false }
    ],
    
    // 评价内容
    content: '',
    
    // 匿名评价
    isAnonymous: false,
    
    // 是否可以提交
    canSubmit: true
  },

  onLoad(options) {
    const { id } = options;
    
    // 计算导航栏高度
    this.calcNavBarHeight();
    
    // 检查是否超过24小时评价期限
    if (this.checkReviewDeadline(id)) {
      wx.showModal({
        title: '提示',
        content: '订单已完成超过24小时，系统自动给出5星好评',
        showCancel: false,
        confirmText: '知道了',
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }
    
    // 加载订单信息
    this.loadOrderInfo(id);
  },
  
  // 安全解析时间戳
  safeParseTime(timeStr) {
    if (!timeStr) return null;
    const time = new Date(timeStr).getTime();
    return isNaN(time) ? null : time;
  },

  // 检查评价是否超过24小时期限
  checkReviewDeadline(orderId) {
    // 优先查普通订单
    const directOrders = wx.getStorageSync('direct_orders') || [];
    const direct = directOrders.find(o => o.id === orderId);
    if (direct && direct.completedAt) {
      const completedTime = this.safeParseTime(direct.completedAt);
      if (!completedTime) return false;
      return (Date.now() - completedTime) > CANCEL_RULE.TWENTY_FOUR_HOURS;
    }
    
    // 查悬赏订单
    const rewardOrders = wx.getStorageSync('reward_orders') || [];
    const reward = rewardOrders.find(o => o.id === orderId);
    if (reward && reward.completedAt) {
      const completedTime = this.safeParseTime(reward.completedAt);
      if (!completedTime) return false;
      return (Date.now() - completedTime) > CANCEL_RULE.TWENTY_FOUR_HOURS;
    }
    
    return false;
  },

  // 计算导航栏高度（适配系统胶囊按钮位置，延伸到胶囊下方）
  calcNavBarHeight() {
    const windowInfo = wx.getWindowInfo();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    
    // 导航栏高度 = 胶囊按钮底部位置 + 下方间距（延伸到胶囊下方）
    const navBarHeight = menuButtonInfo.bottom + 12;
    
    this.setData({
      navBarHeight: navBarHeight,
      statusBarHeight: windowInfo.statusBarHeight
    });
  },

  // 加载订单信息（从 localStorage 读取，对接后端后改为 API 调用）
  loadOrderInfo(id) {
    if (!id) return;
    this.setData({ id });

    // 优先查普通订单
    const directOrders = wx.getStorageSync('direct_orders') || [];
    const direct = directOrders.find(o => o.id === id);
    if (direct) {
      this.setData({
        companionInfo: direct.companionInfo || this.data.companionInfo,
        serviceType: direct.orderInfo.serviceType || '',
        duration: direct.orderInfo.duration || 0
      });
      return;
    }

    // 查悬赏订单
    const rewardOrders = wx.getStorageSync('reward_orders') || [];
    const reward = rewardOrders.find(o => o.id === id);
    if (reward) {
      this.setData({
        serviceType: reward.serviceType || '',
        duration: reward.duration || 0
      });
    }
  },

  // 点击星星评分
  onStarTap(e) {
    const star = e.currentTarget.dataset.star;
    const ratingTexts = ['', '非常差', '差', '一般', '满意', '非常满意'];
    
    this.setData({
      rating: star,
      ratingText: ratingTexts[star]
    });
  },

  // 点击标签
  onTagTap(e) {
    const id = e.currentTarget.dataset.id;
    const tags = this.data.tags.map(tag => {
      if (tag.id === id) {
        return { ...tag, selected: !tag.selected };
      }
      return tag;
    });
    
    this.setData({ tags });
  },

  // 输入评价内容
  onContentInput(e) {
    this.setData({
      content: e.detail.value
    });
  },

  // 切换匿名评价
  onAnonymousChange() {
    this.setData({
      isAnonymous: !this.data.isAnonymous
    });
  },

  // 提交评价
  onSubmit() {
    if (!this.data.canSubmit) return;

    const selectedTags = this.data.tags.filter(t => t.selected).map(t => t.name);

    const reviewData = {
      id: this.data.id,
      rating: this.data.rating,
      tags: selectedTags,
      content: this.data.content,
      isAnonymous: this.data.isAnonymous,
      createdAt: new Date().toISOString()
    };

    wx.showLoading({ title: '提交中...' });

    setTimeout(() => {
      // 保存评价记录
      const userReviews = wx.getStorageSync('user_reviews') || [];
      userReviews.push(reviewData);
      wx.setStorageSync('user_reviews', userReviews);

      // 标记 direct_orders 中对应订单为已评价
      const directOrders = wx.getStorageSync('direct_orders') || [];
      wx.setStorageSync('direct_orders', directOrders.map(o =>
        o.id === this.data.id
          ? { ...o, orderInfo: { ...o.orderInfo, hasReviewed: true } }
          : o
      ));

      // 标记 reward_orders 中对应订单为已评价
      const rewardOrders = wx.getStorageSync('reward_orders') || [];
      wx.setStorageSync('reward_orders', rewardOrders.map(o =>
        o.id === this.data.id ? { ...o, hasReviewed: true } : o
      ));

      wx.hideLoading();
      wx.showToast({ title: '评价成功', icon: 'success' });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }, 1000);
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  }
});
