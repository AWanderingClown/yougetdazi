Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "/pages/index/index",
        text: "首页",
        icon: "/assets/icons/tabbar/首页-未选中.png",
        selectedIcon: "/assets/icons/tabbar/首页-选中.png"
      },
      {
        pagePath: "/pages/order-list/order-list",
        text: "订单",
        icon: "/assets/icons/tabbar/订单-未选中.png",
        selectedIcon: "/assets/icons/tabbar/订单-选中.png"
      },
      {
        pagePath: "/pages/publish/publish",
        text: "悬赏任务",
        icon: "/assets/icons/tabbar/发布任务-未选中.png",
        selectedIcon: "/assets/icons/tabbar/发布任务-选中.png"
      },
      {
        pagePath: "/pages/message/message",
        text: "消息",
        icon: "/assets/icons/tabbar/消息-未选中.png",
        selectedIcon: "/assets/icons/tabbar/消息-选中.png"
      },
      {
        pagePath: "/pages/profile/profile",
        text: "我的",
        icon: "/assets/icons/tabbar/我的-未选中.png",
        selectedIcon: "/assets/icons/tabbar/我的-选中.png"
      }
    ]
  },

  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      
      // 悬赏任务按钮特殊处理 - 直接跳转而不是switchTab
      if (index === 2) {
        wx.navigateTo({
          url: '/pages/order-create-reward/order-create-reward'
        });
        return;
      }
      
      wx.switchTab({
        url: path
      });
    }
  }
});
