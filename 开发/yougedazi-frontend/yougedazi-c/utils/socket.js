/**
 * Socket.IO 管理器 - C端
 * 
 * 连接管理后台推送服务器，接收订单状态变更通知
 */

import io from './weapp-socket.io'

const SOCKET_URL = 'ws://localhost:3002' // 开发环境，生产环境改为 wss://your-domain.com

class SocketManager {
  constructor() {
    this.socket = null
    this.isConnected = false
    this.userId = null
  }

  /**
   * 连接 Socket.IO 服务器
   */
  connect(userId) {
    if (this.socket?.connected) {
      console.log('[Socket] 已连接')
      return
    }

    this.userId = userId

    // 从本地存储读取 JWT token，在握手阶段发给推送服务器做身份验证
    // 推送服务器通过 JWT 自动将连接加入 user:{id} Room，无需手动 emit join:user
    const token = wx.getStorageSync('token') || ''

    this.socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: { token },
    })

    // 连接成功
    this.socket.on('connect', () => {
      console.log('[Socket] 已连接到推送服务器')
      this.isConnected = true
    })

    // 断开连接
    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] 断开连接:', reason)
      this.isConnected = false
    })

    // 连接错误
    this.socket.on('connect_error', (error) => {
      console.error('[Socket] 连接错误:', error)
    })

    // 监听订单状态变更
    this.socket.on('order:status_changed', (data) => {
      console.log('[Socket] 订单状态变更:', data)
      this.handleOrderStatusChange(data)
    })

    // 监听新订单（如果是悬赏单发布者）
    this.socket.on('order:new', (data) => {
      console.log('[Socket] 新订单:', data)
    })

    return this.socket
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.isConnected = false
      this.userId = null
    }
  }

  /**
   * 处理订单状态变更
   */
  handleOrderStatusChange(data) {
    const { orderId, orderNo, fromStatus, toStatus, message } = data

    // 显示通知
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 3000
    })

    // 触发全局事件，让页面刷新订单列表
    const app = getApp()
    if (app && app.globalEvent) {
      app.globalEvent.emit('order:status_changed', data)
    }

    // 如果当前在订单详情页，刷新详情
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    if (currentPage && currentPage.route && currentPage.route.includes('order-detail')) {
      if (currentPage.data.id === orderId && typeof currentPage.refreshOrder === 'function') {
        currentPage.refreshOrder()
      }
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      socketId: this.socket?.id
    }
  }
}

// 单例导出
const socketManager = new SocketManager()

export default socketManager
