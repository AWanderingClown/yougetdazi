// pages/dazi-detail/dazi-detail.js
const api = require('../../utils/api');
const configService = require('../../utils/config-service');
const { VALIDATE_MESSAGES } = require('../../utils/constants');

Page({
  data: {
    currentBannerIndex: 0,
    selectedService: null,
    duration: 0,
    totalAmount: 0,
    hasActiveOrder: false,  // 是否有进行中的订单
    orderStatus: '',        // 订单状态
    companionInfo: {
      id: 1,
      nickname: '张三',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
      gender: '女',
      age: 22,
      location: '厦门市',
      distance: '3.6公里',
      isOnline: true,
      signature: '喜欢逛街、唱歌，希望能给你带来愉快的陪伴时光~',
      album: [
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400',
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400'
      ],
      certifications: {
        wechat: true,
        phone: true,
        realname: true
      },
      minDuration: 3,
      services: [
        {
          id: 1,
          name: '逛街',
          price: 50,
          duration: 60,
          tags: ['购物', '美食'],
          image: 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=200'
        },
        {
          id: 2,
          name: '酒吧/K歌',
          price: 200,
          duration: 60,
          tags: ['唱歌', '喝酒'],
          image: 'https://images.unsplash.com/photo-1574096079513-d8259312b785?w=200'
        },
        {
          id: 3,
          name: '私人影院',
          price: 150,
          duration: 60,
          tags: ['看电影', '休闲'],
          image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=200'
        }
      ],
      photos: [
        { id: 1, url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200', type: 'image' },
        { id: 2, url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200', type: 'image' },
        { id: 3, url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200', type: 'video' },
        { id: 4, url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200', type: 'image' }
      ],
      moments: [
        {
          id: 1,
          content: '今天天气真好，适合出去玩~',
          time: '2小时前',
          likes: 23,
          comments: 5,
          images: ['https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200']
        }
      ]
    }
  },

  onLoad(options) {
    const id = options.id;  // ID 是字符串，不要 parseInt
    // 设置数据加载完成后的回调
    this.dataLoadedCallback = () => {
      this.sortServicesByPrice();
    };
    this.loadCompanionDetail(id);
  },

  // 按价格从高到低排序服务项目
  sortServicesByPrice() {
    const rawServices = this.data.companionInfo.services;
    if (!rawServices || rawServices.length === 0) return;
    const services = rawServices.slice();
    services.sort((a, b) => b.price - a.price);
    this.setData({
      'companionInfo.services': services
    });
  },

  // 选择服务项目
  onSelectService(e) {
    const id = e.currentTarget.dataset.id;
    const logger = require('../../utils/logger');
    logger.debug(logger.Categories.UI, '选择服务项目', id, this.data.companionInfo.services);
    const service = this.data.companionInfo.services.find(s => s.id === id);
    
    // 如果点击已选中的，则取消选中
    if (this.data.selectedService && this.data.selectedService.id === id) {
      this.setData({
        selectedService: null,
        duration: 0,
        totalAmount: 0
      });
      return;
    }
    
    // 选中新服务，默认使用最低时长
    const minDuration = this.data.companionInfo.minDuration;
    const totalAmount = service.price * minDuration;
    
    this.setData({
      selectedService: service,
      duration: minDuration,
      totalAmount: totalAmount
    });
  },

  // 减少时长
  onDecreaseDuration() {
    const minDuration = this.data.companionInfo.minDuration;
    if (this.data.duration <= minDuration) {
      wx.showToast({
        title: VALIDATE_MESSAGES.MINIMUM_DURATION(minDuration),
        icon: 'none'
      });
      return;
    }
    const newDuration = this.data.duration - 1;
    const totalAmount = this.data.selectedService.price * newDuration;
    this.setData({
      duration: newDuration,
      totalAmount: totalAmount
    });
  },

  // 增加时长
  onIncreaseDuration() {
    const newDuration = this.data.duration + 1;
    const maxDuration = configService.getMaxServiceDuration();
    if (newDuration > maxDuration) {
      wx.showToast({
        title: VALIDATE_MESSAGES.DURATION_TOO_LONG(maxDuration),
        icon: 'none'
      });
      return;
    }
    const totalAmount = this.data.selectedService.price * newDuration;
    this.setData({
      duration: newDuration,
      totalAmount: totalAmount
    });
  },

  // 阻止时长控制区域点击冒泡
  onDurationControlTap() {
    // 什么都不做，只是阻止冒泡
  },

  // 加载搭子详情
  loadCompanionDetail(id) {
    const app = getApp();
    app.request({ url: api.companions.detail(id) })
      .then(res => {
        if (!res || res.code !== 0 || !res.data) {
          wx.showToast({ title: res && res.message ? res.message : '加载失败', icon: 'none' });
          return;
        }
        const companionInfo = res.data;
        
        // 默认选中第一个服务
        let selectedService = null;
        let duration = 0;
        let totalAmount = 0;
        
        if (companionInfo.services && companionInfo.services.length > 0) {
          selectedService = companionInfo.services[0];
          duration = companionInfo.minDuration || 1;
          totalAmount = selectedService.price * duration;
        }
        
        this.setData({ 
          companionInfo: companionInfo,
          selectedService: selectedService,
          duration: duration,
          totalAmount: totalAmount
        }, () => {
          if (typeof this.dataLoadedCallback === 'function') {
            this.dataLoadedCallback();
          }
          // 检查是否有进行中的订单
          this.checkActiveOrder();
        });
      })
      .catch(() => {
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onBannerChange(e) {
    this.setData({
      currentBannerIndex: e.detail.current
    });
  },

  // 上一张图片
  onPrevImage() {
    const albumLength = this.data.companionInfo.album.length;
    let currentIndex = this.data.currentBannerIndex;
    currentIndex = currentIndex - 1;
    if (currentIndex < 0) {
      currentIndex = albumLength - 1; // 循环到最后一张
    }
    this.setData({
      currentBannerIndex: currentIndex
    });
  },

  // 下一张图片
  onNextImage() {
    const albumLength = this.data.companionInfo.album.length;
    let currentIndex = this.data.currentBannerIndex;
    currentIndex = currentIndex + 1;
    if (currentIndex >= albumLength) {
      currentIndex = 0; // 循环到第一张
    }
    this.setData({
      currentBannerIndex: currentIndex
    });
  },

  previewBannerImage(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      current: this.data.companionInfo.album[index],
      urls: this.data.companionInfo.album
    });
  },

  previewAlbumImage(e) {
    const index = e.currentTarget.dataset.index;
    const urls = this.data.companionInfo.photos.map(p => p.url);
    wx.previewImage({
      current: urls[index],
      urls: urls
    });
  },

  onChatTap() {
    // 检查是否有已支付的订单（未付款禁止联系搭子）
    if (!this.data.hasActiveOrder) {
      wx.showModal({
        title: '提示',
        content: '请先完成订单支付后才能联系搭子',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }
    
    // 如果订单已完成，提示不能联系
    if (this.data.orderStatus === 'completed') {
      wx.showModal({
        title: '提示',
        content: '该订单服务已完成，如需再次联系请重新下单',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }
    
    // 已支付或服务中，跳转到聊天页面
    wx.navigateTo({
      url: `/pages/chat/chat?companionId=${this.data.companionInfo.id}&nickname=${encodeURIComponent(this.data.companionInfo.nickname)}&avatar=${encodeURIComponent(this.data.companionInfo.avatar)}`
    });
  },

  // 检查是否有进行中的订单
  checkActiveOrder() {
    const app = getApp();
    // 调用后端接口检查当前用户与该搭子是否有进行中的订单
    // 包括 paid(已支付), serving(服务中), completed(已完成) 状态
    app.request({
      url: `${api.orders.list()}?companion_id=${this.data.companionInfo.id}&status=paid,serving,completed`,
      method: 'GET'
    }).then(res => {
      const orders = res.data && res.data.list ? res.data.list : [];
      const hasActiveOrder = orders.length > 0;
      const orderStatus = hasActiveOrder ? orders[0].status : '';
      this.setData({
        hasActiveOrder: hasActiveOrder,
        orderStatus: orderStatus
      });
    }).catch(() => {
      // 接口失败时，默认不允许联系
      this.setData({
        hasActiveOrder: false,
        orderStatus: ''
      });
    });
  },

  onOrderTap() {
    // onOrderTap called
    const logger = require('../../utils/logger');
    
    // 检查是否选择了服务项目
    if (!this.data.selectedService) {
      logger.debug(logger.Categories.UI, 'no selectedService');
      wx.showToast({
        title: '请先选择服务项目',
        icon: 'none'
      });
      return;
    }
    
    logger.debug(logger.Categories.UI, 'selectedService:', this.data.selectedService);
    
    // 构建下单参数（不传 totalAmount，后端按 service.hourly_price × duration 权威计算）
    const params = {
      companionId: this.data.companionInfo.id,
      serviceId: this.data.selectedService.id,
      serviceType: this.data.selectedService.name,
      price: this.data.selectedService.price,
      duration: this.data.duration,
      icon: this.data.selectedService.icon || '',
    };
    
    const queryString = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');
    
    const url = '/pages/order-create/order-create?' + queryString;
    logger.debug(logger.Categories.UI, 'navigating to:', url);
    
    // 跳转到下单页
    wx.navigateTo({
      url: url,
      success: () => {
        logger.debug(logger.Categories.UI, 'navigate success');
      },
      fail: (err) => {
        logger.error(logger.Categories.UI, '页面跳转失败', err);
        wx.showToast({ title: '跳转失败:' + err.errMsg, icon: 'none' });
      }
    });
  },

  // 分享给朋友
  onShareAppMessage() {
    const companion = this.data.companionInfo;
    return {
      title: `推荐给你：${companion.nickname} - ${companion.gender === '女' ? '女' : '男'}${companion.age}岁，${companion.location}`,
      path: `/pages/dazi-detail/dazi-detail?id=${companion.id}`,
      imageUrl: companion.avatar
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const companion = this.data.companionInfo;
    return {
      title: `推荐给你：${companion.nickname} - ${companion.gender === '女' ? '女' : '男'}${companion.age}岁`,
      query: `id=${companion.id}`,
      imageUrl: companion.avatar
    };
  },

  // 推荐给朋友按钮点击
  onShareTap() {
    wx.showToast({
      title: '点击右上角分享给朋友',
      icon: 'none'
    });
  }
});
