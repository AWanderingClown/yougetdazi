// pages/profile-edit/profile-edit.js
Page({
  data: {
    // 当前生效的资料（审核通过后的）
    avatar: '',
    nickname: '',
    gender: '',
    age: '',
    ageIndex: 0,
    ageRange: Array.from({ length: 43 }, (_, i) => (i + 18) + '岁'),
    city: '',
    region: ['北京市', '北京市', '朝阳区'],
    bio: '',
    album: [],

    // 预览用的服务标签
    previewServices: [],

    // 审核状态
    auditStatus: 'none', // none / pending / approved / rejected
    auditRemark: '',

    // 用于判断是否有改动
    originalData: {},
    canSave: false
  },

  onLoad() {
    this.loadUserInfo();
  },

  onShow() {
    this.loadPreviewServices();
  },

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const registerData = wx.getStorageSync('registerData') || {};

    const data = {
      avatar: userInfo.avatar || registerData.avatar || '',
      nickname: userInfo.nickname || registerData.nickname || '',
      gender: userInfo.gender || registerData.gender || '',
      age: userInfo.age || registerData.age || '',
      city: userInfo.city || registerData.city || '',
      bio: userInfo.bio || registerData.bio || '',
      region: userInfo.region || registerData.region || ['北京市', '北京市', '朝阳区'],
      album: userInfo.album || []
    };

    const ageIndex = this.data.ageRange.findIndex(a => a === data.age);

    this.setData({
      ...data,
      ageIndex: ageIndex >= 0 ? ageIndex : 0,
      originalData: { ...data },
      canSave: false
    });

    this.loadAuditStatus();
    this.loadPreviewServices();
  },

  // 加载审核状态
  loadAuditStatus() {
    const auditInfo = wx.getStorageSync('profileAuditInfo');
    if (!auditInfo) return;

    const status = auditInfo.status || 'none';

    // 审核通过：把待审核资料写入正式生效，清除审核记录
    if (status === 'approved' && auditInfo.pendingProfile) {
      const p = auditInfo.pendingProfile;
      const userInfo = wx.getStorageSync('userInfo') || {};
      wx.setStorageSync('userInfo', { ...userInfo, ...p });
      wx.removeStorageSync('profileAuditInfo');

      const ageIndex = this.data.ageRange.findIndex(a => a === p.age);
      this.setData({
        ...p,
        ageIndex: ageIndex >= 0 ? ageIndex : 0,
        originalData: { ...p },
        auditStatus: 'none',
        canSave: false
      });
      return;
    }

    this.setData({
      auditStatus: status,
      auditRemark: auditInfo.remark || ''
    });
  },

  loadPreviewServices() {
    const saved = wx.getStorageSync('myServices') || [];
    const registerData = wx.getStorageSync('registerData') || {};
    const services = saved.length ? saved : (registerData.skills || []);
    this.setData({ previewServices: services });
  },

  checkCanSave() {
    const { avatar, nickname, gender, age, city, bio, album, originalData } = this.data;
    // 只要有修改就可以提交，不设置必填项
    const hasChanged =
      avatar !== originalData.avatar ||
      nickname !== originalData.nickname ||
      gender !== originalData.gender ||
      age !== originalData.age ||
      city !== originalData.city ||
      bio !== (originalData.bio || '') ||
      JSON.stringify(album) !== JSON.stringify(originalData.album || []);

    this.setData({ canSave: hasChanged });
  },

  // 选择头像
  chooseAvatar() {
    if (this.data.auditStatus === 'pending') {
      wx.showToast({ title: '审核中，请等待', icon: 'none' });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ avatar: res.tempFilePaths[0] }, () => this.checkCanSave());
      }
    });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value }, () => this.checkCanSave());
  },

  selectGender(e) {
    if (this.data.auditStatus === 'pending') return;
    this.setData({ gender: e.currentTarget.dataset.gender }, () => this.checkCanSave());
  },

  onAgeChange(e) {
    const ageIndex = e.detail.value;
    this.setData({ ageIndex, age: this.data.ageRange[ageIndex] }, () => this.checkCanSave());
  },

  onCityChange(e) {
    const region = e.detail.value;
    this.setData({ region, city: region[1] }, () => this.checkCanSave());
  },

  onBioInput(e) {
    this.setData({ bio: e.detail.value }, () => this.checkCanSave());
  },

  // 添加相册照片
  chooseAlbumPhoto() {
    if (this.data.auditStatus === 'pending') {
      wx.showToast({ title: '审核中，请等待', icon: 'none' });
      return;
    }
    const remaining = 9 - this.data.album.length;
    if (remaining <= 0) return;

    wx.chooseImage({
      count: remaining,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const album = [...this.data.album, ...res.tempFilePaths].slice(0, 9);
        this.setData({ album }, () => this.checkCanSave());
      }
    });
  },

  // 删除相册照片
  removeAlbumPhoto(e) {
    if (this.data.auditStatus === 'pending') {
      wx.showToast({ title: '审核中，请等待', icon: 'none' });
      return;
    }
    const index = e.currentTarget.dataset.index;
    wx.showModal({
      title: '删除照片',
      content: '确定删除这张照片吗？',
      confirmText: '删除',
      confirmColor: '#EF4444',
      success: (res) => {
        if (res.confirm) {
          const album = [...this.data.album];
          album.splice(index, 1);
          this.setData({ album }, () => this.checkCanSave());
        }
      }
    });
  },

  // 提交审核
  submitAudit() {
    if (this.data.auditStatus === 'pending') {
      wx.showToast({ title: '审核中，请耐心等待', icon: 'none' });
      return;
    }
    if (!this.data.canSave) {
      wx.showToast({ title: '请填写头像、昵称、性别、年龄、城市', icon: 'none' });
      return;
    }

    const { avatar, nickname, gender, age, city, bio, region, album } = this.data;

    wx.showModal({
      title: '提交审核',
      content: '资料修改需运营专员审核，审核通过后将更新展示给客户。是否提交？',
      confirmText: '提交审核',
      confirmColor: '#7B68EE',
      success: (res) => {
        if (!res.confirm) return;

        const auditInfo = {
          status: 'pending',
          pendingProfile: { avatar, nickname, gender, age, city, bio, region, album },
          submitTime: Date.now(),
          remark: ''
        };
        wx.setStorageSync('profileAuditInfo', auditInfo);

        this.setData({
          auditStatus: 'pending',
          canSave: false
        });

        wx.showToast({ title: '已提交审核', icon: 'success' });
      }
    });
  },

  goBack() {
    if (this.data.canSave && this.data.auditStatus !== 'pending') {
      wx.showModal({
        title: '提示',
        content: '有未提交的修改，确定退出吗？',
        confirmText: '退出',
        cancelText: '继续编辑',
        success: (res) => { if (res.confirm) wx.navigateBack(); }
      });
    } else {
      wx.navigateBack();
    }
  }
});
