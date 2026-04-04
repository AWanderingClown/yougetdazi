// pages/settings/settings.js - 设置
Page({
  data: {
    cacheSize: '0MB',
    notificationEnabled: true,
    orderReminder: true
  },

  onLoad() {
    this.loadSettings();
    this.calculateCache();
  },

  // 加载保存的设置
  loadSettings() {
    const notificationEnabled = wx.getStorageSync('notificationEnabled');
    const orderReminder = wx.getStorageSync('orderReminder');

    this.setData({
      notificationEnabled: notificationEnabled !== false,
      orderReminder: orderReminder !== false
    });
  },

  // 计算缓存
  calculateCache() {
    // 模拟缓存大小
    this.setData({ cacheSize: '12.5MB' });
  },

  // 返回
  goBack() {
    wx.navigateBack();
  },

  // 账号与安全
  goToAccount() {
    wx.navigateTo({ url: '/pages/account-security/account-security' });
  },

  // 切换消息通知
  toggleNotification(e) {
    const enabled = e.detail.value;
    this.setData({ notificationEnabled: enabled });
    wx.setStorageSync('notificationEnabled', enabled);
    wx.showToast({
      title: enabled ? '已启用消息通知' : '已关闭消息通知',
      icon: 'success',
      duration: 1500
    });
  },

  // 切换接单提醒
  toggleOrderReminder(e) {
    const enabled = e.detail.value;
    this.setData({ orderReminder: enabled });
    wx.setStorageSync('orderReminder', enabled);
    wx.showToast({
      title: enabled ? '已启用接单提醒' : '已关闭接单提醒',
      icon: 'success',
      duration: 1500
    });
  },

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有缓存数据吗？清除后需要重新加载内容。',
      success: (res) => {
        if (res.confirm) {
          // 只清除UI缓存，保留业务关键数据
          const keepKeys = ['token', 'userInfo', 'companionInfo',
            'registerData', 'myServices', 'serviceAuditInfo',
            'notificationEnabled', 'orderReminder'];
          wx.getStorageInfoSync().keys.forEach(key => {
            if (!keepKeys.includes(key) && !key.startsWith('faceVerified_')) {
              wx.removeStorageSync(key);
            }
          });
          wx.showToast({
            title: '清除成功',
            icon: 'success',
            duration: 1500
          });
          this.setData({ cacheSize: '0MB' });
        }
      }
    });
  },

  // 检查更新
  checkUpdate() {
    wx.showToast({
      title: '已是最新版本',
      icon: 'success',
      duration: 1500
    });
  },

  // 关于我们
  aboutUs() {
    wx.showModal({
      title: '关于有个搭子',
      content: '有个搭子是一款专业的社交平台，帮您找到志同道合的搭子。\n\n版本: v1.0.0',
      showCancel: false,
      confirmText: '了解'
    });
  },

  // 用户协议
  viewAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement' });
  },

  // 隐私政策
  viewPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '确认退出登录',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('companionInfo');
          wx.showToast({
            title: '已退出登录',
            icon: 'success',
            duration: 1500
          });
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/login/login' });
          }, 1500);
        }
      }
    });
  }
});
