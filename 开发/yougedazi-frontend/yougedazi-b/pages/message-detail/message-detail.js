// pages/message-detail/message-detail.js - 消息详情页
Page({
  data: {
    messageId: '',
    messageType: 'system', // system: 系统通知, order: 订单通知, money: 资金通知
    message: null,
    loading: true
  },

  onLoad(options) {
    const { id, type } = options;
    this.setData({
      messageId: id,
      messageType: type || 'system'
    });
    this.loadMessageDetail(id, type);
  },

  // 加载消息详情
  loadMessageDetail(id) {
    const app = getApp();
    app.request({ url: `/api/b/notifications/${id}` })
      .then(res => {
        if (!res || !res.data) {
          this.setData({ loading: false });
          wx.showToast({ title: '消息不存在', icon: 'none' });
          return;
        }
        const n = res.data;
        const message = {
          id:       n.id,
          type:     n.type || 'system',
          iconType: n.type || 'system',
          title:    n.title,
          content:  n.content,
          detail:   n.body || n.content,
          time:     n.created_at ? n.created_at.replace('T', ' ').slice(0, 19) : '',
          extraInfo: n.extra || null,
          actions:  n.actions || []
        };
        this.setData({ message, loading: false });
        this.markAsRead(id);
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  // 标记为已读
  markAsRead(id) {
    const app = getApp();
    app.request({
      url: `/api/b/notifications/${id}/read`,
      method: 'POST'
    }).catch(() => {});
  },

  // 执行操作
  onActionTap(e) {
    const { action } = e.currentTarget.dataset;
    const { message } = this.data;
    
    switch (action) {
      case 'viewOrder':
        if (message.extraInfo && message.extraInfo.orderId) {
          wx.navigateTo({
            url: '/pages/b-order-detail/b-order-detail?id=' + message.extraInfo.orderId
          });
        }
        break;
      case 'viewWallet':
        wx.navigateTo({
          url: '/pages/earnings/earnings'
        });
        break;
      case 'viewDetail':
        wx.showToast({
          title: '查看明细功能开发中',
          icon: 'none'
        });
        break;
    }
  },

  // 删除消息
  onDelete() {
    wx.showModal({
      title: '删除消息',
      content: '确定要删除这条消息吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          // 实际项目中应调用API删除
          wx.showToast({
            title: '已删除',
            icon: 'success'
          });
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      }
    });
  },

  // 返回
  goBack() {
    wx.navigateBack();
  }
});
