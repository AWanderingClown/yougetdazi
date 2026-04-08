// pages/profile/profile.js - 个人中心
const { showCustomerServiceOptions } = require('../../utils/order-service');

Page({
  data: {
    userInfo: {
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
      nickname: '用户昵称',
      phone: '138****8888'
    },
    menuList: [
      { id: 1, name: '我的订单', url: '/pages/order-list/order-list' },
      { id: 2, name: '我的收藏', url: '/pages/index/index' },
      { id: 3, name: '客服中心', url: '' },
      { id: 4, name: '设置', url: '/pages/settings/settings' }
    ]
  },

  onLoad() {
    // 获取用户信息（尽量通过后端获取真实数据，若失败则保留静态示例）
    try {
      const app = getApp();
      if (app && typeof app.request === 'function') {
        app.request({ url: '/api/user/info' }).then(res => {
          const data = res && (res.data || res);
          if (data) {
            // 兼容两种返回格式
            const user = data.data || data;
            this.setData({ userInfo: user });
          }
        }).catch(() => {
          // 保持原样
        });
      }
    } catch (e) {
      // 忽略
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
  },

  // 编辑资料
  onEditProfile() {
    wx.navigateTo({
      url: '/pages/profile-edit/profile-edit'
    });
  },

  // 菜单点击
  onMenuTap(e) {
    const { id, url, name } = e.currentTarget.dataset;
    
    switch(id) {
      case 1: // 我的订单
        // 跳转到订单页
        wx.switchTab({
          url: '/pages/order-list/order-list'
        });
        break;
        
      case 2: // 我的收藏
        // 跳转到首页
        wx.switchTab({
          url: '/pages/index/index'
        });
        break;
        
      case 3: // 客服中心
        // 弹出客服选项
        this.showCustomerService();
        break;
        
      case 4: // 设置
        wx.navigateTo({ url });
        break;
        
      default:
        wx.showToast({ title: '功能开发中', icon: 'none' });
    }
  },

  // 显示客服选项
  showCustomerService() {
    showCustomerServiceOptions();
  },

  // 设置
  onSettingsTap() {
    wx.navigateTo({
      url: '/pages/settings/settings'
    });
  }
});
