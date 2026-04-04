// pages/face-verify/face-verify.js - 人脸识别验证
// 业务规则：
// 1. 15分钟超时自动取消订单
// 2. 连续5次失败 → 联系客服
// 3. 每日15次上限 → 强制下线

Page({
  data: {
    orderId: '',
    verifyStatus: 'waiting', // waiting, scanning, success, fail, locked
    timeout: 900, // 15分钟 = 900秒
    isRealCamera: false, // 是否使用真实摄像头（开发环境为false）
    isDevMode: false, // 生产环境关闭开发者模式
    
    // 失败统计
    consecutiveFails: 0, // 本次连续失败次数
    dailyAttempts: 0, // 今日已尝试次数
    dailyLimitReached: false, // 是否达到每日上限
    consecutiveLimitReached: false, // 是否达到连续失败上限
    
    // 倒计时显示
    countdownText: '15:00'
  },

  timer: null,
  timeoutTimer: null,

  onLoad(options) {
    this.setData({
      orderId: (options && options.orderId) || ''
    });
    
    // 检查每日限制
    this.checkDailyLimit();
    
    // 开始倒计时
    this.startTimeoutCountdown();
  },

  goBack() {
    wx.navigateBack();
  },
  
  onShow() {
    // 页面显示时继续倒计时
    if (this.data.timeout > 0 && this.data.verifyStatus !== 'success' && !this.timeoutTimer) {
      this.startTimeoutCountdown();
    }
  },
  
  onHide() {
    // 页面隐藏时暂停倒计时（可选）
    if (this.timeoutTimer) {
      clearInterval(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  },

  onUnload() {
    this.clearTimers();
  },

  // 检查每日限制（15次上限）
  checkDailyLimit() {
    const today = this.getTodayKey();
    const dailyData = wx.getStorageSync('face_verify_daily') || {};
    const todayData = dailyData[today] || { attempts: 0, locked: false };
    
    // 如果已被锁定
    if (todayData.locked) {
      this.setData({
        dailyLimitReached: true,
        verifyStatus: 'locked',
        dailyAttempts: todayData.attempts
      });
      this.showLockedModal('今日人脸识别次数已达上限（15次），账号已被限制接单，请联系客服处理');
      return;
    }
    
    this.setData({
      dailyAttempts: todayData.attempts
    });
  },

  // 获取今日key
  getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  },

  // 记录尝试次数
  recordAttempt() {
    const today = this.getTodayKey();
    const dailyData = wx.getStorageSync('face_verify_daily') || {};
    const todayData = dailyData[today] || { attempts: 0, locked: false };
    
    todayData.attempts += 1;
    
    // 检查是否达到15次上限
    if (todayData.attempts >= 15) {
      todayData.locked = true;
      // 设置账号状态为异常（实际应调用后端API）
      wx.setStorageSync('account_status', 'face_verify_locked');
    }
    
    dailyData[today] = todayData;
    wx.setStorageSync('face_verify_daily', dailyData);
    
    this.setData({
      dailyAttempts: todayData.attempts,
      dailyLimitReached: todayData.locked
    });
    
    return todayData;
  },

  // 记录失败
  recordFail() {
    const newConsecutiveFails = this.data.consecutiveFails + 1;
    this.setData({
      consecutiveFails: newConsecutiveFails,
      verifyStatus: 'fail'
    });
    
    // 检查连续5次失败
    if (newConsecutiveFails >= 5) {
      this.setData({ consecutiveLimitReached: true });
      this.showContactServiceModal();
      return true; // 表示已触发限制
    }
    
    return false;
  },

  // 显示联系客服弹窗（连续5次失败）
  showContactServiceModal() {
    wx.showModal({
      title: '识别失败次数过多',
      content: '已连续失败5次，请确保光线充足、面部无遮挡。如仍无法通过，请联系客服协助处理。',
      confirmText: '联系客服',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          // 实际应跳转到客服页面或拨打电话
          wx.makePhoneCall({
            phoneNumber: '400-888-8888',
            fail: () => {
              wx.showToast({ title: '客服电话：400-888-8888', icon: 'none', duration: 3000 });
            }
          });
        } else {
          wx.navigateBack();
        }
      }
    });
  },

  // 显示锁定弹窗（每日15次上限）
  showLockedModal(message) {
    wx.showModal({
      title: '账号限制',
      content: message,
      confirmText: '联系客服',
      cancelText: '返回',
      showCancel: false,
      success: () => {
        // 强制返回
        wx.navigateBack();
      }
    });
  },

  // 开始倒计时
  startTimeoutCountdown() {
    this.updateCountdownText(this.data.timeout);
    
    this.timeoutTimer = setInterval(() => {
      const timeout = this.data.timeout - 1;
      
      if (timeout <= 0) {
        this.clearTimers();
        this.onTimeout();
        return;
      }
      
      this.setData({ timeout });
      this.updateCountdownText(timeout);
    }, 1000);
  },

  // 更新倒计时显示
  updateCountdownText(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    this.setData({
      countdownText: `${mins}:${secs.toString().padStart(2, '0')}`
    });
  },

  // 超时处理
  onTimeout() {
    // 记录超时取消
    wx.setStorageSync(`faceVerifyTimeout_${this.data.orderId}`, true);
    
    wx.showModal({
      title: '验证超时',
      content: '人脸识别超时，订单已自动取消',
      showCancel: false,
      success: () => {
        // 通知上一页超时
        const pages = getCurrentPages();
        const prevPage = pages[pages.length - 2];
        if (prevPage && prevPage.onFaceVerifyTimeout) {
          prevPage.onFaceVerifyTimeout();
        }
        wx.navigateBack();
      }
    });
  },

  // 开始验证
  startVerify() {
    // 检查是否已被锁定
    if (this.data.dailyLimitReached) {
      this.showLockedModal('今日人脸识别次数已达上限（15次），请联系客服处理');
      return;
    }
    
    if (this.data.consecutiveLimitReached) {
      this.showContactServiceModal();
      return;
    }

    if (this.data.verifyStatus === 'scanning') return;

    this.setData({ verifyStatus: 'scanning' });
    
    // 记录本次尝试
    const dailyData = this.recordAttempt();
    
    // 如果达到每日上限，直接锁定
    if (dailyData.locked) {
      setTimeout(() => {
        this.setData({ verifyStatus: 'locked' });
        this.showLockedModal('今日人脸识别次数已达上限（15次），账号已被限制接单，请联系客服处理');
      }, 500);
      return;
    }

    // 模拟识别过程（2秒）
    setTimeout(() => {
      // 模拟90%成功率（测试时可调整）
      const isSuccess = Math.random() > 0.1;
      
      if (isSuccess) {
        this.setData({ verifyStatus: 'success' });
        this.onVerifySuccess();
      } else {
        const isLocked = this.recordFail();
        if (!isLocked) {
          wx.showToast({
            title: `识别失败，还剩${5 - this.data.consecutiveFails}次机会`,
            icon: 'none',
            duration: 2000
          });
        }
      }
    }, 2000);
  },

  // 验证成功
  onVerifySuccess() {
    this.clearTimers();
    
    // 清除连续失败计数
    this.setData({ consecutiveFails: 0 });
    
    // 保存验证结果
    wx.setStorageSync(`faceVerified_${this.data.orderId}`, true);
    wx.setStorageSync(`faceVerifyTime_${this.data.orderId}`, Date.now());

    wx.showToast({
      title: '验证成功',
      icon: 'success',
      duration: 1500
    });

    // 延迟返回并通知上一页
    setTimeout(() => {
      try {
        const pages = getCurrentPages();
        const prevPage = pages[pages.length - 2];
        if (prevPage && prevPage.onFaceVerifySuccess) {
          prevPage.onFaceVerifySuccess();
        }
        if (pages.length > 1) {
          wx.navigateBack();
        } else {
          wx.redirectTo({
            url: '/pages/b-order-detail/b-order-detail?id=' + this.data.orderId
          });
        }
      } catch (e) {
        console.error('返回失败', e);
        wx.redirectTo({
          url: '/pages/b-order-detail/b-order-detail?id=' + this.data.orderId
        });
      }
    }, 1500);
  },

  // 取消验证
  onCancel() {
    wx.showModal({
      title: '确认取消',
      content: '取消后将无法开始服务，确定取消吗？',
      success: (res) => {
        if (res.confirm) {
          this.clearTimers();
          try {
            const pages = getCurrentPages();
            if (pages.length > 1) {
              wx.navigateBack();
            } else {
              wx.redirectTo({
                url: '/pages/b-order-list/b-order-list'
              });
            }
          } catch (e) {
            console.error('返回失败', e);
            wx.redirectTo({
              url: '/pages/b-order-list/b-order-list'
            });
          }
        }
      }
    });
  },

  // 清除定时器
  clearTimers() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.timeoutTimer) {
      clearInterval(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }
});
