// pages/message/message.js
const api = require('../../utils/api');
const configService = require('../../utils/config-service');

Page({
  data: {
    conversationList: [
      {
        id: 'system',
        type: 'system',
        title: '系统通知',
        avatar: '/images/system-notice.png',
        lastMessage: '欢迎来到有个搭子，发现有趣的陪伴！',
        lastTime: '10:30',
        unreadCount: 1
      },
      {
        id: 1,
        type: 'chat',
        nickname: '张三',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
        lastMessage: '好的，明天见！',
        lastTime: '09:15',
        unreadCount: 2,
        isOnline: true
      },
      {
        id: 2,
        type: 'chat',
        nickname: '李四',
        avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200',
        lastMessage: '请问具体在哪个位置？',
        lastTime: '昨天',
        unreadCount: 0,
        isOnline: false
      }
    ]
  },

  onLoad() {
    // 加载消息列表，检查未读状态
    this.checkUnreadStatus();
    // 尝试从服务端拉取真实会话列表
    this.fetchConversations();
    // 清理7天前的离线消息（如果有离线本地存储）
    this.pruneOldOfflineMessages && this.pruneOldOfflineMessages();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    // 每次显示页面时检查未读状态
    this.checkUnreadStatus();
    // 重新拉取会话列表，保持最新
    this.fetchConversations();
  },

  // 从服务端获取会话列表并排序
  fetchConversations() {
    const app = getApp();
    if (app && typeof app.request === 'function') {
      app.request({ url: api.messages.sessions(), method: 'GET' }).then(res => {
        const data = res && (res.data || res);
        const listSource = (data && data.list) || [];
        // 将后端字段映射到前端期望的字段
        const list = listSource.map(s => {
          const nickname = s.companion_nickname || s.nickname || 'unknown';
          const avatar = s.companion_avatar || s.avatar || '/images/system-notice.png';
          return {
            id: s.session_id || s.sessionId || s.id,
            type: s.type || 'chat',
            nickname,
            avatar,
            lastMessage: s.last_message || s.lastMessage || '',
            lastTime: s.last_message_at || s.lastTime || '',
            unreadCount: s.unread_count !== undefined ? s.unread_count : (s.unreadCount ?? 0)
          }
        })
        this.setData({ conversationList: list })
        this.updateTabBarBadge(list)
      }).catch(() => {
        // 保留静态演示数据，失败时不打断体验
      })
    }
  },

  // N天离线消息清理（使用规则控制清理周期，基于本地存储中的离线数据结构）
  pruneOldOfflineMessages() {
    try {
      const offline = wx.getStorageSync('offline_messages') || []
      const now = Date.now()
      const rangeMs = configService.getAppointmentRangeMs()
      const fresh = offline.filter(m => {
        const ts = m.created_at ? new Date(m.created_at).getTime() : 0
        return ts && now - ts <= rangeMs
      })
      if (fresh.length !== offline.length) {
        wx.setStorageSync('offline_messages', fresh)
      }
    } catch {
      // 忽略清理错误
    }
  },

  // 检查所有未读状态（系统通知 + 搭子会话）
  checkUnreadStatus() {
    // 从本地存储获取系统通知已读状态
    const systemNoticeRead = wx.getStorageSync('system_notice_read') || false;
    
    // 更新列表的未读数
    const list = this.data.conversationList.map(item => {
      if (item.type === 'system') {
        // 系统通知
        return {
          ...item,
          unreadCount: systemNoticeRead ? 0 : 1
        };
      } else if (item.type === 'chat') {
        // 搭子会话
        const readKey = `chat_read_${item.id}`;
        const isRead = wx.getStorageSync(readKey) || false;
        return {
          ...item,
          unreadCount: isRead ? 0 : item.unreadCount
        };
      }
      return item;
    });
    
    this.setData({ conversationList: list });
    
    // 更新TabBar消息角标
    this.updateTabBarBadge(list);
  },

  // 更新TabBar消息角标
  updateTabBarBadge(list) {
    // 计算总未读数
    const totalUnread = list.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
    const text = totalUnread > 20 ? '20+' : String(totalUnread);

    if (totalUnread > 0) {
      wx.setTabBarBadge({
        index: 3, // 消息Tab的索引
        text
      });
    } else {
      wx.removeTabBarBadge({
        index: 3
      });
    }
  },

  // 标记系统通知为已读
  markSystemNoticeRead() {
    wx.setStorageSync('system_notice_read', true);
    
    const list = this.data.conversationList.map(item => {
      if (item.type === 'system') {
        return {
          ...item,
          unreadCount: 0
        };
      }
      return item;
    });
    
    this.setData({ conversationList: list });
    
    // 更新TabBar角标
    this.updateTabBarBadge(list);
  },

  // 点击会话
  onConversationTap(e) {
    const id = e.currentTarget.dataset.id;
    const type = e.currentTarget.dataset.type;
    
    if (type === 'system') {
      // 标记系统通知为已读并跳转到系统通知页
      this.markSystemNoticeRead();
      wx.navigateTo({ url: '/pages/message/system-notice/system-notice' });
    } else {
      // 标记搭子会话为已读（清除未读数）
      this.markConversationRead(id);
      
      // 获取当前会话信息
      const conversation = this.data.conversationList.find(item => item.id === id);
      if (conversation) {
        wx.navigateTo({
          url: `/pages/chat/chat?companionId=${id}&nickname=${encodeURIComponent(conversation.nickname)}&avatar=${encodeURIComponent(conversation.avatar)}`
        });
      }
    }
  },

  // 标记搭子会话为已读
  markConversationRead(id) {
    const list = this.data.conversationList.map(item => {
      if (item.id === id && item.type === 'chat') {
        return {
          ...item,
          unreadCount: 0
        };
      }
      return item;
    });
    
    this.setData({ conversationList: list });
    
    // 保存已读状态到本地存储
    const readKey = `chat_read_${id}`;
    wx.setStorageSync(readKey, true);
    
    // 更新TabBar角标
    this.updateTabBarBadge(list);
  },

  // 长按删除
  onConversationLongPress(e) {
    const id = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['删除会话'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.deleteConversation(id);
        }
      }
    });
  },

  // 删除会话
  deleteConversation(id) {
    const list = this.data.conversationList.filter(item => item.id !== id);
    this.setData({ conversationList: list });
    wx.showToast({ title: '已删除', icon: 'success' });
  }
});
