// pages/services/services.js - 服务项目
// 与C端首页分类保持一致，修改需审核
Page({
  data: {
    // 服务项目列表（与C端首页分类完全一致）
    serviceCategories: [
      { id: 1, name: '逛街', icon: '/assets/icons/categories/购物车.png', price: 88 },
      { id: 2, name: '运动', icon: '/assets/icons/categories/棒球.png', price: 100 },
      { id: 3, name: '餐饮', icon: '/assets/icons/categories/刀叉.png', price: 80 },
      { id: 4, name: '棋牌/密室', icon: '/assets/icons/categories/扑克.png', price: 100 },
      { id: 5, name: '电竞', icon: '/assets/icons/categories/游戏.png', price: 128 },
      { id: 6, name: '酒吧/K歌', icon: '/assets/icons/categories/鸡尾酒.png', price: 150 },
      { id: 7, name: '派对', icon: '/assets/icons/categories/派对.png', price: 200 },
      { id: 8, name: '茶艺', icon: '/assets/icons/categories/茶壶.png', price: 120 },
      { id: 9, name: '电影/影视', icon: '/assets/icons/categories/影视.png', price: 80 },
      { id: 10, name: '旅游向导', icon: '/assets/icons/categories/飞机.png', price: 150 }
    ],
    
    // 当前已选服务项目
    selectedServices: [],
    
    // 审核状态
    auditStatus: 'none', // none: 无变更, pending: 审核中, approved: 已通过, rejected: 已拒绝
    auditRemark: '',
    
    // 是否处于编辑模式
    isEditing: false,
    
    // 暂存的修改
    pendingServices: []
  },

  onLoad() {
    this.loadServices();
    this.loadAuditStatus();
  },

  // 加载当前服务项目
  loadServices() {
    const registerData = wx.getStorageSync('registerData') || {};
    const skills = registerData.skills || [];
    const savedServices = wx.getStorageSync('myServices') || skills;

    const categories = this.data.serviceCategories.map(item => ({
      ...item,
      isActive: savedServices.includes(item.name),
      isSelected: false
    }));

    this.setData({
      selectedServices: savedServices,
      serviceCategories: categories
    });
  },

  // 加载审核状态
  loadAuditStatus() {
    const auditInfo = wx.getStorageSync('serviceAuditInfo');
    if (!auditInfo) return;

    const status = auditInfo.status || 'none';

    // 审核通过：把 pendingServices 同步为正式生效的服务，并清除审核记录
    if (status === 'approved' && auditInfo.pendingServices?.length) {
      wx.setStorageSync('myServices', auditInfo.pendingServices);
      wx.removeStorageSync('serviceAuditInfo');
      this.setData({
        selectedServices: auditInfo.pendingServices,
        auditStatus: 'none'
      });
      return;
    }

    this.setData({
      auditStatus: status,
      auditRemark: auditInfo.remark || '',
      pendingServices: auditInfo.pendingServices || []
    });
  },

  // 切换编辑模式
  toggleEdit() {
    if (this.data.auditStatus === 'pending') {
      wx.showToast({
        title: '修改审核中，请等待',
        icon: 'none'
      });
      return;
    }

    if (this.data.isEditing) {
      // 取消编辑：还原
      this.setData({
        isEditing: false,
        pendingServices: [...this.data.selectedServices]
      });
      this._refreshCategories(this.data.selectedServices);
      return;
    }

    // 进入编辑：用 selectedServices 初始化 isSelected
    const pending = [...this.data.selectedServices];
    this.setData({
      isEditing: true,
      pendingServices: pending
    });
    this._refreshCategories(pending);
  },

  // 刷新每个 serviceCategory 的 isSelected 标记
  _refreshCategories(selectedList) {
    const categories = this.data.serviceCategories.map(item => ({
      ...item,
      isSelected: selectedList.includes(item.name)
    }));
    this.setData({ serviceCategories: categories });
  },

  // 选择/取消服务项目
  toggleService(e) {
    if (!this.data.isEditing) return;

    const index = e.currentTarget.dataset.index;
    const item = this.data.serviceCategories[index];
    const pendingServices = [...this.data.pendingServices];
    const inList = pendingServices.indexOf(item.name);

    if (inList > -1) {
      // 取消选择（至少保留一个）
      if (pendingServices.length <= 1) {
        wx.showToast({ title: '至少保留一个服务项目', icon: 'none' });
        return;
      }
      pendingServices.splice(inList, 1);
    } else {
      // 选择（最多5个）
      if (pendingServices.length >= 5) {
        wx.showToast({ title: '最多选择5个服务项目', icon: 'none' });
        return;
      }
      pendingServices.push(item.name);
    }

    // 同时更新 pendingServices 和该项的 isSelected
    this.setData({
      pendingServices,
      [`serviceCategories[${index}].isSelected`]: !item.isSelected
    });
  },

  // 提交修改审核
  submitAudit() {
    const { pendingServices, selectedServices } = this.data;
    
    // 检查是否有变化
    if (JSON.stringify([...pendingServices].sort()) === JSON.stringify([...selectedServices].sort())) {
      wx.showToast({
        title: '未做任何修改',
        icon: 'none'
      });
      return;
    }
    
    wx.showModal({
      title: '提交审核',
      content: '修改服务项目需要运营专员审核，审核期间您仍可接单，审核完成后可接新类别的订单。是否提交？',
      confirmText: '提交审核',
      success: (res) => {
        if (res.confirm) {
          // 保存审核信息
          const auditInfo = {
            status: 'pending',
            pendingServices: pendingServices,
            submitTime: Date.now(),
            remark: ''
          };
          wx.setStorageSync('serviceAuditInfo', auditInfo);
          
          this.setData({
            auditStatus: 'pending',
            pendingServices: pendingServices,
            isEditing: false
          });
          
          wx.showToast({
            title: '已提交审核',
            icon: 'success'
          });
          
          // 实际项目中这里应该调用API提交审核
          console.log('提交服务项目修改审核:', pendingServices);
        }
      }
    });
  },

  // 取消编辑
  cancelEdit() {
    this.setData({
      isEditing: false,
      pendingServices: [...this.data.selectedServices]
    });
    this._refreshCategories(this.data.selectedServices);
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  }
});
