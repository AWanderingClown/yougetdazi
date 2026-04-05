const app = getApp();
const { checkAcceptPermission } = require('../../utils/auth');
const { ERROR_CODE } = require('../../utils/constants');

Page({
  data: {
    filterType: 'all',
    tasks: [],
    loadingState: 'idle', // 'idle' | 'refreshing' | 'loading' | 'loadingMore'
    hasMore: true,
    page: 1,
    pageSize: 10,

    // 弹窗
    showGrabModal: false,
    selectedTask: {},
    isConfirmed: false // 是否确认抢单须知
  },

  onLoad() {
    // 缓存用户性别，避免每次筛选都从存储读取
    const userInfo = wx.getStorageSync('userInfo') || {};
    const registerData = wx.getStorageSync('registerData') || {};
    this.cachedGender = userInfo.gender || registerData.gender;

    this.loadTasks();
  },

  goBack() {
    wx.navigateBack();
  },

  onShow() {
    // 检查性别是否变化，若变化则重新缓存并加载任务列表
    const userInfo = wx.getStorageSync('userInfo') || {};
    const registerData = wx.getStorageSync('registerData') || {};
    const newGender = userInfo.gender || registerData.gender;

    if (newGender && newGender !== this.cachedGender) {
      this.cachedGender = newGender;
      this.setData({ tasks: [], page: 1, hasMore: true }, () => {
        this.loadTasks(true);
      });
    } else if (this.data.tasks.length === 0) {
      this.loadTasks();
    }

    // 使用全局事件监听新悬赏单推送
    if (app.globalEvent && !this._eventBound) {
      this._eventBound = true;
      this._handleNewReward = () => {
        this.loadTasks(true);
      };
      app.globalEvent.on('order:new_reward', this._handleNewReward);
    }
  },

  onHide() {
    // 移除全局事件监听，防止内存泄漏
    if (app.globalEvent && this._handleNewReward) {
      app.globalEvent.off('order:new_reward', this._handleNewReward);
    }
    this._eventBound = false;
    this._handleNewReward = null;

    // 清理 setTimeout，防止内存泄漏
    if (this.navigateTimeout) {
      clearTimeout(this.navigateTimeout);
      this.navigateTimeout = null;
    }
  },

  onUnload() {
    if (app.globalEvent && this._handleNewReward) {
      app.globalEvent.off('order:new_reward', this._handleNewReward);
    }
    this._eventBound = false;
    this._handleNewReward = null;
    if (this.navigateTimeout) {
      clearTimeout(this.navigateTimeout);
      this.navigateTimeout = null;
    }
  },

  // 加载任务列表
  loadTasks(refresh = false) {
    if (this.data.loadingState !== 'idle' && !refresh) return;

    // 状态转换逻辑：
    // - refresh=true 时总是切换到 'refreshing'（下拉刷新）
    // - refresh=false 时，保持 'loadingMore'（如果已在加载更多），否则切换为 'loading'
    let newState;
    if (refresh) {
      newState = 'refreshing';
    } else if (this.data.loadingState === 'loadingMore') {
      newState = 'loadingMore';
    } else {
      newState = 'loading';
    }
    this.setData({ loadingState: newState });

    const params = {
      page: refresh ? 1 : this.data.page,
      pageSize: this.data.pageSize,
      filter: this.data.filterType
    };

    app.request({
      url: '/api/tasks',
      data: params
    })
      .then((res) => {
        if (res.code === 0) {
          let newTasks = (res.data && res.data.list) || [];

          // 根据性别筛选：只显示与当前搭子性别匹配的悬赏任务
          newTasks = this.filterTasksByGender(newTasks);

          const tasks = refresh ? newTasks : [...this.data.tasks, ...newTasks];

          this.setData({
            tasks,
            hasMore: newTasks.length >= this.data.pageSize,
            page: refresh ? 2 : this.data.page + 1
          });
        } else {
          wx.showToast({
            title: res.message || '加载失败',
            icon: 'none'
          });
        }
      })
      .catch(() => {
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      })
      .finally(() => {
        this.setData({ loadingState: 'idle' });
      });
  },

  // 根据性别筛选任务
  // 悬赏订单的gender字段: 'male'男, 'female'女（C端只有这两个选项）
  // 搭子的gender字段: 'male'男, 'female'女
  filterTasksByGender(tasks) {
    // 使用缓存的性别，避免重复读取存储
    const myGender = this.cachedGender;
    
    // 如果搭子没有设置性别，显示所有任务（开发模式）或空（生产模式）
    if (!myGender) {
      // 开发模式下返回所有任务，生产环境应返回[]
      return tasks;
    }
    
    // 只显示性别匹配的任务
    // 注意：任务必须有gender字段（male/female），与C端发布时选择的性别对应
    return tasks.filter(task => {
      // 如果任务没有gender字段，默认显示（兼容旧数据）
      if (!task.gender) return true;
      return task.gender === myGender;
    });
  },

  // 下拉刷新
  onRefresh() {
    this.setData({ loadingState: 'refreshing' });
    this.loadTasks(true);
  },

  // 加载更多
  onLoadMore() {
    if (!this.data.hasMore || this.data.loadingState === 'loadingMore') return;
    this.setData({ loadingState: 'loadingMore' });
    this.loadTasks();
  },

  // 切换筛选
  onFilterChange(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ 
      filterType: type,
      tasks: [],
      page: 1,
      hasMore: true
    }, () => {
      this.loadTasks(true);
    });
  },

  // 点击任务
  onTaskTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/b-order-detail/b-order-detail?id=' + id + '&type=reward'
    });
  },

  // 点击抢单
  onGrabTap(e) {
    e.stopPropagation();
    const { id, canGrab } = e.currentTarget.dataset;
    if (!canGrab) return;

    const task = this.data.tasks.find(t => t.id === id);
    if (!task) return;

    this.setData({
      showGrabModal: true,
      selectedTask: task,
      isConfirmed: false
    });
  },

  // 关闭弹窗
  onCloseModal() {
    this.setData({ showGrabModal: false, isConfirmed: false });
  },

  // 切换确认状态
  toggleConfirm() {
    this.setData({
      isConfirmed: !this.data.isConfirmed
    });
  },

  // 确认抢单
  onConfirmGrab() {
    if (!this.data.isConfirmed) {
      wx.showToast({
        title: '请先同意抢单须知',
        icon: 'none'
      });
      return;
    }

    // 检查保证金状态，通过后执行抢单
    checkAcceptPermission({
      showModal: true,
      onCanAccept: () => {
        this.executeGrabTask();
      }
    });
  },

  // 执行抢单
  executeGrabTask() {
    const taskId = this.data.selectedTask.id;

    wx.showLoading({ title: '抢单中...' });

    app.request({
      url: `/api/tasks/${taskId}/grab`,
      method: 'POST'
    })
      .then((res) => {
        wx.hideLoading();
        if (res.code === 0) {
          wx.showToast({
            title: '抢单成功',
            icon: 'success'
          });

          // 更新任务状态
          const tasks = this.data.tasks.map(t => {
            if (t.id === taskId) {
              return {
                ...t,
                canGrab: false,
                grabbedCount: t.grabbedCount + 1
              };
            }
            return t;
          });
          this.setData({ showGrabModal: false, tasks });

          // 跳转到订单详情
          const orderId = (res.data && res.data.orderId) || this.data.selectedTask.id;
          this.navigateTimeout = setTimeout(() => {
            this.navigateTimeout = null;
            wx.navigateTo({
              url: '/pages/b-order-detail/b-order-detail?id=' + orderId + '&type=reward'
            });
          }, 1500);
        } else if (res.code === ERROR_CODE.ALREADY_GRABBED) {
          // 已被抢完
          wx.showToast({
            title: '手慢了，已被抢完',
            icon: 'none'
          });
          this.setData({ showGrabModal: false });
          this.loadTasks(true);
        } else {
          wx.showToast({
            title: res.message || '抢单失败',
            icon: 'none'
          });
        }
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      });
  }
});
