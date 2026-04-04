// pages/webview/webview.js - 网页浏览（用于PDF预览）
Page({
  data: {
    url: '',
    title: ''
  },

  onLoad(options) {
    const { url, title } = options;
    
    if (!url) {
      wx.showToast({
        title: '链接不存在',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }
    
    this.setData({
      url: decodeURIComponent(url),
      title: title ? decodeURIComponent(title) : '浏览'
    });
    
    // 设置导航栏标题
    if (this.data.title) {
      wx.setNavigationBarTitle({
        title: this.data.title
      });
    }
  },

  // 页面加载完成
  onLoadComplete(e) {
    console.log('web-view加载完成', e);
  },

  // 页面加载错误
  onLoadError(e) {
    console.error('web-view加载错误', e);
    wx.showModal({
      title: '加载失败',
      content: '页面加载失败，是否返回？',
      showCancel: false,
      success: () => {
        wx.navigateBack();
      }
    });
  },

  // 分享
  onShareAppMessage() {
    return {
      title: this.data.title,
      path: `/pages/webview/webview?url=${encodeURIComponent(this.data.url)}&title=${encodeURIComponent(this.data.title)}`
    };
  }
});
