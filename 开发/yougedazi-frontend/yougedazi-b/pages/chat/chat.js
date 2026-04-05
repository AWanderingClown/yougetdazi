// pages/chat/chat.js - B端搭子聊天页面（极简版）
const { MESSAGE_STATUS, MESSAGE_TYPE } = require('../../utils/constants');
const { generateTempId, needTimeSeparator } = require('../../utils/date-helpers');
const app = getApp();

// 错误消息常量
const ERROR_MESSAGES = {
  PARAM_ERROR: '参数错误',
  SEND_FAILED: '发送失败',
  NETWORK_ERROR: '网络错误，请重试',
  UPLOAD_FAILED: '上传失败',
  IMAGE_UPLOAD_FAILED: '图片上传失败',
  RESELECT_IMAGE: '请重新选择图片',
  LOCATION_CANCELLED: '位置选择已取消'
};

// 导航超时时间（毫秒）
const NAVIGATE_TIMEOUT = 1500;
// 历史消息加载数量
const HISTORY_LIMIT = 50;

Page({
  data: {
    customerInfo: {
      id: '',
      name: '',
      avatar: ''
    },
    messages: [],
    inputValue: '',
    scrollToMessage: '',
    uploadingImage: false,
    imageUrls: []
  },

  _receivedIds: null,
  _messageIndexMap: null,
  _navigateTimeout: null,
  _messageHandler: null,

  onLoad(options) {
    const { id, name, avatar } = options;

    if (!id) {
      wx.showToast({ title: ERROR_MESSAGES.PARAM_ERROR, icon: 'none' });
      this._navigateTimeout = setTimeout(() => wx.navigateBack(), NAVIGATE_TIMEOUT);
      return;
    }

    this.chatId = id;

    this.setData({
      'customerInfo.id': id,
      'customerInfo.name': name ? decodeURIComponent(name) : '用户',
      'customerInfo.avatar': avatar ? decodeURIComponent(avatar) : '/assets/icons/default-avatar.png'
    });

    wx.setNavigationBarTitle({
      title: name ? decodeURIComponent(name) : '聊天'
    });

    this._receivedIds = new Set();
    this._messageIndexMap = new Map();

    this.loadHistoryMessages();
    this._bindMessageListener();
  },

  onShow() {
    this.scrollToBottom();
  },

  onUnload() {
    if (this._messageHandler && app.globalEvent) {
      app.globalEvent.off('message:new', this._messageHandler);
    }
    this._messageHandler = null;

    if (this._navigateTimeout) {
      clearTimeout(this._navigateTimeout);
      this._navigateTimeout = null;
    }

    this._receivedIds = null;
    this._messageIndexMap = null;
  },

  loadHistoryMessages() {
    app.request({
      url: '/api/chat/history',
      data: { userId: this.chatId, limit: HISTORY_LIMIT }
    }).then((res) => {
      if (res.code === 0 && res.data) {
        const list = res.data.list || [];
        const messages = this._processMessageList(list);
        this._updateMessageIndexMap(messages);
        this._updateImageUrls(messages);
        this.setData({ messages }, () => {
          this.scrollToBottom();
        });
      }
    }).catch(() => {
      this.setData({ messages: [] });
    });
  },

  _processMessageList(list) {
    let lastTime = 0;
    return list.map((item) => {
      const itemTime = item.createdAt || item.time || Date.now();
      const msg = {
        id: item.id || generateTempId(),
        type: item.type || MESSAGE_TYPE.TEXT,
        content: item.content,
        time: itemTime,
        status: MESSAGE_STATUS.SENT,
        serverId: item.id,
        showTime: needTimeSeparator(lastTime, itemTime)
      };
      lastTime = itemTime;
      if (item.id) {
        this._receivedIds.add(item.id);
      }
      return msg;
    });
  },

  _updateMessageIndexMap(messages) {
    this._messageIndexMap.clear();
    messages.forEach((msg, index) => {
      this._messageIndexMap.set(msg.id, index);
    });
  },

  _updateImageUrls(messages) {
    const imageUrls = messages
      .filter((m) => m.type === MESSAGE_TYPE.IMAGE)
      .map((m) => m.content);
    this.setData({ imageUrls });
  },

  _getLastMessageTime() {
    const lastMsg = this.data.messages[this.data.messages.length - 1];
    return lastMsg?.time;
  },

  _buildMessage(type, content) {
    const tempId = generateTempId();
    const now = Date.now();
    const lastMsgTime = this._getLastMessageTime();

    return {
      id: tempId,
      type,
      content,
      time: now,
      status: MESSAGE_STATUS.SENDING,
      showTime: needTimeSeparator(lastMsgTime, now)
    };
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  sendTextMessage() {
    const content = this.data.inputValue.trim();
    if (!content) return;

    const newMessage = this._buildMessage(MESSAGE_TYPE.TEXT, content);
    const messages = [...this.data.messages, newMessage];
    this._updateMessageIndexMap(messages);

    this.setData({
      messages,
      scrollToMessage: newMessage.id
    });

    app.request({
      url: '/api/chat/send',
      method: 'POST',
      data: {
        toId: this.chatId,
        type: MESSAGE_TYPE.TEXT,
        content: content
      }
    }).then((res) => {
      if (res.code === 0 && res.data) {
        this._updateMessage(newMessage.id, { status: MESSAGE_STATUS.SENT, serverId: res.data.id });
        this.setData({ inputValue: '' });
      } else {
        this._updateMessage(newMessage.id, { status: MESSAGE_STATUS.FAILED });
        this._showError(res.message || ERROR_MESSAGES.SEND_FAILED);
      }
    }).catch(() => {
      this._updateMessage(newMessage.id, { status: MESSAGE_STATUS.FAILED });
      this._showError(ERROR_MESSAGES.NETWORK_ERROR);
    });
  },

  chooseImage() {
    if (this.data.uploadingImage) return;

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        this._sendImageMessage(tempFilePath);
      }
    });
  },

  _sendImageMessage(tempFilePath) {
    const newMessage = this._buildMessage(MESSAGE_TYPE.IMAGE, tempFilePath);
    const messages = [...this.data.messages, newMessage];
    this._updateMessageIndexMap(messages);

    this.setData({
      messages,
      uploadingImage: true,
      scrollToMessage: newMessage.id
    });

    this._uploadAndSendImage(tempFilePath, newMessage.id);
  },

  _uploadAndSendImage(filePath, tempId) {
    wx.uploadFile({
      url: `${app.globalData.apiBaseUrl}/api/upload/image`,
      filePath: filePath,
      name: 'file',
      header: {
        'Authorization': app.globalData.token ? `Bearer ${app.globalData.token}` : ''
      },
      success: (uploadRes) => {
        let data = uploadRes.data;
        try {
          data = JSON.parse(data);
        } catch (e) {}

        if (data.code === 0 && data.data && data.data.url) {
          this._sendImageChatMessage(data.data.url, tempId);
        } else {
          this._updateMessage(tempId, { status: MESSAGE_STATUS.FAILED });
          this._showError(data.message || ERROR_MESSAGES.UPLOAD_FAILED);
        }
      },
      fail: () => {
        this._updateMessage(tempId, { status: MESSAGE_STATUS.FAILED });
        this._showError(ERROR_MESSAGES.IMAGE_UPLOAD_FAILED);
      },
      complete: () => {
        this.setData({ uploadingImage: false });
      }
    });
  },

  _sendImageChatMessage(imageUrl, tempId) {
    app.request({
      url: '/api/chat/send',
      method: 'POST',
      data: {
        toId: this.chatId,
        type: MESSAGE_TYPE.IMAGE,
        content: imageUrl
      }
    }).then((res) => {
      if (res.code === 0 && res.data) {
        this._updateMessage(tempId, {
          content: res.data.content || res.data.url,
          status: MESSAGE_STATUS.SENT,
          serverId: res.data.id
        });
        this._updateImageUrls(this.data.messages);
      } else {
        this._updateMessage(tempId, { status: MESSAGE_STATUS.FAILED });
        this._showError(res.message || ERROR_MESSAGES.SEND_FAILED);
      }
    }).catch(() => {
      this._updateMessage(tempId, { status: MESSAGE_STATUS.FAILED });
      this._showError(ERROR_MESSAGES.NETWORK_ERROR);
    });
  },

  chooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this._sendLocationMessage(res);
      },
      fail: () => {}
    });
  },

  _sendLocationMessage(location) {
    const locationData = {
      name: location.name || '未知位置',
      address: location.address || '',
      latitude: location.latitude,
      longitude: location.longitude
    };

    const newMessage = this._buildMessage(MESSAGE_TYPE.LOCATION, locationData);
    const messages = [...this.data.messages, newMessage];
    this._updateMessageIndexMap(messages);

    this.setData({
      messages,
      scrollToMessage: newMessage.id
    });

    app.request({
      url: '/api/chat/send',
      method: 'POST',
      data: {
        toId: this.chatId,
        type: MESSAGE_TYPE.LOCATION,
        content: JSON.stringify(locationData)
      }
    }).then((res) => {
      if (res.code === 0 && res.data) {
        this._updateMessage(newMessage.id, { status: MESSAGE_STATUS.SENT, serverId: res.data.id });
      } else {
        this._updateMessage(newMessage.id, { status: MESSAGE_STATUS.FAILED });
        this._showError(res.message || ERROR_MESSAGES.SEND_FAILED);
      }
    }).catch(() => {
      this._updateMessage(newMessage.id, { status: MESSAGE_STATUS.FAILED });
      this._showError(ERROR_MESSAGES.NETWORK_ERROR);
    });
  },

  _updateMessage(tempId, updates) {
    const index = this._messageIndexMap.get(tempId);
    if (index === undefined) return;

    const messages = [...this.data.messages];
    messages[index] = { ...messages[index], ...updates };
    this._updateMessageIndexMap(messages);
    this.setData({ messages });
  },

  resendMessage(e) {
    const id = e.currentTarget.dataset.id;
    const index = this._messageIndexMap.get(id);
    if (index === undefined) return;

    const msg = this.data.messages[index];
    if (msg.status !== MESSAGE_STATUS.FAILED) return;

    this._updateMessage(id, { status: MESSAGE_STATUS.SENDING });

    if (msg.type === MESSAGE_TYPE.TEXT) {
      this._resendTextMessage(msg);
    } else if (msg.type === MESSAGE_TYPE.IMAGE) {
      wx.showToast({ title: ERROR_MESSAGES.RESELECT_IMAGE, icon: 'none' });
    } else if (msg.type === MESSAGE_TYPE.LOCATION) {
      this._resendLocationMessage(msg);
    }
  },

  _resendTextMessage(msg) {
    app.request({
      url: '/api/chat/send',
      method: 'POST',
      data: {
        toId: this.chatId,
        type: MESSAGE_TYPE.TEXT,
        content: msg.content
      }
    }).then((res) => {
      if (res.code === 0 && res.data) {
        this._updateMessage(msg.id, { status: MESSAGE_STATUS.SENT, serverId: res.data.id });
      } else {
        this._updateMessage(msg.id, { status: MESSAGE_STATUS.FAILED });
        this._showError(res.message || ERROR_MESSAGES.SEND_FAILED);
      }
    }).catch(() => {
      this._updateMessage(msg.id, { status: MESSAGE_STATUS.FAILED });
      this._showError(ERROR_MESSAGES.NETWORK_ERROR);
    });
  },

  _resendLocationMessage(msg) {
    app.request({
      url: '/api/chat/send',
      method: 'POST',
      data: {
        toId: this.chatId,
        type: MESSAGE_TYPE.LOCATION,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      }
    }).then((res) => {
      if (res.code === 0 && res.data) {
        this._updateMessage(msg.id, { status: MESSAGE_STATUS.SENT, serverId: res.data.id });
      } else {
        this._updateMessage(msg.id, { status: MESSAGE_STATUS.FAILED });
        this._showError(res.message || ERROR_MESSAGES.SEND_FAILED);
      }
    }).catch(() => {
      this._updateMessage(msg.id, { status: MESSAGE_STATUS.FAILED });
      this._showError(ERROR_MESSAGES.NETWORK_ERROR);
    });
  },

  _bindMessageListener() {
    this._messageHandler = (msg) => {
      if (msg.fromId !== this.chatId) return;
      if (this._receivedIds.has(msg.id)) return;

      this._receivedIds.add(msg.id);

      const newMessage = this._buildMessage(
        msg.type || MESSAGE_TYPE.TEXT,
        msg.content
      );
      newMessage.status = MESSAGE_STATUS.SENT;
      newMessage.serverId = msg.id;
      newMessage.time = msg.createdAt || Date.now();
      newMessage.showTime = needTimeSeparator(this._getLastMessageTime(), newMessage.time);

      if (newMessage.type === MESSAGE_TYPE.LOCATION && typeof newMessage.content === 'string') {
        try { newMessage.content = JSON.parse(newMessage.content); } catch (e) {}
      }

      const messages = [...this.data.messages, newMessage];
      this._updateMessageIndexMap(messages);
      this._updateImageUrls(messages);
      this.setData({
        messages,
        scrollToMessage: newMessage.id
      });
    };

    if (app.globalEvent) {
      app.globalEvent.on('message:new', this._messageHandler);
    }
  },

  _showError(message) {
    wx.showToast({ title: message, icon: 'none' });
  },

  scrollToBottom() {
    const messages = this.data.messages;
    if (messages.length > 0) {
      this.setData({ scrollToMessage: messages[messages.length - 1].id });
    }
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;

    wx.previewImage({
      current: url,
      urls: this.data.imageUrls.length > 0 ? this.data.imageUrls : [url]
    });
  },

  viewLocation(e) {
    const location = e.currentTarget.dataset.location;
    if (!location || !location.latitude) return;

    wx.openLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name || '位置',
      address: location.address || ''
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: '/pages/workbench/workbench' });
        }
      });
    } else {
      wx.switchTab({ url: '/pages/workbench/workbench' });
    }
  }
});
