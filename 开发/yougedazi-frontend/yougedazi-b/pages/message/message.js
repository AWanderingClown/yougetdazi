const { goBack } = require('../../utils/auth');

const SAVE_DEBOUNCE_MS = 300;

// pages/message/message.js - 消息中心
// 支持左滑删除功能
Page({
  data: {
    currentTab: 'system',
    systemUnread: 2,
    chatUnread: 0,
    
    // 系统通知（每条消息的unread字段表示是否未读：1未读，0已读）
    systemMessages: [
      {
        id: 1,
        type: 'order',
        iconType: 'order',
        title: '新订单提醒',
        content: '您有一个新的直单订单待接单，请尽快处理',
        time: '10分钟前',
        unread: 1,  // 未读
        x: 0
      },
      {
        id: 2,
        type: 'money',
        iconType: 'money',
        title: '收益到账',
        content: '您的一笔订单收益已到账，金额¥256.00',
        time: '2小时前',
        unread: 1,  // 未读
        x: 0
      },
      {
        id: 3,
        type: 'system',
        iconType: 'system',
        title: '平台公告',
        content: '平台将于今晚22:00-24:00进行系统维护',
        time: '昨天',
        unread: 0,  // 已读
        x: 0
      }
    ],
    
    // 用户消息
    chatList: [
      {
        id: 1,
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=User1',
        name: '小可爱',
        lastMessage: '好的，那我们明天见',
        time: '10:30',
        unread: 0,
        x: 0
      },
      {
        id: 2,
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=User2',
        name: '游戏达人',
        lastMessage: '请问可以早点到吗？',
        time: '昨天',
        unread: 2,
        x: 0
      }
    ],
    
    // 删除按钮宽度
    deleteBtnWidth: 160
  },

  // 滑动状态标记
  isSwiping: false,
  touchStartX: 0,
  touchStartY: 0,

  goBack() {
    goBack('/pages/workbench/workbench');
  },

  onLoad() {
    this._restoreUnreadFromStorage();
    this.calculateUnread();
  },

  onShow() {
    // 更新 TabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      });
    }
    // 计算并更新未读数徽章
    this.calculateUnread();
  },

  // 从 Storage 恢复未读状态（解决重启后未读丢失问题）
  _restoreUnreadFromStorage() {
    const systemMessages = this.data.systemMessages.map(item => {
      const saved = wx.getStorageSync(`b_sys_msg_${item.id}_unread`);
      // 只有明确存储了数字（含0）才覆盖，防止 undefined/null/'' 被误用
      const count = typeof saved === 'number' && saved >= 0 ? saved : item.unread;
      return { ...item, unread: count };
    });
    const chatList = this.data.chatList.map(item => {
      const saved = wx.getStorageSync(`b_chat_${item.id}_unread`);
      const count = typeof saved === 'number' && saved >= 0 ? saved : item.unread;
      return { ...item, unread: count };
    });
    this.setData({ systemMessages, chatList });
  },

  _saveUnreadToStorage() {
    if (this._saveUnreadTimeout) {
      clearTimeout(this._saveUnreadTimeout);
    }
    this._saveUnreadTimeout = setTimeout(() => {
      this.data.systemMessages.forEach(item => {
        wx.setStorage({ key: `b_sys_msg_${item.id}_unread`, data: item.unread });
      });
      this.data.chatList.forEach(item => {
        wx.setStorage({ key: `b_chat_${item.id}_unread`, data: item.unread });
      });
      this._saveUnreadTimeout = null;
    }, SAVE_DEBOUNCE_MS);
  },

  // 切换标签
  switchTab(e) {
    this.setData({
      currentTab: e.currentTarget.dataset.tab
    });
    // 关闭所有打开的滑动项
    this.closeAllSwipe();
  },

  onHide() {
    if (this._saveUnreadTimeout) {
      clearTimeout(this._saveUnreadTimeout);
      this._saveUnreadTimeout = null;
      // 同步 flush 待保存的未读状态
      this._flushUnreadToStorage();
    }
  },

  onUnload() {
    if (this._saveUnreadTimeout) {
      clearTimeout(this._saveUnreadTimeout);
      this._saveUnreadTimeout = null;
      // 同步 flush 待保存的未读状态
      this._flushUnreadToStorage();
    }
  },

  // 同步保存未读状态到 Storage
  _flushUnreadToStorage() {
    this.data.systemMessages.forEach(item => {
      wx.setStorageSync(`b_sys_msg_${item.id}_unread`, item.unread);
    });
    this.data.chatList.forEach(item => {
      wx.setStorageSync(`b_chat_${item.id}_unread`, item.unread);
    });
  },

  // 计算未读数
  calculateUnread() {
    // 计算系统消息未读数（每条消息unread字段的总和）
    const systemUnread = this.data.systemMessages.reduce((sum, item) => sum + (item.unread || 0), 0);
    // 计算聊天未读数
    const chatUnread = this.data.chatList.reduce((sum, item) => sum + item.unread, 0);
    
    this.setData({
      systemUnread,
      chatUnread
    });
    
    // 更新TabBar徽章
    this.updateTabBarBadge(systemUnread + chatUnread);
  },

  // 更新TabBar消息徽章
  updateTabBarBadge(totalUnread) {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setBadge(2, totalUnread > 0 ? totalUnread : 0);
    }
  },

  // ========== 左滑删除功能 ==========

  _updateListPosition(listName, id, x, resetOthers = true) {
    const list = this.data[listName].map(item => {
      if (item.id === id) {
        return { ...item, x };
      }
      return resetOthers ? { ...item, x: 0 } : item;
    });
    this.setData({ [listName]: list });
  },

  // 触摸开始
  onTouchStart(e) {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
    this.isSwiping = false;
  },

  // 触摸移动
  onTouchMove(e) {
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    
    // 计算滑动距离
    const diffX = Math.abs(this.touchStartX - currentX);
    const diffY = Math.abs(this.touchStartY - currentY);
    
    // 如果水平滑动距离大于10px，认为是滑动操作
    if (diffX > 10 && diffX > diffY) {
      this.isSwiping = true;
    }
  },

  // 滑动改变
  onChange(e) {
    const id = e.currentTarget.dataset.id;
    const type = e.currentTarget.dataset.type;
    const x = e.detail.x;
    const numId = Number(id);

    const listName = type === 'system' ? 'systemMessages' : 'chatList';
    this._updateListPosition(listName, numId, x, true);
  },

  // 滑动结束
  onTouchEnd(e) {
    const id = e.currentTarget.dataset.id;
    const type = e.currentTarget.dataset.type;
    const list = type === 'system' ? this.data.systemMessages : this.data.chatList;
    const numId = Number(id);
    const item = list.find(i => i.id === numId);

    if (!item) return;

    // 判断是否滑动超过阈值
    const threshold = this.data.deleteBtnWidth / 2;
    const newX = item.x < -threshold ? -this.data.deleteBtnWidth : 0;

    // 更新位置
    const listName = type === 'system' ? 'systemMessages' : 'chatList';
    this._updateListPosition(listName, numId, newX, false);

    // 延迟重置滑动状态，防止点击事件立即触发
    setTimeout(() => {
      this.isSwiping = false;
    }, 100);
  },

  // 关闭所有滑动项
  closeAllSwipe() {
    const systemMessages = this.data.systemMessages.map(item => ({ ...item, x: 0 }));
    const chatList = this.data.chatList.map(item => ({ ...item, x: 0 }));
    this.setData({ systemMessages, chatList });
  },

  // 删除系统消息
  deleteSystemMessage(e) {
    const id = Number(e.currentTarget.dataset.id);
    const list = this.data.systemMessages.filter(item => item.id !== id);
    wx.removeStorageSync(`b_sys_msg_${id}_unread`);
    this.setData({ systemMessages: list });
    this.calculateUnread();
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  // 删除聊天
  deleteChat(e) {
    const id = Number(e.currentTarget.dataset.id);
    const list = this.data.chatList.filter(item => item.id !== id);
    wx.removeStorageSync(`b_chat_${id}_unread`);
    this.setData({ chatList: list });
    this.calculateUnread();
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  // ========== 点击进入对话 ==========
  
  // 点击系统消息
  onSystemMessageTap(e) {
    // 如果正在滑动，不触发点击
    if (this.isSwiping) {
      return;
    }
    
    const id = Number(e.currentTarget.dataset.id);
    const item = this.data.systemMessages.find(i => i.id === id);
    
    if (!item) return;
    
    // 如果已经滑出删除按钮，先关闭滑动
    if (item.x < 0) {
      this.closeAllSwipe();
      return;
    }
    
    // 如果消息是未读状态，标记为已读
    if (item.unread > 0) {
      const list = this.data.systemMessages.map(msg => {
        if (msg.id === id) {
          return { ...msg, unread: 0 };
        }
        return msg;
      });
      wx.setStorageSync(`b_sys_msg_${id}_unread`, 0);
      this.setData({ systemMessages: list }, () => {
        this.calculateUnread();
      });
    }
    
    // 跳转到系统通知详情
    wx.navigateTo({
      url: `/pages/message-detail/message-detail?id=${id}&type=${item.type || 'system'}`
    });
  },

  // 点击聊天进入对话
  onChatTap(e) {
    // 如果正在滑动，不触发点击
    if (this.isSwiping) {
      return;
    }
    
    const id = Number(e.currentTarget.dataset.id);
    const chat = this.data.chatList.find(c => c.id === id);

    if (!chat) return;
    
    // 如果已经滑出删除按钮，先关闭滑动
    if (chat && chat.x < 0) {
      this.closeAllSwipe();
      return;
    }
    
    // 标记为已读
    const list = this.data.chatList.map(item => {
      if (item.id === id) {
        return { ...item, unread: 0 };
      }
      return item;
    });
    wx.setStorageSync(`b_chat_${id}_unread`, 0);
    this.setData({ chatList: list });
    this.calculateUnread();
    
    // 跳转到聊天页面
    wx.navigateTo({
      url: `/pages/chat/chat?id=${id}&name=${encodeURIComponent(chat.name)}&avatar=${encodeURIComponent(chat.avatar)}`
    });
  }
});
