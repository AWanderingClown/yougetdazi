// pages/withdraw/withdraw.js
// 安全修复：提现金额由后端计算，前端只触发申请

Page({
  data: {
    balance: 0,
    withdrawable: 0,
    minWithdraw: 100,
    maxWithdraw: 50000,
    loading: false,
    // 提现记录列表
    withdrawalList: [],
    hasPendingWithdrawal: false
  },

  onLoad() {
    this.loadBalance();
    this.loadWithdrawalList();
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadBalance();
    this.loadWithdrawalList();
  },

  goBack() {
    wx.navigateBack();
  },

  // 加载可提现余额
  loadBalance() {
    getApp().request({ url: '/api/b/earnings' })
      .then(res => {
        if (res.data) {
          const withdrawable = (res.data.withdrawable || 0) / 100;
          this.setData({ 
            balance: withdrawable,
            withdrawable: withdrawable
          });
        }
      })
      .catch(() => {
        wx.showToast({ title: '加载余额失败', icon: 'none' });
      });
  },

  // 加载提现记录
  loadWithdrawalList() {
    getApp().request({ 
      url: '/api/b/withdrawals',
      data: { page: 1, page_size: 5 }
    })
      .then(res => {
        if (res.data && res.data.list) {
          const hasPending = res.data.list.some(w => w.status === 'pending' || w.status === 'processing');
          this.setData({
            withdrawalList: res.data.list.map(w => ({
              ...w,
              amountYuan: (w.amount / 100).toFixed(2),
              statusText: this.getStatusText(w.status)
            })),
            hasPendingWithdrawal: hasPending
          });
        }
      })
      .catch(() => {
        // 静默失败
      });
  },

  // 状态文本映射
  getStatusText(status) {
    const statusMap = {
      pending: '审核中',
      approved: '已批准',
      rejected: '已拒绝',
      processing: '处理中',
      completed: '已完成',
      failed: '失败'
    };
    return statusMap[status] || status;
  },

  // 申请提现 - 安全修复：不再传递金额，由后端计算
  onWithdraw() {
    // 检查是否有待审核的提现
    if (this.data.hasPendingWithdrawal) {
      wx.showModal({
        title: '提示',
        content: '您有正在处理中的提现申请，请等待审核完成后再申请',
        showCancel: false
      });
      return;
    }

    // 检查余额是否足够
    if (this.data.balance < this.data.minWithdraw) {
      wx.showToast({ 
        title: `可提现余额不足，最低${this.data.minWithdraw}元`, 
        icon: 'none',
        duration: 2000
      });
      return;
    }

    wx.showModal({
      title: '确认提现',
      content: `可提现金额: ${this.data.balance.toFixed(2)}元\n将全部申请提现`,
      confirmText: '确认申请',
      success: (res) => {
        if (res.confirm) {
          this.submitWithdrawal();
        }
      }
    });
  },

  // 提交提现申请
  submitWithdrawal() {
    this.setData({ loading: true });

    // 安全修复：不传递金额，由后端根据可提现余额计算
    getApp().request({
      url: '/api/b/withdrawals',
      method: 'POST',
      data: {} // 不传递amount，后端自动计算
    })
      .then(res => {
        this.setData({ loading: false });
        if (res.code === 0) {
          wx.showModal({
            title: '申请成功',
            content: `提现申请已提交，金额: ${(res.data.amount / 100).toFixed(2)}元\n请等待审核`,
            showCancel: false,
            success: () => {
              this.loadBalance();
              this.loadWithdrawalList();
            }
          });
        } else {
          wx.showToast({ title: res.message || '申请失败', icon: 'none' });
        }
      })
      .catch(err => {
        this.setData({ loading: false });
        wx.showToast({ title: '申请失败，请重试', icon: 'none' });
      });
  },

  // 查看全部提现记录
  viewAllWithdrawals() {
    wx.navigateTo({
      url: '/pages/withdraw/withdrawal-list'
    });
  }
});
