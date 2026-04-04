// 自定义 TabBar - B端搭子版（修改后：移除任务广场入口）
Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "/pages/workbench/workbench",
        text: "工作台",
        iconPath: "/assets/icons/workbench.png",
        selectedIconPath: "/assets/icons/workbench-active.png"
      },
      {
        pagePath: "/pages/b-order-list/b-order-list",
        text: "订单",
        iconPath: "/assets/icons/order.png",
        selectedIconPath: "/assets/icons/order-active.png"
      },
      {
        pagePath: "/pages/message/message",
        text: "消息",
        iconPath: "/assets/icons/message.png",
        selectedIconPath: "/assets/icons/message-active.png",
        badge: 0
      },
      {
        pagePath: "/pages/profile/profile",
        text: "我的",
        iconPath: "/assets/icons/profile.png",
        selectedIconPath: "/assets/icons/profile-active.png"
      }
    ]
  },

  methods: {
    // 切换 Tab
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      
      // 更新选中状态
      this.setData({
        selected: index
      });
      
      // 跳转页面
      wx.switchTab({
        url: path
      });
    },
    
    // 更新徽章（供页面调用）
    setBadge(index, count) {
      const list = this.data.list;
      list[index].badge = count;
      this.setData({ list });
    }
  }
});
