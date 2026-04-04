// pages/profile/profile.js - 个人中心
Page({
  data: {
    userInfo: {},
    stats: {
      income: '0.00',
      orders: 0,
      rating: '100%'
    },
    skillCount: 0,
    certStatus: 'pending',
    certText: '审核中',
    wallet: '0.00',
    levelText: '新手搭子'
  },

  onLoad() {
    this.loadUserInfo();
  },

  onShow() {
    // 更新 TabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3
      });
    }
    this.loadUserInfo();
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const registerData = wx.getStorageSync('registerData') || {};
    
    this.setData({
      userInfo: {
        ...userInfo,
        ...registerData
      },
      skillCount: registerData.skills ? registerData.skills.length : 0,
      certStatus: userInfo.isCompanion ? 'approved' : 'pending',
      certText: userInfo.isCompanion ? '已认证' : '审核中'
    });
  },

  // 个人资料
  goToProfileEdit() {
    wx.navigateTo({
      url: '/pages/profile-edit/profile-edit'
    });
  },

  // 服务项目
  goToSkills() {
    wx.navigateTo({
      url: '/pages/services/services'
    });
  },

  // 实名认证
  goToCertification() {
    wx.navigateTo({
      url: '/pages/audit-result/audit-result?status=' + this.data.certStatus
    });
  },

  // 我的钱包
  goToWallet() {
    wx.navigateTo({
      url: '/pages/earnings/earnings'
    });
  },

  // 设置
  goToSettings() {
    wx.navigateTo({
      url: '/pages/settings/settings'
    });
  },

  // 联系客服
  contactService() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-888-8888',
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

  // 退出登录
  logout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除登录态
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          
          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          });
          
          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/login/login'
            });
          }, 1500);
        }
      }
    });
  }
});
