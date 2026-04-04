// pages/account-security/account-security.js - 账号与安全
Page({
  data: {
    phone: '',
    isRealNameVerified: false,
    isFaceVerified: false,
    isWechatBound: true
  },

  onLoad() {
    this.loadUserInfo();
  },

  onShow() {
    // 刷新人脸识别状态
    this.loadUserInfo();
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const registerData = wx.getStorageSync('registerData') || {};
    
    // 手机号脱敏处理
    let phone = userInfo.phone || registerData.phone || '';
    if (phone && phone.length === 11) {
      phone = phone.substring(0, 3) + '****' + phone.substring(7);
    }

    this.setData({
      phone,
      isRealNameVerified: userInfo.isRealNameVerified || registerData.isRealNameVerified || false,
      isFaceVerified: userInfo.isFaceVerified || registerData.isFaceVerified || false,
      isWechatBound: true // 微信小程序默认已绑定微信
    });
  },

  // 修改手机号
  changePhone() {
    wx.showActionSheet({
      itemList: ['更换手机号', '解绑手机号'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 更换手机号
          wx.showToast({ title: '请联系客服更换', icon: 'none' });
        } else if (res.tapIndex === 1) {
          // 解绑手机号
          wx.showModal({
            title: '提示',
            content: '解绑手机号后可能无法正常使用部分功能，确定要解绑吗？',
            confirmColor: '#e74c3c',
            success: (res) => {
              if (res.confirm) {
                wx.showToast({ title: '请联系客服解绑', icon: 'none' });
              }
            }
          });
        }
      }
    });
  },

  // 实名认证
  goToRealNameVerify() {
    if (this.data.isRealNameVerified) {
      wx.showModal({
        title: '提示',
        content: '您已完成实名认证，是否重新认证？',
        success: (res) => {
          if (res.confirm) {
            this.showRealNameModal();
          }
        }
      });
    } else {
      this.showRealNameModal();
    }
  },

  // 显示实名认证弹窗
  showRealNameModal() {
    wx.showModal({
      title: '实名认证',
      content: '请在注册时已完成实名认证，若信息有误请联系客服',
      confirmText: '我知道了',
      showCancel: false
    });
  },

  // 人脸识别
  goToFaceVerify() {
    if (this.data.isFaceVerified) {
      wx.showModal({
        title: '提示',
        content: '您已完成人脸识别，是否重新认证？',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/face-verify/face-verify?mode=standalone' });
          }
        }
      });
    } else {
      wx.navigateTo({ url: '/pages/face-verify/face-verify?mode=standalone' });
    }
  },

  // 微信绑定
  handleWechatBind() {
    if (this.data.isWechatBound) {
      wx.showModal({
        title: '提示',
        content: '解绑微信后需要重新登录，确定要解绑吗？',
        confirmColor: '#e74c3c',
        success: (res) => {
          if (res.confirm) {
            wx.showToast({ title: '请联系客服解绑', icon: 'none' });
          }
        }
      });
    }
  },

  // 修改登录密码
  changePassword() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  // 注销账号
  deleteAccount() {
    wx.showModal({
      title: '注销账号',
      content: '注销后，您的所有数据将被清除且无法恢复，确定要注销吗？',
      confirmText: '申请注销',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '确认注销',
            content: '请再次确认，注销后将无法恢复账号！',
            confirmText: '确认注销',
            confirmColor: '#e74c3c',
            success: (res) => {
              if (res.confirm) {
                // 执行注销逻辑
                wx.showLoading({ title: '处理中...' });
                setTimeout(() => {
                  wx.hideLoading();
                  wx.clearStorage();
                  wx.showToast({ title: '注销申请已提交', icon: 'success' });
                  setTimeout(() => {
                    wx.reLaunch({ url: '/pages/login/login' });
                  }, 1500);
                }, 1500);
              }
            }
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
