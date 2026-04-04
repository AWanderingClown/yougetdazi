// pages/address/address.js
Page({
  data: {
    // 状态栏高度
    statusBarHeight: 20,
    // 导航栏高度
    navBarHeight: 44,
    
    // 地址列表（模拟数据）
    addressList: [
      {
        id: 1,
        name: '张三',
        phone: '138****8888',
        province: '福建省',
        city: '厦门市',
        district: '思明区',
        detail: '软件园二期观日路52号',
        isDefault: true
      },
      {
        id: 2,
        name: '李四',
        phone: '139****9999',
        province: '福建省',
        city: '厦门市',
        district: '湖里区',
        detail: '万达广场写字楼A座1205室',
        isDefault: false
      },
      {
        id: 3,
        name: '王五',
        phone: '137****7777',
        province: '福建省',
        city: '泉州市',
        district: '丰泽区',
        detail: '东海泰禾广场3号楼1801',
        isDefault: false
      }
    ]
  },

  onLoad() {
    this.calcNavBarHeight();
  },

  // 计算导航栏高度（适配系统胶囊按钮位置，延伸到胶囊下方）
  calcNavBarHeight() {
    const windowInfo = wx.getWindowInfo();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();

    // 导航栏高度 = 胶囊按钮底部位置 + 下方间距（延伸到胶囊下方）
    const navBarHeight = menuButtonInfo.bottom + 12;

    this.setData({
      navBarHeight: navBarHeight,
      statusBarHeight: windowInfo.statusBarHeight
    });
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 选择地址
  selectAddress(e) {
    const id = e.currentTarget.dataset.id;
    const address = this.data.addressList.find(item => item.id === id);
    
    // 将选中的地址保存到本地
    wx.setStorageSync('selected_address', address);
    
    wx.showToast({
      title: '已选择该地址',
      icon: 'success'
    });
  },

  // 编辑地址
  editAddress(e) {
    const id = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['设为默认', '编辑', '删除'],
      success: (res) => {
        switch(res.tapIndex) {
          case 0:
            this.setDefaultAddress(id);
            break;
          case 1:
            wx.showToast({ title: '编辑功能开发中', icon: 'none' });
            break;
          case 2:
            this.deleteAddress(id);
            break;
        }
      }
    });
  },

  // 设为默认地址
  setDefaultAddress(id) {
    const list = this.data.addressList.map(item => ({
      ...item,
      isDefault: item.id === id
    }));
    
    this.setData({ addressList: list });
    
    wx.showToast({
      title: '已设为默认',
      icon: 'success'
    });
  },

  // 删除地址
  deleteAddress(id) {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该地址吗？',
      success: (res) => {
        if (res.confirm) {
          const list = this.data.addressList.filter(item => item.id !== id);
          this.setData({ addressList: list });
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  // 添加地址
  addAddress() {
    // 上限检查：最多保存5个地址
    if (this.data.addressList.length >= 5) {
      wx.showToast({ title: '最多只能保存5个地址', icon: 'none' });
      return;
    }
    // 直接允许点选地图位置并填充新的地址（真实场景应接入地图 API）
    wx.chooseLocation({
      success: (res) => {
        const newAddr = {
          id: Date.now(),
          name: '新地址',
          phone: '',
          province: '',
          city: '',
          district: '',
          detail: res.address || '',
          latitude: res.latitude,
          longitude: res.longitude,
          isDefault: false
        };
        const list = [...this.data.addressList, newAddr];
        this.setData({ addressList: list });
        wx.showToast({ title: '地址已添加', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '未选择地址', icon: 'none' });
      }
    });
  }
});
