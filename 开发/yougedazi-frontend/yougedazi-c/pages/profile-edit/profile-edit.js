// pages/profile-edit/profile-edit.js
Page({
  data: {
    userInfo: {
      avatar: '',
      nickname: '',
      gender: '',
      age: null,
      phone: ''
    },
    ageList: [],
    showAgeModal: false
  },

  onLoad() {
    // 生成年龄列表 18-60岁
    const ageList = [];
    for (let i = 18; i <= 60; i++) {
      ageList.push(i);
    }
    this.setData({ ageList });

    // 加载用户信息
    this.loadUserInfo();
  },

  // 加载用户信息
  loadUserInfo() {
    // 从本地存储获取用户信息
    const userInfo = wx.getStorageSync('user_info') || {
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
      nickname: '用户昵称',
      gender: '男',
      age: 25,
      phone: '138****8888'
    };
    this.setData({ userInfo });
  },

  // 返回上一页
  onBack() {
    wx.navigateBack();
  },

  // 保存资料
  onSave() {
    const { userInfo } = this.data;
    
    // 验证昵称
    if (!userInfo.nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    
    // 模拟保存
    setTimeout(() => {
      wx.hideLoading();
      // 保存到本地
      wx.setStorageSync('user_info', userInfo);
      wx.showToast({ 
        title: '保存成功', 
        icon: 'success',
        success: () => {
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      });
    }, 1000);
  },

  // 更换头像
  onChangeAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        this.setData({
          'userInfo.avatar': tempFilePath
        });
      }
    });
  },

  // 昵称输入
  onNicknameInput(e) {
    this.setData({
      'userInfo.nickname': e.detail.value
    });
  },

  // 性别选择
  onGenderSelect(e) {
    const gender = e.currentTarget.dataset.gender;
    this.setData({
      'userInfo.gender': gender
    });
  },

  // 显示年龄选择
  onAgeSelect() {
    this.setData({ showAgeModal: true });
  },

  // 关闭年龄选择
  onCloseAgeModal() {
    this.setData({ showAgeModal: false });
  },

  // 确认年龄
  onAgeConfirm(e) {
    const age = e.currentTarget.dataset.age;
    this.setData({
      'userInfo.age': age,
      showAgeModal: false
    });
  }
});
