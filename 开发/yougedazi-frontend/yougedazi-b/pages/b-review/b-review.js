// pages/b-review/b-review.js - 评价用户
Page({
  data: {
    orderId: '',
    user: {
      name: '用户',
      avatar: '',
      serviceName: ''
    },
    rating: 0,
    ratingText: '点击星星评分',
    ratingTexts: ['', '非常差', '差', '一般', '好', '非常好'],
    dimensions: [
      { name: '用户态度', score: 0 },
      { name: '守时程度', score: 0 },
      { name: '配合度', score: 0 }
    ],
    tags: [
      { name: '态度友好', selected: false },
      { name: '守时', selected: false },
      { name: '配合度高', selected: false },
      { name: '有礼貌', selected: false },
      { name: '爽快', selected: false },
      { name: '要求明确', selected: false },
      { name: '沟通顺畅', selected: false },
      { name: '期望合理', selected: false },
      { name: '不催促', selected: false },
      { name: '下单果断', selected: false }
    ],
    comment: '',
    isAnonymous: false,
    canSubmit: false
  },

  onLoad(options) {
    const { orderId, customerName, customerAvatar, service } = options;
    this.setData({
      orderId: orderId || '',
      'user.name': customerName ? decodeURIComponent(customerName) : '用户',
      'user.avatar': customerAvatar ? decodeURIComponent(customerAvatar) : '',
      'user.serviceName': service ? decodeURIComponent(service) : ''
    });
  },

  goBack() {
    wx.navigateBack();
  },

  updateCanSubmit() {
    const { rating, dimensions } = this.data;
    this.setData({
      canSubmit: rating > 0 && dimensions.every(item => item.score > 0)
    });
  },

  // 总体评分
  onRatingChange(e) {
    const rating = parseInt(e.currentTarget.dataset.index);
    this.setData({
      rating,
      ratingText: this.data.ratingTexts[rating]
    }, () => this.updateCanSubmit());
  },

  // 维度评分
  onDimensionRating(e) {
    const { dim, score } = e.currentTarget.dataset;
    const dimensions = this.data.dimensions.map(item => {
      if (item.name === dim) {
        return { ...item, score: parseInt(score) };
      }
      return item;
    });
    this.setData({ dimensions }, () => this.updateCanSubmit());
  },

  // 选择标签
  onTagSelect(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      [`tags[${index}].selected`]: !this.data.tags[index].selected
    });
  },

  // 输入评价
  onCommentInput(e) {
    this.setData({
      comment: e.detail.value
    });
  },

  // 匿名切换
  onAnonymousChange(e) {
    this.setData({
      isAnonymous: e.detail.value
    });
  },

  // 提交评价
  submitReview() {
    const { rating, dimensions } = this.data;
    
    // 验证
    if (rating === 0) {
      wx.showToast({
        title: '请给出总体评分',
        icon: 'none'
      });
      return;
    }

    // 检查维度评分
    const hasZeroScore = dimensions.some(item => item.score === 0);
    if (hasZeroScore) {
      wx.showToast({
        title: '请完成所有维度评分',
        icon: 'none'
      });
      return;
    }

    const selectedTags = this.data.tags.filter(item => item.selected).map(item => item.name);

    // 提交数据
    const reviewData = {
      orderId: this.data.orderId,
      rating,
      dimensions,
      tags: selectedTags,
      comment: this.data.comment,
      isAnonymous: this.data.isAnonymous,
      createdAt: new Date().toISOString()
    };

    wx.showLoading({ title: '提交中...' });

    setTimeout(() => {
      // 保存评价记录到 localStorage
      const companionReviews = wx.getStorageSync('companion_reviews') || [];
      companionReviews.push(reviewData);
      wx.setStorageSync('companion_reviews', companionReviews);

      // 标记该订单已评价（b-order-detail 返回时用于隐藏"去评价"按钮）
      const bReviewedOrders = wx.getStorageSync('b_reviewed_orders') || [];
      if (!bReviewedOrders.includes(this.data.orderId)) {
        bReviewedOrders.push(this.data.orderId);
        wx.setStorageSync('b_reviewed_orders', bReviewedOrders);
      }

      wx.hideLoading();
      wx.showToast({ title: '评价成功', icon: 'success', duration: 1500 });

      setTimeout(() => {
        wx.switchTab({ url: '/pages/workbench/workbench' });
      }, 1500);
    }, 1000);
  },

  // 跳过评价
  skipReview() {
    wx.showModal({
      title: '跳过评价',
      content: '跳过评价将无法获得评价奖励，确定跳过吗？',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({
            url: '/pages/workbench/workbench'
          });
        }
      }
    });
  },

});
