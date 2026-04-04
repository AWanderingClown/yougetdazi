// pages/message/system-notice/system-notice.js
Page({
  data: {
    // 导航栏高度
    navBarHeight: 88,
    statusBarHeight: 20,
    
    noticeList: [
      {
        id: 1,
        title: '欢迎来到有个搭子',
        content: '感谢您使用有个搭子，发现有趣的陪伴！您可以通过首页浏览搭子，或直接发布悬赏任务。',
        time: '今天 10:30',
        isRead: false
      },
      {
        id: 2,
        title: '新功能上线',
        content: '悬赏任务功能已上线！您现在可以发布自定义需求，等待搭子抢单。',
        time: '昨天 14:20',
        isRead: true
      },
      {
        id: 3,
        title: '订单完成提醒',
        content: '您的订单已完成，快去给搭子评价吧！',
        time: '03-12 18:30',
        isRead: true
      }
    ]
  },

  onLoad() {
    // 计算导航栏高度
    this.calcNavBarHeight();
    // 页面加载时标记所有系统通知为已读
    this.markAllAsRead();
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

  // 点击通知
  onNoticeTap(e) {
    const id = e.currentTarget.dataset.id;
    const notice = this.data.noticeList.find(item => item.id === id);
    
    if (notice && !notice.isRead) {
      // 标记为已读
      const list = this.data.noticeList.map(item => {
        if (item.id === id) {
          return { ...item, isRead: true };
        }
        return item;
      });
      this.setData({ noticeList: list });
      
      // 同步更新消息页面的系统通知状态
      const pages = getCurrentPages();
      const messagePage = pages.find(p => p.route === 'pages/message/message');
      if (messagePage) {
        messagePage.markSystemNoticeRead();
      }
    }
  },

  // 标记所有为已读
  markAllAsRead() {
    const list = this.data.noticeList.map(item => ({
      ...item,
      isRead: true
    }));
    this.setData({ noticeList: list });
    
    // 同步更新消息页面
    const pages = getCurrentPages();
    const messagePage = pages.find(p => p.route === 'pages/message/message');
    if (messagePage) {
      messagePage.markSystemNoticeRead();
    }
  }
});
