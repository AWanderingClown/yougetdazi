// pages/task-detail/task-detail.js - 任务详情页（从分享进入）
Page({
  data: {
    taskId: '',
    taskInfo: null,
    isLoading: true
  },

  onLoad(options) {
    const { id, from } = options;
    
    if (!id) {
      wx.showToast({
        title: '任务ID不能为空',
        icon: 'error'
      });
      this.setData({ isLoading: false });
      return;
    }

    this.setData({ taskId: id });
    this.loadTaskInfo(id);
  },

  // 加载任务信息
  loadTaskInfo(taskId) {
    this.setData({ isLoading: true });

    // 从本地存储查找订单
    const rewardOrders = wx.getStorageSync('reward_orders') || [];
    const order = rewardOrders.find(o => o.id === taskId);

    if (order) {
      this.setData({
        taskInfo: {
          serviceType: order.serviceType,
          hourlyRate: order.hourlyRate,
          duration: order.duration,
          requiredCount: order.requiredCount,
          appointmentDate: order.appointmentDate,
          appointmentTime: order.appointmentTime,
          address: order.address,
          description: order.description,
          statusText: this.getStatusText(order.status),
          totalAmount: order.totalAmount
        },
        isLoading: false
      });
    } else {
      // 本地没有该订单数据
      // 实际项目中这里应该调用服务器API获取数据
      setTimeout(() => {
        this.setData({
          isLoading: false,
          taskInfo: null
        });
      }, 300);
    }
  },

  // 获取状态文本
  getStatusText(status) {
    const statusMap = {
      'waiting_grab': '等待抢单',
      'accepted': '已接单',
      'completed': '已完成',
      'cancelled': '已取消'
    };
    return statusMap[status] || '未知状态';
  },

  // 跳转到订单详情
  onGoToOrderDetail() {
    const { taskId } = this.data;
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${taskId}&type=reward`
    });
  },

  // 返回首页
  onGoHome() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 页面分享
  onShareAppMessage() {
    const { taskInfo, taskId } = this.data;
    return {
      title: taskInfo 
        ? `【悬赏】${taskInfo.serviceType} ¥${taskInfo.hourlyRate}/小时 · 等你来抢单！`
        : '悬赏任务分享',
      path: `/pages/task-detail/task-detail?id=${taskId}&from=share`
    };
  }
});
