// pages/index/index.js - 有个搭子首页
const mockCompanions = require('../../mock-data/companions');
const api = require('../../utils/api');
const { debounce, throttle } = require('../../utils/helpers');

const app = getApp();



Page({
  data: {
    currentCity: '全部',
    currentFilter: 'all',
    selectedCategory: null, // 当前选中的分类
    isSearching: false, // 是否正在搜索
    searchKeyword: '', // 搜索关键词
    categories: [
      { id: 1, name: '逛街', icon: '/assets/icons/categories/购物车.png' },
      { id: 2, name: '运动', icon: '/assets/icons/categories/棒球.png' },
      { id: 3, name: '餐饮', icon: '/assets/icons/categories/刀叉.png' },
      { id: 4, name: '棋牌/密室', icon: '/assets/icons/categories/扑克.png' },
      { id: 5, name: '电竞', icon: '/assets/icons/categories/游戏.png' },
      { id: 6, name: '酒吧/K歌', icon: '/assets/icons/categories/鸡尾酒.png' },
      { id: 7, name: '派对', icon: '/assets/icons/categories/派对.png' },
      { id: 8, name: '茶艺', icon: '/assets/icons/categories/茶壶.png' },
      { id: 9, name: '电影/影视', icon: '/assets/icons/categories/影视.png' },
      { id: 10, name: '旅游向导', icon: '/assets/icons/categories/飞机.png' }
    ],
    allCompanions: [], // 全部搭子数据
    companions: [], // 当前显示的搭子
    isLoading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    isError: false,
    errorMessage: '',
    isLikeLoading: false // 心动操作加载状态，防止重复点击
  },
  
  // 定时器引用
  locationTimer: null,
  loadTimer: null,
  sortTimer: null,

  onLoad() {
    this.loadCompanions();
    // 延迟获取位置，避免启动时权限弹窗
    this.locationTimer = setTimeout(() => {
      this.getLocation();
    }, 1000);
  },
  
  onUnload() {
    // 页面卸载时清理定时器
    if (this.locationTimer) {
      clearTimeout(this.locationTimer);
    }
    if (this.loadTimer) {
      clearTimeout(this.loadTimer);
    }
    if (this.sortTimer) {
      clearTimeout(this.sortTimer);
    }
  },

  onShow() {
    // 页面浏览埋点
    const tracking = require('../../utils/tracking');
    tracking.trackPageView('index');
    
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true });
    this.loadCompanions(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadMore();
    }
  },

  // 获取位置
  getLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        // 定位成功
      },
      fail: (err) => {
        // 定位失败，使用默认城市
        // 不显示错误提示，使用默认城市
      }
    });
  },

  // 加载搭子列表 - 使用真实API，网络错误时显示重试按钮
  loadCompanions(callback, isLoadMore = false) {
    this.setData({ 
      isLoading: true,
      isError: false,
      errorMessage: ''
    });

    const that = this;
    const useMockData = app.globalData.useMockData || false;
    
    // 如果启用了 mock 模式，使用模拟数据
    if (useMockData) {
      this.loadMockCompanions(callback, isLoadMore);
      return;
    }

    // 构建请求参数
    const params = {
      page: this.data.page,
      pageSize: this.data.pageSize,
      city: this.data.currentCity === '全部' ? '' : this.data.currentCity
    };

    // 发起真实 API 请求
    wx.request({
      url: app.globalData.apiBaseUrl + api.companions.search(),
      method: 'GET',
      data: params,
      header: {
        'Content-Type': 'application/json'
      },
      success: function(res) {
        if (res.data.code === 0) {
          // 请求成功，处理数据
          const rawList = res.data.data || [];
          that.processCompanionsData(rawList, isLoadMore, callback);
        } else {
          // 业务错误，显示错误信息
          that.setData({
            isLoading: false,
            isError: true,
            errorMessage: res.data.message || '加载失败，请重试'
          });
        }
      },
      fail: function(err) {
        // 网络错误，显示重试按钮
        const logger = require('../../utils/logger');
        logger.error(logger.Categories.NETWORK, '加载搭子列表失败', err);
        that.setData({
          isLoading: false,
          isError: true,
          errorMessage: '网络异常，请检查网络后重试'
        });
      }
    });
  },

  // 加载模拟数据（仅用于开发调试）
  loadMockCompanions(callback, isLoadMore = false) {
    const rawList = mockCompanions.companions || [];
    this.processCompanionsData(rawList, isLoadMore, callback);
  },

  // 处理搭子数据（统一格式化）
  processCompanionsData(rawList, isLoadMore, callback) {
    const list = rawList.map(c => ({
      id: c.id,
      nickname: c.nickname,
      avatar: c.avatar || '/assets/images/avatar-default.png',
      gender: c.gender === 'male' ? '男' : c.gender === 'female' ? '女' : '未知',
      isWorking: c.isOnline, // 使用 isOnline 作为 isWorking
      tags: (c.services || []).map(s => s.name),
      price: c.services && c.services.length > 0 ? c.services[0].price : 0,
      rating: c.rating || 0,
      totalOrders: c.total_orders || 0,
      isLiked: c.is_liked || false,
      location: c.city || '',
      distance: c.distance ? c.distance.toFixed(1) + 'km' : '',
      distanceValue: c.distance || 0
    }));

    // 如果是加载更多，需要追加数据；如果是刷新，替换数据
    if (isLoadMore) {
      const currentAllCompanions = this.data.allCompanions || [];
      const newAllCompanions = [...currentAllCompanions, ...list];
      
      this.setData({ 
        allCompanions: newAllCompanions, 
        isLoading: false,
        isError: false,
        hasMore: list.length >= this.data.pageSize
      });
    } else {
      this.setData({ 
        allCompanions: list, 
        isLoading: false,
        isError: false,
        hasMore: list.length >= this.data.pageSize
      });
    }
    
    this.sortAndUpdateCompanions();
    if (callback) callback();
  },

  // 重试加载
  onRetryLoad() {
    this.setData({ 
      isError: false,
      errorMessage: ''
    });
    this.loadCompanions();
  },

  // 加载更多
  loadMore() {
    this.setData({ page: this.data.page + 1 });
    this.loadCompanions(null, true);
  },

  // 城市选择
  onCityTap() {
    wx.showActionSheet({
      itemList: ['全部', '北京市', '上海市', '广州市', '深圳市', '杭州市', '成都市'],
      success: (res) => {
        const cities = ['全部', '北京市', '上海市', '广州市', '深圳市', '杭州市', '成都市'];
        this.setData({ currentCity: cities[res.tapIndex] });
        // 选择城市后应用筛选
        this.applyFiltersAndSort();
      }
    });
  },

  // 搜索
  onSearchTap() {
    this.setData({
      isSearching: true,
      searchKeyword: ''
    });
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  // 搜索确认
  onSearchConfirm() {
    const keyword = this.data.searchKeyword.trim();
    if (!keyword) {
      // 空关键词，显示全部
      this.applyFiltersAndSort();
      return;
    }
    
    // 根据关键词搜索搭子名称和服务类型（tags）
    const keywordLower = keyword.toLowerCase();
    const filtered = this.data.allCompanions.filter(c => {
      const matchNickname = c.nickname && c.nickname.toLowerCase().includes(keywordLower);
      const matchTags = c.tags && c.tags.some(tag => tag.toLowerCase().includes(keywordLower));
      return matchNickname || matchTags;
    });
    
    // 应用相同的排序逻辑
    const likedCompanions = filtered.filter(c => c.isLiked);
    const unlikedCompanions = filtered.filter(c => !c.isLiked);
    
    const sortByDistance = (a, b) => {
      const distA = a.distanceValue || parseFloat(a.distance) || 999;
      const distB = b.distanceValue || parseFloat(b.distance) || 999;
      return distA - distB;
    };
    
    likedCompanions.sort(sortByDistance);
    unlikedCompanions.sort(sortByDistance);
    
    const sortedCompanions = [...likedCompanions, ...unlikedCompanions];
    
    this.setData({
      companions: sortedCompanions.map((c, index) => ({...c, _sortIndex: `item_${c.id}_${index}`}))
    });
  },

  // 取消搜索
  onSearchCancel() {
    this.setData({
      isSearching: false,
      searchKeyword: ''
    });
    // 恢复显示所有搭子
    this.applyFiltersAndSort();
  },

  // 分类点击 - 根据分类筛选搭子
  onCategoryTap(e) {
    const categoryId = e.currentTarget.dataset.id;
    const category = this.data.categories.find(c => c.id === categoryId);
    
    if (!category) return;
    
    // 如果点击的是已选中的分类，则取消筛选
    if (this.data.selectedCategory === categoryId) {
      this.setData({ selectedCategory: null }, () => {
        // 取消分类后重新应用筛选和排序
        this.applyFiltersAndSort();
      });
      return;
    }
    
    // 设置选中的分类，然后应用筛选和排序
    this.setData({ selectedCategory: categoryId }, () => {
      this.applyFiltersAndSort();
      
      // 检查是否有符合条件的搭子
      const hasMatchingCompanions = this.data.companions.length > 0;
      if (!hasMatchingCompanions) {
        wx.showToast({
          title: '暂无该分类的搭子',
          icon: 'none'
        });
      }
    });
  },

  // 筛选点击 - 性别筛选
  onFilterTap(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({ currentFilter: filter });
    
    // 根据性别筛选（同时考虑分类筛选）
    this.applyFiltersAndSort();
  },

  // 应用所有筛选条件并排序
  applyFiltersAndSort() {
    let filtered = [...this.data.allCompanions];
    
    // 1. 【核心逻辑】只显示接单中的搭子（isWorking === true）
    // 休息中的搭子对用户来说就像不存在一样
    filtered = filtered.filter(c => c.isWorking === true);
    
    // 2. 按城市筛选（如果不是"全部"）
    if (this.data.currentCity !== '全部') {
      filtered = filtered.filter(c => c.location === this.data.currentCity);
    }
    
    // 3. 按性别筛选
    if (this.data.currentFilter !== 'all') {
      const gender = this.data.currentFilter === 'male' ? '男' : '女';
      filtered = filtered.filter(c => c.gender === gender);
    }
    
    // 4. 按分类筛选
    if (this.data.selectedCategory) {
      const category = this.data.categories.find(c => c.id === this.data.selectedCategory);
      if (category) {
        filtered = filtered.filter(companion => {
          return companion.tags && companion.tags.some(tag => {
            return tag.includes(category.name) || category.name.includes(tag);
          });
        });
      }
    }
    
    // 5. 分离心动和非心动的
    const likedCompanions = filtered.filter(c => c.isLiked);
    const unlikedCompanions = filtered.filter(c => !c.isLiked);
    
    // 6. 各自按距离排序
    const sortByDistance = (a, b) => {
      const distA = a.distanceValue || parseFloat(a.distance) || 999;
      const distB = b.distanceValue || parseFloat(b.distance) || 999;
      return distA - distB;
    };
    
    likedCompanions.sort(sortByDistance);
    unlikedCompanions.sort(sortByDistance);
    
    // 7. 合并：心动的在前，非心动的在后
    const sortedCompanions = [...likedCompanions, ...unlikedCompanions];
    
    // 添加 _sortIndex 作为稳定的 key
    this.setData({ 
      companions: sortedCompanions.map((c, index) => ({...c, _sortIndex: `item_${c.id}_${index}`}))
    });
  },

  // 卡片点击
  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/dazi-detail/dazi-detail?id=' + id
    });
  },

  // 心动点击（带防抖，300ms内只执行一次）
  onLikeTap: throttle(function(e) {
    const id = e.currentTarget.dataset.id;  // ID 是字符串，不要 parseInt
    let idx = e.currentTarget.dataset.index;
    
    // 检查是否正在处理中，防止重复点击
    if (this.data.isLikeLoading) {
      return;
    }
    
    // 确保 idx 是数字
    idx = parseInt(idx);
    if (isNaN(idx)) {
      const logger = require('../../utils/logger');
      logger.error(logger.Categories.UI, 'Invalid index:', e.currentTarget.dataset.index);
      return;
    }
    
    // 使用 setData 直接更新单个项，避免整体重排导致的渲染错误
    const companionKey = `companions[${idx}].isLiked`;
    const allCompIndex = this.data.allCompanions.findIndex(c => c.id === id);
    
    if (allCompIndex === -1) return;
    
    const isLiked = !this.data.allCompanions[allCompIndex].isLiked;
    const companion = this.data.allCompanions[allCompIndex];
    
    // 设置加载状态，防止重复点击
    this.setData({ isLikeLoading: true });
    
    // 调用后端API保存心动状态
    const app = getApp();
    app.request({
      url: api.companions.like(id),
      method: isLiked ? 'POST' : 'DELETE'
    }).then(res => {
      // API调用成功，更新UI和本地存储
      let allCompanions = [...this.data.allCompanions];
      allCompanions[allCompIndex].isLiked = isLiked;
      
      if (isLiked) {
        this.sendLikeNotification(companion);
        wx.showToast({
          title: '已发送心动消息给搭子',
          icon: 'none',
          duration: 2000
        });
      } else {
        wx.showToast({
          title: '已取消心动',
          icon: 'none'
        });
      }
      
      this.setData({ 
        allCompanions: allCompanions,
        [companionKey]: isLiked
      });
      
      // 延迟重新排序，使用动画让变化更平滑
      this.sortTimer = setTimeout(() => {
        this.sortAndUpdateCompanionsSafe();
      }, 300);
    }).catch(err => {
      // API调用失败，显示错误提示
      const logger = require('../../utils/logger');
      logger.error(logger.Categories.NETWORK, '心动操作失败', err);
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none',
        duration: 2000
      });
    }).finally(() => {
      // 无论成功失败，都重置加载状态
      this.setData({ isLikeLoading: false });
    });
  }, 300),

  // 发送心动通知给搭子（B端可收到）
  sendLikeNotification(companion) {
    const logger = require('../../utils/logger');
    logger.info(logger.Categories.UI, '发送心动消息给搭子:', companion.nickname);
    
    // 构建通知消息（已通过 /api/c/companions/{id}/like API 发送给后端）
    const likeMessage = {
      type: 'like',
      fromUser: {
        id: 'current_user_id',
        nickname: '当前用户',
        avatar: ''
      },
      toCompanion: companion.id,
      content: '对你心动了',
      createTime: new Date().toISOString()
    };
    
    // 存储到本地（作为本地记录，实际通知已通过API发送给后端）
    let likeMessages = wx.getStorageSync('like_messages') || [];
    likeMessages.push(likeMessage);
    wx.setStorageSync('like_messages', likeMessages);
  },

  // 排序搭子：收藏的排在前面，按距离排序
  sortAndUpdateCompanions() {
    // 使用 wx.nextTick 确保在下一个渲染周期执行
    wx.nextTick(() => {
      this.applyFiltersAndSort();
    });
  },

  // 安全的排序方式 - 用于点赞后重新排序，避免 removedNode 错误
  sortAndUpdateCompanionsSafe() {
    // 使用统一的筛选排序方法
    this.applyFiltersAndSort();
  },

  onShareAppMessage() {
    return {
      title: '有个搭子 - 发现有趣的陪伴',
      path: '/pages/index/index'
    };
  }
});
