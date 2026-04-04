const app = getApp();

Page({
  data: {
    type: '',       // user=用户协议, privacy=隐私政策
    content: '',    // rich-text 内容（HTML）
    updateTime: '',
    loading: true
  },

  onLoad(options) {
    const type = options.type || 'user';
    const title = type === 'privacy' ? '隐私政策' : '用户协议';

    wx.setNavigationBarTitle({ title });
    this.setData({ type });
    this.loadContent();
  },

  loadContent() {
    this.setData({ loading: true, content: '' });

    const apiUrl = type => `${app.globalData.apiBaseUrl || ''}/api/agreement/${type}`;

    // 从后台接口获取协议内容
    wx.request({
      url: apiUrl(this.data.type),
      method: 'GET',
      success: (res) => {
        if (res.data && res.data.code === 200) {
          this.setData({
            content: res.data.data.content || '',
            updateTime: res.data.data.updateTime || '',
            loading: false
          });
        } else {
          // 接口返回异常，使用占位内容
          this.loadPlaceholder();
        }
      },
      fail: () => {
        // 请求失败，使用占位内容（开发阶段）
        this.loadPlaceholder();
      }
    });
  },

  // 开发阶段占位内容
  loadPlaceholder() {
    const placeholders = {
      user: '<h3>有个搭子 用户服务协议</h3><p>欢迎使用 有个搭子 平台服务。</p><p>本协议内容将在正式上线前由管理后台上传更新，当前为占位内容。</p><p>请通过管理后台「内容管理」模块上传正式协议文本。</p>',
      privacy: '<h3>有个搭子 隐私政策</h3><p>我们非常重视您的个人信息和隐私保护。</p><p>本政策内容将在正式上线前由管理后台上传更新，当前为占位内容。</p><p>请通过管理后台「内容管理」模块上传正式隐私政策。</p>'
    };

    this.setData({
      content: placeholders[this.data.type] || placeholders.user,
      updateTime: '待后台上传',
      loading: false
    });
  }
});
