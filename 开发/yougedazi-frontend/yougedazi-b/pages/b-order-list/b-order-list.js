// pages/b-order-list/b-order-list.js
const { ORDER_STATUS } = require('../../utils/constants');
const { formatAmount } = require('../../utils/auth');

const ORDER_REFRESH_DEBOUNCE_MS = 5000;

const TAB_STATUS_MAP = {
  0: ORDER_STATUS.ACCEPTED,
  1: ORDER_STATUS.SERVING,
  2: ORDER_STATUS.COMPLETED
};

Page({
  data: {
    currentTab: 0,
    tabs: ['已接单', '服务中', '已完成'],
    orders: [],
    loading: false,
    hasMore: true,
    isProcessing: false
  },

  onLoad() {
    this.loadOrders();
  },

  onShow() {
    // 更新 TabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    const now = Date.now();
    if (!this._lastLoadTime || now - this._lastLoadTime > ORDER_REFRESH_DEBOUNCE_MS) {
      this.loadOrders();
    }
  },

  onPullDownRefresh() {
    this.loadOrders(true);
  },

  onReachBottom() {
    if (this.data.hasMore) {
      this.loadMoreOrders();
    }
  },

  loadOrders(refresh = false) {
    this.setData({ loading: true });
    this._lastLoadTime = Date.now();

    // 根据当前 Tab 确定 status 参数
    const status = TAB_STATUS_MAP[this.data.currentTab] || ORDER_STATUS.ACCEPTED;

    getApp().request({
      url: '/api/b/orders',
      data: { status, page: 1, page_size: 50 }
    }).then(res => {
      if (!res || !res.data) {
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ loading: false, hasMore: false });
        if (refresh) wx.stopPullDownRefresh();
        return;
      }

      const list = res.data.list || [];

      const orders = list.map(o => {
        const createdAt = o.created_at ? o.created_at.replace('T', ' ').slice(0, 16) : '';
        return {
          id: o.id,
          order_no: o.order_no,
          status: o.status,
          customerName:   o.user ? o.user.nickname : '',
          customerAvatar: o.user ? o.user.avatar   : '',
          serviceType:    o.serviceName,
          duration:       o.duration + '小时',
          appointmentTime: createdAt,
          totalAmount:    formatAmount(o.totalAmount)
        };
      });

      this.setData({
        orders,
        loading: false,
        hasMore: false
      });

      if (refresh) wx.stopPullDownRefresh();
    }).catch(() => {
      wx.showToast({ title: '网络错误', icon: 'none' });
      this.setData({ loading: false, hasMore: false });
      if (refresh) wx.stopPullDownRefresh();
    });
  },

  loadMoreOrders() {
    // 当前不支持分页，数据已一次性加载完毕
    this.setData({ hasMore: false });
  },

  onTabChange(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    this.setData({ currentTab: index });
    this.loadOrders(true);
  },

  onOrderTap(e) {
    const id = e.currentTarget.dataset.id;
    const type = e.currentTarget.dataset.type || 'direct';
    wx.navigateTo({
      url: '/pages/b-order-detail/b-order-detail?id=' + id + '&type=' + type
    });
  },

  onViewDetail(e) {
    const id = e.currentTarget.dataset.id;
    const type = e.currentTarget.dataset.type || 'direct';
    wx.navigateTo({
      url: '/pages/b-order-detail/b-order-detail?id=' + id + '&type=' + type
    });
  },

  onStartService(e) {
    const orderId = e.currentTarget.dataset.id;
    if (!orderId) return;

    wx.showModal({
      title: '开始服务',
      content: '确认开始服务吗？',
      confirmColor: '#667eea',
      success: (res) => {
        if (res.confirm) {
          this.executeStartService(orderId);
        }
      }
    });
  },

  // 执行开始服务 API 调用
  executeStartService(orderId) {
    if (this.data.isProcessing) return;
    this.setData({ isProcessing: true });
    wx.showLoading({ title: '处理中...' });

    getApp().request({
      url: `/api/b/orders/${orderId}/start`,
      method: 'POST'
    }).then((res) => {
      wx.hideLoading();
      this.setData({ isProcessing: false });
      if (res.code === 0) {
        wx.showToast({ title: '服务已开始', icon: 'success' });
        // 刷新订单列表
        this.loadOrders(true);
      } else {
        wx.showToast({
          title: res.message || '开始服务失败',
          icon: 'none'
        });
      }
    }).catch(() => {
      wx.hideLoading();
      this.setData({ isProcessing: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  goBack() {
    wx.navigateBack();
  }
});