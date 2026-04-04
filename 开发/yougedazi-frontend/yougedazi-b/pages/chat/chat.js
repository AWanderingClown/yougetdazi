// pages/chat/chat.js - B端搭子聊天页面
const { MESSAGE_STATUS } = require('../../utils/constants');

Page({
  data: {
    // 当前搭子信息
    userInfo: {
      id: 'companion_001',
      nickname: '我',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200'
    },
    
    // 用户信息（聊天对象）
    customerInfo: {
      id: '',
      name: '',
      avatar: '',
      isOnline: true
    },
    
    // 消息列表
    messageList: [],
    
    // 输入内容
    inputValue: '',
    
    // 最后一条消息ID（用于滚动）
    lastMessageId: '',
    
    // 滚动位置
    scrollTop: 0
  },

  onLoad(options) {
    const { id, name, avatar } = options;
    
    // 保存聊天对象ID，用于后续消息通信
    this.chatId = id;
    
    // 设置用户信息
    this.setData({
      'customerInfo.id': id || '',
      'customerInfo.name': name ? decodeURIComponent(name) : '用户',
      'customerInfo.avatar': avatar ? decodeURIComponent(avatar) : '/assets/icons/default-avatar.png'
    });
    
    // 设置页面标题
    wx.setNavigationBarTitle({
      title: name ? decodeURIComponent(name) : '聊天'
    });
    
    // 加载历史消息
    this.loadHistoryMessages();
    
    // 模拟接收一条欢迎消息
    this._welcomeTimer = setTimeout(() => {
      this.receiveMessage('您好，我想咨询一下订单相关的问题');
    }, 1000);
  },

  onShow() {
    // 页面显示时滚动到底部
    this.scrollToBottom();
  },

  // 加载历史消息
  loadHistoryMessages() {
    // 模拟历史消息
    const historyMessages = [
      {
        id: 'msg_001',
        type: 'system',
        content: '会话已开始',
        time: '10:00'
      }
    ];
    
    this.setData({
      messageList: historyMessages
    }, () => {
      this.scrollToBottom();
    });
  },

  // 输入框内容变化
  onInput(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  // 发送消息
  sendMessage() {
    const content = this.data.inputValue.trim();
    if (!content) return;
    
    // 添加消息到列表
    const newMessage = {
      id: 'msg_' + Date.now(),
      type: 'send',
      senderId: this.data.userInfo.id,
      content: content,
      time: this.formatTime(new Date()),
      status: MESSAGE_STATUS.SENDING
    };
    
    const messageList = [...this.data.messageList, newMessage];
    this.setData({
      messageList: messageList,
      inputValue: '',
      lastMessageId: newMessage.id
    }, () => {
      this.scrollToBottom();
    });
    
    // 模拟发送成功
    setTimeout(() => {
      const list = this.data.messageList.map(msg => {
        if (msg.id === newMessage.id) {
          return { ...msg, status: MESSAGE_STATUS.SENT };
        }
        return msg;
      });
      this.setData({ messageList: list });
    }, 500);
  },

  // 接收消息
  receiveMessage(content) {
    const newMessage = {
      id: 'msg_' + Date.now(),
      type: 'receive',
      senderId: this.data.customerInfo.id,
      content: content,
      time: this.formatTime(new Date()),
      status: MESSAGE_STATUS.SENT,
      avatar: this.data.customerInfo.avatar
    };
    
    const messageList = [...this.data.messageList, newMessage];
    this.setData({
      messageList: messageList,
      lastMessageId: newMessage.id
    }, () => {
      this.scrollToBottom();
    });
  },

  // 滚动到底部（通过 scroll-into-view 驱动，直接更新 lastMessageId 即可）
  scrollToBottom() {
    const list = this.data.messageList;
    if (list.length > 0) {
      this.setData({ lastMessageId: list[list.length - 1].id });
    }
  },

  onUnload() {
    if (this._welcomeTimer) {
      clearTimeout(this._welcomeTimer);
      this._welcomeTimer = null;
    }
  },

  // 格式化时间
  formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  goBack() {
    wx.navigateBack();
  }
});
