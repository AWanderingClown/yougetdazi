const app = getApp();

Page({
  data: {
    showPhoneForm: false,
    phone: '',
    code: '',
    phoneSent: false,
    countdown: 0
  },

  countdownTimer: null,

  onUnload() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  },

  // 微信一键登录
  onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({ title: '取消了授权', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '登录中...' });

    wx.login({
      success: (loginRes) => {
        const app = getApp();
        // mock模式下使用模拟登录
        if (app.globalData.useMockData) {
          wx.hideLoading();
          app.globalData.token = app.globalData.token || mockUser.token.access_token;
          app.globalData.refreshToken = app.globalData.refreshToken || mockUser.token.refresh_token;
          app.globalData.userInfo = app.globalData.userInfo || mockUser.currentUser;
          wx.setStorageSync('token', app.globalData.token);
          wx.setStorageSync('refresh_token', app.globalData.refreshToken);
          wx.setStorageSync('userInfo', app.globalData.userInfo);
          wx.showToast({ title: '登录成功', icon: 'success' });
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/index/index' });
          }, 1500);
          return;
        }
        wx.request({
          url: app.globalData.apiBaseUrl + '/api/auth/wx-login',
          method: 'POST',
          data: { code: loginRes.code, role: 'user' },
          header: { 'Content-Type': 'application/json' },
          success(res) {
            wx.hideLoading();
            if (res.data.code === 0) {
              const { access_token, refresh_token, id } = res.data.data;
              app.globalData.token = access_token;
              app.globalData.refreshToken = refresh_token;
              wx.setStorageSync('token', access_token);
              wx.setStorageSync('refresh_token', refresh_token);
              wx.setStorageSync('userInfo', { id, nickname: '微信用户', avatar: '' });
              app.initSocket();
              wx.showToast({ title: '登录成功', icon: 'success' });
              setTimeout(() => {
                wx.reLaunch({ url: '/pages/index/index' });
              }, 1500);
            } else {
              wx.showToast({ title: res.data.message || '登录失败', icon: 'none' });
            }
          },
          fail() {
            wx.hideLoading();
            wx.showToast({ title: '登录失败，请重试', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      }
    });
  },

  // 显示手机号登录表单
  onPhoneLogin() {
    this.setData({ showPhoneForm: true });
  },

  onClosePhoneForm() {
    this.setData({ showPhoneForm: false, phoneSent: false, phone: '', code: '' });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value });
  },

  onSendCode() {
    const phone = this.data.phone;
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    // TODO: 接入短信验证码服务后，这里调用 POST /api/auth/sms-code 发送真实短信
    // 当前暂无短信服务，使用微信登录授权替代
    this.setData({ phoneSent: true });
    this.startCountdown();
    wx.showToast({ title: '请使用微信一键登录', icon: 'none' });
  },

  onResendCode() {
    if (this.data.countdown > 0) return;
    this.startCountdown();
    wx.showToast({ title: '请使用微信一键登录', icon: 'none' });
  },

  startCountdown() {
    this.setData({ countdown: 60 });
    this.countdownTimer = setInterval(() => {
      if (this.data.countdown <= 1) {
        clearInterval(this.countdownTimer);
        this.setData({ countdown: 0 });
        return;
      }
      this.setData({ countdown: this.data.countdown - 1 });
    }, 1000);
  },

  // 手机号验证码登录（当前通过微信授权实现，TODO: 后续接入短信服务）
  onPhoneConfirm() {
    if (this.data.code.length !== 6) return;

    wx.showLoading({ title: '登录中...' });
    wx.login({
      success: (loginRes) => {
        const app = getApp();
        wx.request({
          url: app.globalData.apiBaseUrl + '/api/auth/wx-login',
          method: 'POST',
          data: { code: loginRes.code, role: 'user' },
          header: { 'Content-Type': 'application/json' },
          success: (res) => {
            wx.hideLoading();
            if (res.data.code === 0) {
              const { access_token, refresh_token, id } = res.data.data;
              app.globalData.token = access_token;
              app.globalData.refreshToken = refresh_token;
              wx.setStorageSync('token', access_token);
              wx.setStorageSync('refresh_token', refresh_token);
              wx.setStorageSync('userInfo', {
                id,
                nickname: '用户' + this.data.phone.slice(-4),
                avatar: ''
              });
              wx.showToast({ title: '登录成功', icon: 'success' });
              setTimeout(() => {
                wx.reLaunch({ url: '/pages/index/index' });
              }, 1500);
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
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      }
    });
  },

  onUserAgreement() {
    wx.navigateTo({ url: '/pages/settings/agreement/agreement?type=user' });
  },

  onPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/settings/agreement/agreement?type=privacy' });
  }
});
