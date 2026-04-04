// pages/login/login.js - 搭子登录
Page({
  data: {
    loginType: 'wechat', // wechat: 微信登录, phone: 手机号登录
    agree: true,
    canLogin: false
  },

  onLoad() {
    // 检查是否已登录
    const token = wx.getStorageSync('token');
    if (token) {
      // 检查审核状态
      const auditStatus = wx.getStorageSync('auditStatus');
      if (auditStatus === 'approved') {
        wx.switchTab({
          url: '/pages/workbench/workbench'
        });
      } else {
        wx.navigateTo({
          url: '/pages/audit-result/audit-result'
        });
      }
    }
  },

  // 切换登录方式
  switchTab(e) {
    this.setData({
      loginType: e.currentTarget.dataset.type
    });
  },

  // 同意协议
  toggleAgree() {
    this.setData({
      agree: !this.data.agree
    });
    this.checkCanLogin();
  },

  // 手机号输入
  onPhoneInput(e) {
    this.setData({
      phone: e.detail.value
    });
    this.checkCanLogin();
  },

  // 验证码输入
  onCodeInput(e) {
    this.setData({
      code: e.detail.value
    });
    this.checkCanLogin();
  },

  // 检查是否可以登录
  checkCanLogin() {
    const { agree } = this.data;
    const canLogin = agree;
    
    this.setData({ canLogin });
  },

  // 微信手机号授权登录
  onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({ title: '需要授权手机号', icon: 'none' });
      return;
    }

    const encryptedData = e.detail.encryptedData;
    const iv = e.detail.iv;

    if (!encryptedData || !iv) {
      wx.showToast({ title: '授权失败，请重试', icon: 'none' });
      return;
    }

    this.loginWithWechatPhone(encryptedData, iv);
  },

  // 微信手机号登录
  loginWithWechatPhone(encryptedData, iv) {
    wx.showLoading({ title: '登录中...' });

    wx.login({
      success: (loginRes) => {
        const app = getApp();
        
        wx.request({
          url: app.globalData.apiBaseUrl + '/api/auth/wx-phone-login',
          method: 'POST',
          data: { 
            code: loginRes.code,
            encrypted_data: encryptedData,
            iv: iv,
            role: 'companion'
          },
          header: { 'Content-Type': 'application/json' },
          success: (res) => {
            wx.hideLoading();
            if (res.data.code === 0) {
              const { access_token, refresh_token, id, phone } = res.data.data;
              app.globalData.token = access_token;
              app.globalData.refreshToken = refresh_token;
              wx.setStorageSync('token', access_token);
              wx.setStorageSync('refresh_token', refresh_token);
              wx.setStorageSync('userInfo', { id, role: 'companion', phone });
              app.initSocket();

              const isRegistered = wx.getStorageSync('isRegistered');
              if (!isRegistered) {
                wx.navigateTo({ url: '/pages/register/register' });
                return;
              }

              const auditStatus = wx.getStorageSync('auditStatus');
              if (auditStatus === 'approved') {
                wx.switchTab({ url: '/pages/workbench/workbench' });
              } else {
                wx.navigateTo({ url: '/pages/audit-result/audit-result' });
              }
            } else {
              wx.showToast({ title: res.data.message || '登录失败', icon: 'none' });
            }
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '登录失败，请重试', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '获取登录凭证失败', icon: 'none' });
      }
    });
  },

  // 发送验证码
  sendCode() {
    const { phone, canSendCode } = this.data;
    
    if (!canSendCode) return;
    if (phone.length !== 11) {
      wx.showToast({
        title: '请输入正确手机号',
        icon: 'none'
      });
      return;
    }

    // 开始倒计时
    this.setData({
      canSendCode: false,
      countdown: 60
    });

    // TODO: 接入短信服务后调用 POST /api/auth/sms-code
    wx.showToast({
      title: '验证码已发送',
      icon: 'success'
    });

    // 倒计时
    const timer = setInterval(() => {
      let countdown = this.data.countdown - 1;
      if (countdown <= 0) {
        clearInterval(timer);
        this.setData({
          canSendCode: true,
          countdown: 0
        });
      } else {
        this.setData({ countdown });
      }
    }, 1000);
  },

  // 微信登录
  onWechatLogin(e) {
    if (!this.data.agree) {
      wx.showToast({
        title: '请先同意用户协议',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '登录中...' });

    wx.login({
      success: (loginRes) => {
        const app = getApp();
        wx.request({
          url: app.globalData.apiBaseUrl + '/api/auth/wx-login',
          method: 'POST',
          data: { code: loginRes.code, role: 'companion' },
          header: { 'Content-Type': 'application/json' },
          success: (res) => {
            wx.hideLoading();
            if (res.data.code === 0) {
              const { access_token, refresh_token, id } = res.data.data;
              app.globalData.token = access_token;
              app.globalData.refreshToken = refresh_token;
              wx.setStorageSync('token', access_token);
              wx.setStorageSync('refresh_token', refresh_token);
              wx.setStorageSync('userInfo', { id, role: 'companion' });
              app.initSocket();

              // 判断是否已注册（注册完成后由 register.js 写入 isRegistered: true）
              const isRegistered = wx.getStorageSync('isRegistered');
              if (!isRegistered) {
                wx.navigateTo({ url: '/pages/register/register' });
                return;
              }

              // 已注册，检查审核状态（由 audit-result 页面写入 auditStatus）
              const auditStatus = wx.getStorageSync('auditStatus');
              if (auditStatus === 'approved') {
                wx.switchTab({ url: '/pages/workbench/workbench' });
              } else {
                wx.navigateTo({ url: '/pages/audit-result/audit-result' });
              }
            } else {
              wx.showToast({ title: res.data.message || '登录失败', icon: 'none' });
            }
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '登录失败，请重试', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '获取登录凭证失败', icon: 'none' });
      }
    });
  },

  // 手机号登录（通过微信授权实现，TODO: 后续接入短信服务）
  onPhoneLogin() {
    if (!this.data.canLogin) return;

    wx.showLoading({ title: '登录中...' });

    wx.login({
      success: (loginRes) => {
        const app = getApp();
        wx.request({
          url: app.globalData.apiBaseUrl + '/api/auth/wx-login',
          method: 'POST',
          data: { code: loginRes.code, role: 'companion' },
          header: { 'Content-Type': 'application/json' },
          success: (res) => {
            wx.hideLoading();
            if (res.data.code === 0) {
              const { access_token, refresh_token, id } = res.data.data;
              app.globalData.token = access_token;
              app.globalData.refreshToken = refresh_token;
              wx.setStorageSync('token', access_token);
              wx.setStorageSync('refresh_token', refresh_token);
              wx.setStorageSync('userInfo', { id, role: 'companion', phone: this.data.phone });
              app.initSocket();

              const isRegistered = wx.getStorageSync('isRegistered');
              if (!isRegistered) {
                wx.navigateTo({ url: '/pages/register/register' });
                return;
              }

              const auditStatus = wx.getStorageSync('auditStatus');
              if (auditStatus === 'approved') {
                wx.switchTab({ url: '/pages/workbench/workbench' });
              } else {
                wx.navigateTo({ url: '/pages/audit-result/audit-result' });
              }
            } else {
              wx.showToast({ title: res.data.message || '登录失败', icon: 'none' });
            }
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '登录失败，请重试', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '获取登录凭证失败', icon: 'none' });
      }
    });
  },

  // 查看用户协议
  viewAgreement() {
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=user'
    });
  },

  // 查看隐私政策
  viewPrivacy() {
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=privacy'
    });
  },

  // 开发者测试模式
  devModeLogin() {
    wx.setStorageSync('token', 'dev_token');
    wx.setStorageSync('isRegistered', true);
    wx.setStorageSync('auditStatus', 'approved');
    wx.setStorageSync('userInfo', { 
      id: 'dev_001', 
      nickname: '测试搭子',
      role: 'companion'
    });
    wx.switchTab({ url: '/pages/workbench/workbench' });
  },

  // 跳转到注册
  goToRegister() {
    wx.navigateTo({
      url: '/pages/register/register'
    });
  }
});
