Page({
  data: {
    step: 1,
    phone: '',
    phoneMasked: '',
    code: '',
    countdown: 0
  },

  countdownTimer: null,

  onUnload() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
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

    wx.showLoading({ title: '发送中...' });

    // 模拟发送验证码
    setTimeout(() => {
      wx.hideLoading();
      const masked = phone.slice(0, 3) + '****' + phone.slice(7);
      this.setData({
        step: 2,
        phoneMasked: masked
      });
      this.startCountdown();
      wx.showToast({ title: '验证码已发送', icon: 'success' });
    }, 500);
  },

  onResendCode() {
    if (this.data.countdown > 0) return;
    this.startCountdown();
    wx.showToast({ title: '验证码已发送', icon: 'success' });
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

  onConfirm() {
    if (this.data.code.length !== 6) return;

    wx.showLoading({ title: '验证中...' });

    // 模拟验证
    setTimeout(() => {
      wx.hideLoading();
      // 更新本地存储
      const userInfo = wx.getStorageSync('user_info') || {};
      const masked = this.data.phone.slice(0, 3) + '****' + this.data.phone.slice(7);
      userInfo.phone = masked;
      wx.setStorageSync('user_info', userInfo);

      wx.showToast({ title: '修改成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }, 1000);
  }
});
