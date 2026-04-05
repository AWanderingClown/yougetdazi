const { formatAmount } = require('../../utils/auth');
const { getCurrentMonthRange } = require('../../utils/date-helpers');

// pages/earnings/earnings.js - 收益明细
Page({
  data: {
    // 收益统计（初始为 0，由后端接口填充）
    todayIncome: 0,
    weekIncome: 0,
    monthIncome: 0,
    totalIncome: 0,
    withdrawableAmount: 0,
    pendingAmount: 0,
    
    // 列表数据
    incomeList: [],
    currentTab: 0,
    tabs: ['全部', '搭子收入', '其他'],
    
    // 分页
    page: 1,
    pageSize: 20,
    hasMore: true,
    isLoading: false,
    
    // 筛选
    filterType: 'all', // all, service, other
    startDate: '',
    endDate: ''
  },

  onLoad() {
    this.setDefaultDateRange();
    this._isLoadingData = true;
    this.loadIncomeData().then(() => {
      this._isLoadingData = false;
    });
  },

  onShow() {
    if (!this._hasLoaded && !this._isLoadingData) {
      this.loadIncomeData();
    }
  },

  // 设置默认日期范围（本月）
  setDefaultDateRange() {
    const { startDate, endDate } = getCurrentMonthRange();
    this.setData({ startDate, endDate });
  },

  // 加载收益数据
  loadIncomeData(isLoadMore = false) {
    if (this.data.isLoading) return Promise.resolve();
    this.setData({ isLoading: true });

    return new Promise((resolve) => {

    const page = isLoadMore ? this.data.page + 1 : 1;
    const app = getApp();

    // 首次加载时并行拉取收益概览
    const overviewPromise = isLoadMore
      ? Promise.resolve(null)
      : app.request({ url: '/api/b/earnings' });

    const recordsPromise = app.request({
      url: '/api/b/earnings/records',
      data: {
        page,
        page_size: this.data.pageSize,
        type: this.data.filterType,
        start_date: this.data.startDate,
        end_date: this.data.endDate
      }
    });

    Promise.all([overviewPromise, recordsPromise])
      .then(([overviewRes, recordsRes]) => {
        const updates = { isLoading: false, page };

        if (overviewRes && overviewRes.data) {
          const d = overviewRes.data;
          Object.assign(updates, {
            todayIncome:       formatAmount(d.today),
            weekIncome:        formatAmount(d.this_week),
            monthIncome:       formatAmount(d.this_month),
            totalIncome:       formatAmount(d.total),
            withdrawableAmount:formatAmount(d.withdrawable),
          });
        }

        if (recordsRes && recordsRes.data) {
          const list = recordsRes.data.list || [];
          const mapped = list.map(item => ({
            id:      item.id,
            title:   item.description || '搭子服务',
            type:    item.type || 'order_income',
            icon:    '🎮',
            time:    item.created_at ? item.created_at.slice(0, 10) : '',
            amount:  formatAmount(item.amount),
            orderId: item.order_id || '',
            status:  'settled'
          }));
          updates.incomeList = isLoadMore ? [...this.data.incomeList, ...mapped] : mapped;
          updates.hasMore = recordsRes.data.has_more || false;
        }

        if (!isLoadMore) {
          this._hasLoaded = true;
        }
        this._isLoadingData = false;
        this.setData(updates);
        resolve();
      })
      .catch((err) => {
        console.error('[收益页] 加载数据失败:', err);
        this._isLoadingData = false;
        this.setData({ isLoading: false });
        wx.showToast({ title: '加载失败，请下拉刷新', icon: 'none' });
        resolve();
      });
  },

  // 切换标签
  onTabChange(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    const filterTypes = ['all', 'service', 'other'];
    
    this.setData({ 
      currentTab: index,
      filterType: filterTypes[index],
      page: 1,
      incomeList: []
    });
    
    this.loadIncomeData();
  },

  // 去提现
  goToWithdraw() {
    if (this.data.withdrawableAmount <= 0) {
      wx.showToast({
        title: '暂无可提现金额',
        icon: 'none'
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/withdraw/withdraw'
    });
  },

  // 查看详情
  viewDetail(e) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '收益详情',
      content: `订单：${item.title}\n金额：+¥${item.amount}\n时间：${item.time}\n订单号：${item.orderId}\n状态：${item.status === 'settled' ? '已结算' : '待结算'}`,
      showCancel: false
    });
  },

  // 选择开始日期
  onStartDateChange(e) {
    this.setData({ 
      startDate: e.detail.value,
      page: 1,
      incomeList: []
    });
    this.loadIncomeData();
  },

  // 选择结束日期
  onEndDateChange(e) {
    this.setData({ 
      endDate: e.detail.value,
      page: 1,
      incomeList: []
    });
    this.loadIncomeData();
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({ page: 1 });
    this.loadIncomeData();
    wx.stopPullDownRefresh();
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadIncomeData(true);
    }
  },

  // 返回
  goBack() {
    wx.navigateBack();
  }
});
