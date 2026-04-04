Page({
  data: {
    fromTabBar: false
  },

  onLoad(options) {
    this.setData({
      fromTabBar: options.from === 'tabbar'
    });
  },

  // 定向下单
  onDirectModeTap() {
    wx.showToast({
      title: '请从首页选择搭子',
      icon: 'none',
      duration: 2000
    });
    
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/index/index'
      });
    }, 1500);
  },

  // 悬赏下单
  onRewardModeTap() {
    wx.navigateTo({
      url: '/pages/order-create-reward/order-create-reward'
    });
  }
});
