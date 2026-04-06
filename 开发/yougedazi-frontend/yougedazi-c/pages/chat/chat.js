// pages/chat/chat.js
const { MESSAGE_STATUS } = require('../../utils/constants');
const api = require('../../utils/api');
const configService = require('../../utils/config-service');

Page({
  data: {
    // 当前用户信息
    userInfo: {
      id: 'user_001',
      nickname: '我',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200'
    },
    
    // 搭子信息
    companionInfo: {
      id: '',
      nickname: '',
      avatar: '',
      isOnline: true
    },
    
    // 订单ID
    id: '',
    
    // 消息列表
    messageList: [],
    
    // 历史消息加载控制
    historyLoadedCount: 0,  // 已加载的历史消息条数
    maxHistoryCount: 100,   // 最多加载100条
    
    // 输入内容
    inputValue: '',
    
    // 最后一条消息ID（用于滚动）
    lastMessageId: '',
    
    // 当前时间
    currentTime: '',
    
    // 导航栏高度
    navBarHeight: 88,
    statusBarHeight: 20
  },

  onLoad(options) {
    // 计算导航栏高度
    this.calcNavBarHeight();
    const { companionId, nickname, avatar, id } = options;
    
    // 设置搭子信息（avatar 可能经过 encodeURIComponent，需 decode）
    this.setData({
      'companionInfo.id': companionId,
      'companionInfo.nickname': nickname ? decodeURIComponent(nickname) : '搭子',
      'companionInfo.avatar': avatar ? decodeURIComponent(avatar) : '/assets/images/avatar-default.png',
      id: id || ''
    });
    
    // 设置页面标题
    wx.setNavigationBarTitle({
      title: nickname || '聊天'
    });
    
    // 初始化时间
    this.updateTime();
    
    // 加载历史消息
    this.loadHistoryMessages();
    
    // 订阅全局消息推送（如果存在 socket），实现简单的本页消息接收
    try {
      const app = getApp();
      if (app && app.globalData && app.globalData.socket && app.globalData.socket.on) {
        // 保存监听器引用，用于精确移除
        this._messageHandler = (payload) => {
          // 简单判断是否为当前会话
          if (payload && payload.companionId === this.data.companionInfo.id) {
            this.receiveMessage(payload.content || '新消息');
          }
        };
        app.globalData.socket.on('message:new', this._messageHandler);
      }
    } catch (e) {
      // 忽略监听异常
    }
    // 模拟接收一条欢迎消息
    this._welcomeTimer = setTimeout(() => {
      this.receiveMessage('您好，我是您的专属搭子，很高兴为您服务！');
    }, 1000);
  },

  onShow() {
    // 页面显示时更新状态
    this.updateTime();
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

  // 更新时间
  updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    this.setData({
      currentTime: `${hours}:${minutes}`
    });
  },

  // 安全解析时间戳
  safeParseTime(timeStr) {
    if (!timeStr) return null;
    const time = new Date(timeStr).getTime();
    return isNaN(time) ? null : time;
  },

  // 过滤超过N天的消息（使用常量控制范围）
  filterExpiredMessages(messages) {
    const now = Date.now();
    const rangeMs = configService.getAppointmentRangeMs();
    return messages.filter(msg => {
      // 如果消息有时间戳，检查是否在范围内
      const timeStr = msg.timestamp || msg.created_at || msg.time;
      if (timeStr) {
        const msgTime = this.safeParseTime(timeStr);
        // 解析失败的消息默认不过滤（保留）
        if (!msgTime) return true;
        return (now - msgTime) < rangeMs;
      }
      // 没有时间戳的消息默认保留
      return true;
    });
  },

  // 加载历史消息
  loadHistoryMessages() {
    // 检查是否已达到最大加载数量
    if (this.data.historyLoadedCount >= this.data.maxHistoryCount) {
      return;
    }
    
    const companionId = this.data.companionInfo.id;
    const limit = Math.min(this.data.historyPageSize || 20, this.data.maxHistoryCount - this.data.historyLoadedCount);
    const cursor = this.data.historyCursor || '';
    const app = getApp();
    if (companionId && app && typeof app.request === 'function') {
      app.request({ url: api.messages.history(companionId), method: 'GET', data: { cursor, limit } }).then(res => {
        const data = res && (res.data || res);
        let list = (data && (data.list || data.data?.list)) || [];
        // 过滤超过7天的消息
        list = this.filterExpiredMessages(list);
        if (list.length) {
          const merged = this.data.messageList.length ? [...this.data.messageList, ...list] : list;
          const nextCursor = data.next_cursor != null ? data.next_cursor : (list.length ? list[list.length - 1].id : '');
          const newLoadedCount = this.data.historyLoadedCount + list.length;
          this.setData({ 
            messageList: merged, 
            lastMessageId: list[list.length - 1]?.id || this.data.lastMessageId, 
            historyCursor: nextCursor,
            historyLoadedCount: newLoadedCount
          });
        } else {
          this.setData({ historyCursor: null });
        }
      }).catch(() => {
        const historyMessages = [
          { id: 'msg_1', type: 'receive', senderId: this.data.companionInfo.id, content: '订单已确认，我会准时到达约定地点', time: '10:30', status: MESSAGE_STATUS.SENT },
          { id: 'msg_2', type: 'send', senderId: this.data.userInfo.id, content: '好的，到时候见', time: '10:32', status: MESSAGE_STATUS.SENT }
        ];
        this.setData({ messageList: historyMessages, lastMessageId: historyMessages[historyMessages.length - 1].id, historyCursor: null, historyLoadedCount: historyMessages.length });
      });
    } else {
      const historyMessages = [
        { id: 'msg_1', type: 'receive', senderId: this.data.companionInfo.id, content: '订单已确认，我会准时到达约定地点', time: '10:30', status: MESSAGE_STATUS.SENT },
        { id: 'msg_2', type: 'send', senderId: this.data.userInfo.id, content: '好的，到时候见', time: '10:32', status: MESSAGE_STATUS.SENT }
      ];
      this.setData({ messageList: historyMessages, lastMessageId: historyMessages[historyMessages.length - 1].id, historyCursor: null, historyLoadedCount: historyMessages.length });
    }
  },

  // 输入框内容变化
  onInput(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  // 发送消息
  sendMessage(retryCount = 0) {
    // 限制单条消息长度为200字
    const content = this.data.inputValue.trim();
    if (content.length > 200) {
      wx.showToast({ title: '消息最多200字', icon: 'none' });
      return;
    }
    if (!content) return;
    
    // 生成消息ID
    const messageId = 'msg_' + Date.now();
    
    // 添加自己的消息
    const newMessage = {
      id: messageId,
      type: 'send',
      senderId: this.data.userInfo.id,
      content: content,
      time: this.getCurrentTime(),
      status: MESSAGE_STATUS.SENDING,
      retryCount: retryCount // 记录重试次数
    };
    
    const messageList = [...this.data.messageList, newMessage];
    this.setData({
      messageList,
      inputValue: '',
      lastMessageId: newMessage.id
    });

    // 调用API发送消息
    this.doSendMessage(newMessage, content, retryCount);
  },

  // 实际发送消息（支持重试）
  doSendMessage(message, content, retryCount = 0) {
    const app = getApp();
    const MAX_RETRY = 3; // 最大重试次数
    
    app.request({
      url: api.messages.send(),
      method: 'POST',
      data: {
        companion_id: this.data.companionInfo.id,
        content: content,
        msg_type: 'text'
      }
    }).then(res => {
      // 发送成功
      this.updateMessageStatus(message.id, MESSAGE_STATUS.SENT);
    }).catch(err => {
      const logger = require('../../utils/logger');
      logger.error(logger.Categories.NETWORK, '消息发送失败', err);
      
      if (retryCount < MAX_RETRY) {
        // 自动重试
        this.updateMessageStatus(message.id, MESSAGE_STATUS.SENDING, retryCount + 1);
        setTimeout(() => {
          this.doSendMessage(message, content, retryCount + 1);
        }, 1000 * (retryCount + 1)); // 指数退避：1s, 2s, 3s
      } else {
        // 重试次数用尽，标记为失败
        this.updateMessageStatus(message.id, MESSAGE_STATUS.FAILED);
        wx.showToast({
          title: '消息发送失败，点击重试',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  // 更新消息状态
  updateMessageStatus(messageId, status, retryCount = null) {
    const list = this.data.messageList.map(msg => {
      if (msg.id === messageId) {
        const updated = { ...msg, status };
        if (retryCount !== null) {
          updated.retryCount = retryCount;
        }
        return updated;
      }
      return msg;
    });
    this.setData({ messageList: list });
  },

  // 重发失败的消息
  onResendMessage(e) {
    const messageId = e.currentTarget.dataset.id;
    const message = this.data.messageList.find(m => m.id === messageId);
    if (message && message.status === MESSAGE_STATUS.FAILED) {
      this.updateMessageStatus(messageId, MESSAGE_STATUS.SENDING);
      this.doSendMessage(message, message.content, 0);
    }
  },

  // 发送图片消息（简单实现，需在界面上提供触发入口）
  async sendImage() {
    const app = getApp();
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res) => {
        const filePaths = res.tempFilePaths || [];
        const tempFiles = res.tempFiles || [];
        if (!filePaths.length) return;
        // 5MB size check (前端冗余控制)
        const tooBig = tempFiles.find(f => (f.size || 0) > 5 * 1024 * 1024);
        if (tooBig) {
          wx.showToast({ title: '图片大小不能超过5MB', icon: 'none' });
          return;
        }
        const src = filePaths[0];
        const newMessage = {
          id: 'img_' + Date.now(),
          type: 'send',
          senderId: this.data.userInfo.id,
          content: '',
          image: src,
          time: this.getCurrentTime(),
          status: MESSAGE_STATUS.SENDING
        };
        const list = [...this.data.messageList, newMessage];
        this.setData({ messageList: list, lastMessageId: newMessage.id });
        // 简单模拟发送完成
        setTimeout(() => {
          const updated = this.data.messageList.map(m => m.id === newMessage.id ? { ...m, status: MESSAGE_STATUS.SENT } : m);
          this.setData({ messageList: updated });
        }, 500);
      }
    });
  },

  // 接收消息
  receiveMessage(content) {
    const newMessage = {
      id: 'msg_' + Date.now(),
      type: 'receive',
      senderId: this.data.companionInfo.id,
      content: content,
      time: this.getCurrentTime(),
      status: MESSAGE_STATUS.SENT
    };
    
    const messageList = [...this.data.messageList, newMessage];
    this.setData({
      messageList,
      lastMessageId: newMessage.id
    });
  },

  // 模拟回复
  simulateReply() {
    const replies = [
      '收到，我会准时到的',
      '好的，我已经出发了',
      '大概还有10分钟到',
      '马上就到，请稍等'
    ];
    const randomReply = replies[Math.floor(Math.random() * replies.length)];
    this.receiveMessage(randomReply);
  },

  // 获取当前时间
  getCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  onUnload() {
    if (this._welcomeTimer) {
      clearTimeout(this._welcomeTimer);
      this._welcomeTimer = null;
    }
    // 清理 Socket 监听，使用具名函数引用精确移除，避免影响其他页面
    try {
      const app = getApp();
      if (app && app.globalData && app.globalData.socket && app.globalData.socket.off && this._messageHandler) {
        app.globalData.socket.off('message:new', this._messageHandler);
        this._messageHandler = null;
      }
    } catch (e) {
      // 忽略清理异常
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 显示更多选项
  showMore() {
    wx.showActionSheet({
      itemList: ['查看订单', '拨打电话', '投诉'],
      success: (res) => {
        switch(res.tapIndex) {
          case 0:
            if (!this.data.id) {
              wx.showToast({ title: '暂无关联订单', icon: 'none' });
            } else {
              wx.navigateTo({
                url: `/pages/order-detail/order-detail?id=${this.data.id}`
              });
            }
            break;
          case 1:
            const config = require('../../config/backend-config.js');
            wx.makePhoneCall({
              phoneNumber: config.customerService.phone
            });
            break;
          case 2:
            wx.showToast({
              title: '投诉功能开发中',
              icon: 'none'
            });
            break;
        }
      }
    });
  }
});
