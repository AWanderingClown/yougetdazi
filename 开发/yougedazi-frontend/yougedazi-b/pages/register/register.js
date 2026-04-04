// pages/register/register.js - 搭子注册
Page({
  data: {
    step: 1,
    
    // 步骤1：基本信息
    avatar: '',
    nickname: '',
    gender: '',
    age: '',
    ageIndex: 0,
    ageRange: Array.from({length: 43}, (_, i) => (i + 18) + '岁'),
    city: '',
    region: ['北京市', '北京市', '朝阳区'],
    
    // 步骤2：实名认证
    idCardFront: '',
    idCardBack: '',
    realName: '',
    idCard: '',
    isRecognizing: false,  // OCR识别中
    recognizeType: '',    // 识别类型 front/back
    
    // 步骤3：技能标签（与C端首页分类一致，支持多选）
    skillCategories: [
      { id: 1, name: '逛街', icon: '🛍️', selected: false },
      { id: 2, name: '运动', icon: '⚾', selected: false },
      { id: 3, name: '餐饮', icon: '🍽️', selected: false },
      { id: 4, name: '棋牌/密室', icon: '🃏', selected: false },
      { id: 5, name: '电竞', icon: '🎮', selected: false },
      { id: 6, name: '酒吧/K歌', icon: '🍸', selected: false },
      { id: 7, name: '派对', icon: '🎉', selected: false },
      { id: 8, name: '茶艺', icon: '🍵', selected: false },
      { id: 9, name: '电影/影视', icon: '🎬', selected: false },
      { id: 10, name: '旅游向导', icon: '✈️', selected: false }
    ],
    selectedSkills: [],
    bio: '',
    
    // 协议同意
    agreements: {
      b_service: false,
      b_privacy: false,
      b_service_guide: false,
      b_compliance: false
    },
    
    canNext: false
  },

  onLoad() {
    this.checkCanNext();
  },

  // 验证身份证号格式
  validateIdCard(idCard) {
    // 基本格式：18位，前17位数字，最后一位数字或X
    const reg = /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/;
    return reg.test(idCard);
  },

  // 检查是否可以下一步
  checkCanNext() {
    const { step, avatar, nickname, gender, age, city, idCardFront, idCardBack, realName, idCard, selectedSkills } = this.data;
    let canNext = false;

    if (step === 1) {
      canNext = avatar && nickname && gender && age && city;
    } else if (step === 2) {
      canNext = idCardFront && idCardBack && realName && this.validateIdCard(idCard);
    } else if (step === 3) {
      const { b_service, b_privacy, b_service_guide, b_compliance } = this.data.agreements;
      canNext = selectedSkills.length > 0 && b_service && b_privacy && b_service_guide && b_compliance;
    }

    this.setData({ canNext });
  },

  // 选择头像
  chooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ avatar: res.tempFilePaths[0] });
        this.checkCanNext();
      }
    });
  },

  // 昵称输入
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
    this.checkCanNext();
  },

  // 选择性别
  selectGender(e) {
    this.setData({ gender: e.currentTarget.dataset.gender });
    this.checkCanNext();
  },

  // 年龄选择
  onAgeChange(e) {
    const ageIndex = e.detail.value;
    const age = this.data.ageRange[ageIndex];
    this.setData({ ageIndex, age });
    this.checkCanNext();
  },

  // 城市选择
  onCityChange(e) {
    const region = e.detail.value;
    const city = region[1];
    this.setData({ region, city });
    this.checkCanNext();
  },

  // 上传身份证正面
  uploadIdCardFront() {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        const sourceType = res.tapIndex === 0 ? ['camera'] : ['album'];
        this.setData({ recognizeType: 'front' });
        this.uploadAndRecognizeIdCard('front', sourceType);
      }
    });
  },

  // 上传身份证反面
  uploadIdCardBack() {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        const sourceType = res.tapIndex === 0 ? ['camera'] : ['album'];
        this.setData({ recognizeType: 'back' });
        this.uploadAndRecognizeIdCard('back', sourceType);
      }
    });
  },

  // 上传并识别身份证
  uploadAndRecognizeIdCard(type, sourceType) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: sourceType,
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        
        wx.showLoading({ title: '识别中...' });
        
        // 调用微信OCR接口识别身份证
        // 文档：https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/img-ocr/ocr/idCardOCR.html
        wx.serviceMarket.invokeService({
          service: 'wxapiwiseocr',
          api: 'ocridcard',
          data: {
            type: type === 'front' ? 'photo' : 'photo_back',
            img_url: tempFilePath
          },
        }).then(result => {
          wx.hideLoading();
          console.log('OCR识别结果:', result);
          
          if (result.data && result.data.errcode === 0) {
            const data = result.data.data;
            
            if (type === 'front') {
              // 正面：识别姓名和身份证号
              // 微信返回字段: name, idcard_number (可能因版本不同而有差异)
              const name = data.name || data.Name || '';
              const idNum = data.idcard_number || data.idNum || data.IdCardNo || '';
              
              this.setData({ 
                idCardFront: tempFilePath,
                realName: name,
                idCard: idNum
              });
              wx.showToast({ title: '识别成功', icon: 'success' });
            } else {
              // 反面：仅保存图片（有效期等信息可选处理）
              this.setData({ idCardBack: tempFilePath });
              wx.showToast({ title: '识别成功', icon: 'success' });
            }
          } else {
            // OCR识别失败，仅保存图片，手动输入
            if (type === 'front') {
              this.setData({ idCardFront: tempFilePath });
            } else {
              this.setData({ idCardBack: tempFilePath });
            }
            wx.showToast({ title: '识别失败，请手动输入', icon: 'none', duration: 2000 });
          }
          
          this.checkCanNext();
        }).catch(err => {
          wx.hideLoading();
          console.error('OCR识别失败', err);
          
          // 识别失败，仅保存图片
          if (type === 'front') {
            this.setData({ idCardFront: tempFilePath });
          } else {
            this.setData({ idCardBack: tempFilePath });
          }
          wx.showToast({ title: '识别失败，请手动输入', icon: 'none', duration: 2000 });
          this.checkCanNext();
        });
      }
    });
  },

  // 真实姓名输入
  onRealNameInput(e) {
    this.setData({ realName: e.detail.value });
    this.checkCanNext();
  },

  // 身份证号输入
  onIdCardInput(e) {
    this.setData({ idCard: e.detail.value });
    this.checkCanNext();
  },

  // 切换技能标签（多选）
  toggleSkill(e) {
    const { id } = e.currentTarget.dataset;
    const { selectedSkills, skillCategories } = this.data;
    
    const skill = skillCategories.find(item => item.id === id);
    if (!skill) return;
    
    // 更新选中状态
    const updatedCategories = skillCategories.map(function(item) {
      if (item.id === id) {
        item.selected = !item.selected;
      }
      return item;
    });
    
    // 更新已选技能列表
    const selectedNames = updatedCategories
      .filter(item => item.selected)
      .map(item => item.name);
    
    this.setData({ 
      skillCategories: updatedCategories,
      selectedSkills: selectedNames
    });
    
    // 提供视觉反馈
    if (!skill.selected) {
      wx.vibrateShort({ type: 'light' });
    }
    
    this.checkCanNext();
  },

  // 简介输入
  onBioInput(e) {
    this.setData({ bio: e.detail.value });
  },

  // 上一步
  prevStep() {
    if (this.data.step > 1) {
      this.setData({ step: this.data.step - 1 });
      this.checkCanNext();
    }
  },

  // 下一步
  nextStep() {
    if (!this.data.canNext) return;

    if (this.data.step < 3) {
      this.setData({ step: this.data.step + 1 });
      this.checkCanNext();
    } else {
      // 提交审核
      this.submitAudit();
    }
  },

  // 切换协议同意
  toggleAgreement(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      [`agreements.${type}`]: !this.data.agreements[type]
    }, () => {
      this.checkCanNext();
    });
  },

  // 查看协议
  viewAgreement(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=' + type
    });
  },

  // 提交审核
  submitAudit() {
    const { b_service, b_privacy, b_service_guide, b_compliance } = this.data.agreements;
    if (!b_service || !b_privacy || !b_service_guide || !b_compliance) {
      wx.showToast({ title: '请先同意所有协议', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    const app = getApp();
    // 性别映射：男=1 女=2
    const genderMap = { '男': 1, '女': 2 };
    const ageNum = parseInt(this.data.age) || 18;

    wx.request({
      url: app.globalData.apiBaseUrl + '/api/b/profile/register',
      method: 'POST',
      data: {
        nickname:      this.data.nickname,
        avatar:        this.data.avatar || undefined,
        gender:        genderMap[this.data.gender] || 0,
        age:           ageNum,
        city:          this.data.city,
        real_name:     this.data.realName,
        id_card_no:    this.data.idCard,
        id_card_front: this.data.idCardFront || undefined,
        id_card_back:  this.data.idCardBack || undefined,
        skills:        this.data.selectedSkills,
        bio:           this.data.bio || undefined,
      },
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + app.globalData.token,
      },
      success: (res) => {
        wx.hideLoading();
        if (res.data.code === 0) {
          wx.setStorageSync('isRegistered', true);
          wx.setStorageSync('auditStatus', 'pending');
          wx.navigateTo({ url: '/pages/audit-result/audit-result?status=pending' });
        } else {
          wx.showToast({ title: res.data.message || '提交失败，请重试', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  }
});
