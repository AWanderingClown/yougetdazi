// pages/audit-result/audit-result.js - 审核结果
Page({
  data: {
    status: 'pending', // pending: 审核中, approved: 通过, rejected: 拒绝
    rejectReason: ''
  },

  onLoad(options) {
    const status = options.status || 'pending';
    this.setData({ 
      status,
      rejectReason: options.reason || ''
    });

    // 如果是审核通过，更新用户状态
    if (status === 'approved') {
      const userInfo = wx.getStorageSync('userInfo') || {};
      userInfo.isCompanion = true;
      wx.setStorageSync('userInfo', userInfo);
    }
  },

  goBack() {
    wx.navigateBack();
  },

  // 进入工作台
  goToWorkbench() {
    wx.switchTab({
      url: '/pages/workbench/workbench'
    });
  },

  // 重新申请
  reapply() {
    wx.redirectTo({
      url: '/pages/register/register'
    });
  },

  // 联系客服
  contactService() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-888-8888\n工作时间：9:00-21:00',
      confirmText: '拨打',
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({
            phoneNumber: '400-888-8888'
          });
        }
      }
    });
  }
});
