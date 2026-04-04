// pages/settings/settings.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 版本号
    version: '1.0.0',
    
    // 用户信息
    userInfo: {
      phone: '138****8888',
      avatar: '',
      nickname: ''
    },
    
    // 通知设置
    notification: {
      order: true,
      activity: true,
      system: true
    },
    
    // 隐私设置
    privacy: {
      profileVisibility: '公开',
      location: true
    },
    
    // 缓存大小
    cacheSize: '12.5MB',
    
    // 弹窗显示状态
    showClearCacheModal: false,
    showLogoutModal: false,
    showVisibilityModal: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadSettingsData();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次显示页面时刷新数据
    this.loadSettingsData();
  },

  /**
   * 加载设置数据
   */
  loadSettingsData() {
    // 从本地存储加载设置
    const notification = wx.getStorageSync('notification_settings');
    const privacy = wx.getStorageSync('privacy_settings');
    const userInfo = wx.getStorageSync('user_info');
    if (notification) {
      this.setData({ notification });
    }
    if (privacy) {
      this.setData({ privacy });
    }
    if (userInfo) {
      this.setData({ userInfo });
    }
    // 计算缓存大小
    this.calculateCacheSize();
    
    // 获取版本号
    const accountInfo = wx.getAccountInfoSync();
    this.setData({
      version: accountInfo.miniProgram.version || '1.0.0'
    });
  },

  /**
   * 计算缓存大小
   */
  calculateCacheSize() {
    try {
      const res = wx.getStorageInfoSync();
      const sizeInMB = (res.currentSize / 1024).toFixed(1);
      this.setData({
        cacheSize: `${sizeInMB}MB`
      });
    } catch (e) {
      const logger = require('../../utils/logger');
      logger.error(logger.Categories.SYSTEM, '获取缓存信息失败', e);
    }
  },

  // ==================== 账号安全设置 ====================

  /**
   * 修改手机号
   */
  onChangePhone() {
    wx.navigateTo({
      url: '/pages/settings/phone/phone'
    });
  },

  // ==================== 消息通知设置 ====================

  /**
   * 通知开关切换
   */
  onSwitchChange(e) {
    const { type } = e.currentTarget.dataset;
    const { value } = e.detail;

    // 后端接入后在此调用 wx.requestSubscribeMessage（需真实模板ID）
    // 开发阶段跳过订阅，仅保存本地开关状态

    this.setData({
      [`notification.${type}`]: value
    }, () => {
      wx.setStorageSync('notification_settings', this.data.notification);
    });
  },

  /**
   * 获取模板ID
   */
  getTmplIdsByType(type) {
    const tmplMap = {
      order: ['ORDER_TEMPLATE_ID_1', 'ORDER_TEMPLATE_ID_2'],
      activity: ['ACTIVITY_TEMPLATE_ID'],
      system: ['SYSTEM_TEMPLATE_ID']
    };
    return tmplMap[type] || [];
  },

  // ==================== 隐私设置 ====================

  /**
   * 个人资料可见性
   */
  onProfileVisibility() {
    this.setData({
      showVisibilityModal: true
    });
  },

  /**
   * 选择可见性
   */
  selectVisibility(e) {
    const { value } = e.currentTarget.dataset;
    this.setData({
      'privacy.profileVisibility': value,
      showVisibilityModal: false
    }, () => {
      wx.setStorageSync('privacy_settings', this.data.privacy);
      wx.showToast({
        title: '设置已保存',
        icon: 'success',
        duration: 1500
      });
    });
  },

  /**
   * 关闭可见性弹窗
   */
  closeVisibilityModal() {
    this.setData({
      showVisibilityModal: false
    });
  },

  /**
   * 位置权限切换
   */
  onLocationChange(e) {
    const { value } = e.detail;
    
    if (value) {
      // 开启位置权限
      wx.authorize({
        scope: 'scope.userLocation',
        success: () => {
          this.setData({
            'privacy.location': true
          });
          wx.setStorageSync('privacy_settings', this.data.privacy);
          wx.showToast({
            title: '位置权限已开启',
            icon: 'success'
          });
        },
        fail: () => {
          this.setData({
            'privacy.location': false
          });
          wx.showModal({
            title: '提示',
            content: '需要在设置中开启位置权限',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting();
              }
            }
          });
        }
      });
    } else {
      // 关闭位置权限
      this.setData({
        'privacy.location': false
      });
      wx.setStorageSync('privacy_settings', this.data.privacy);
      wx.showToast({
        title: '位置权限已关闭',
        icon: 'success'
      });
    }
  },

  // ==================== 其他设置 ====================

  /**
   * 清除缓存
   */
  onClearCache() {
    this.setData({
      showClearCacheModal: true
    });
  },

  /**
   * 关闭清除缓存弹窗
   */
  closeClearCacheModal() {
    this.setData({
      showClearCacheModal: false
    });
  },

  /**
   * 确认清除缓存
   */
  confirmClearCache() {
    wx.showLoading({
      title: '清除中...',
      mask: true
    });
    
    try {
      // 清除本地存储（保留用户登录信息）
      const userInfo = wx.getStorageSync('user_info');
      const token = wx.getStorageSync('token');
      
      wx.clearStorageSync();
      
      // 恢复必要的登录信息
      if (userInfo) wx.setStorageSync('user_info', userInfo);
      if (token) wx.setStorageSync('token', token);
      
      wx.hideLoading();
      this.setData({
        showClearCacheModal: false,
        cacheSize: '0MB'
      });
      
      wx.showToast({
        title: '清除成功',
        icon: 'success'
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({
        title: '清除失败',
        icon: 'none'
      });
    }
  },

  /**
   * 关于我们
   */
  onAboutUs() {
    const config = require('../../config/backend-config.js');
    wx.showModal({
      title: '关于 有个搭子',
      content: `版本：${this.data.version}\n\n有个搭子 是一款线下陪伴服务平台，致力于为用户提供安全、优质的陪伴体验。\n\n如有问题请联系客服：${config.customerService.phone}`,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  /**
   * 用户协议
   */
  onUserAgreement() {
    wx.navigateTo({
      url: '/pages/settings/agreement/agreement?type=user'
    });
  },

  /**
   * 隐私政策
   */
  onPrivacyPolicy() {
    wx.navigateTo({
      url: '/pages/settings/agreement/agreement?type=privacy'
    });
  },

  // ==================== 退出登录 ====================

  /**
   * 退出登录
   */
  onLogout() {
    this.setData({
      showLogoutModal: true
    });
  },

  /**
   * 关闭退出登录弹窗
   */
  closeLogoutModal() {
    this.setData({
      showLogoutModal: false
    });
  },

  /**
   * 确认退出登录
   */
  confirmLogout() {
    wx.showLoading({
      title: '退出中...',
      mask: true
    });
    
    // 调用退出登录接口
    wx.request({
      url: 'https://your-api-domain.com/api/user/logout',
      method: 'POST',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`
      },
      success: (res) => {
        if (res.data.code === 200) {
          // 清除本地登录信息
          wx.removeStorageSync('token');
          wx.removeStorageSync('user_info');
          wx.removeStorageSync('notification_settings');
          wx.removeStorageSync('privacy_settings');
          
          wx.hideLoading();
          this.setData({
            showLogoutModal: false
          });
          
          wx.showToast({
            title: '已退出登录',
            icon: 'success',
            duration: 1500,
            success: () => {
              setTimeout(() => {
                // 跳转到登录页
                wx.reLaunch({
                  url: '/pages/login/login'
                });
              }, 1500);
            }
          });
        } else {
          wx.hideLoading();
          wx.showToast({
            title: res.data.message || '退出失败',
            icon: 'none'
          });
        }
      },
      fail: () => {
        wx.hideLoading();
        // 即使接口失败，也清除本地数据
        wx.removeStorageSync('token');
        wx.removeStorageSync('user_info');
        
        this.setData({
          showLogoutModal: false
        });
        
        wx.reLaunch({
          url: '/pages/login/login'
        });
      }
    });
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '有个搭子 - 个人设置',
      path: '/pages/settings/settings'
    };
  }
});
