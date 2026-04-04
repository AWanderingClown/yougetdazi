/**
 * Socket.IO 管理器 - B端
 * 
 * 连接管理后台推送服务器，接收新订单通知和订单状态变更
 */

import io from './weapp-socket.io'

const SOCKET_URL = 'ws://localhost:3002' // 开发环境，生产环境改为 wss://your-domain.com

class SocketManager {
  constructor() {
    this.socket = null
    this.isConnected = false
    this.companionId = null
  }

  /**
   * 连接 Socket.IO 服务器
   */
  connect(companionId) {
    if (this.socket?.connected) {
      console.log('[Socket] 已连接')
      return
    }

    this.companionId = companionId

    // 从本地存储读取 JWT token，在握手阶段发给推送服务器做身份验证
    // 推送服务器通过 JWT 自动将连接加入 companion:{id} Room 和 companions_online Room
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

    // 监听新指定单
    this.socket.on('order:new', (data) => {
      console.log('[Socket] 新指定单:', data)
      this.handleNewOrder(data)
    })

    // 监听新悬赏单广播
    this.socket.on('order:new_reward', (data) => {
      console.log('[Socket] 新悬赏单:', data)
      this.handleNewRewardOrder(data)
    })

    // 监听订单状态变更
    this.socket.on('order:status_changed', (data) => {
      console.log('[Socket] 订单状态变更:', data)
      this.handleOrderStatusChange(data)
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
      this.companionId = null
    }
  }

  /**
   * 处理新指定单
   */
  handleNewOrder(data) {
    const { orderId, orderNo, serviceName, duration, totalAmount } = data

    // 显示通知
    wx.showModal({
      title: '新订单通知',
      content: `服务：${serviceName}\n时长：${duration}小时\n金额：¥${(totalAmount / 100).toFixed(2)}`,
      confirmText: '查看',
      cancelText: '忽略',
      success: (res) => {
        if (res.confirm) {
          // 跳转到订单详情
          wx.navigateTo({
            url: `/pages/b-order-detail/b-order-detail?id=${orderId}`
          })
        }
      }
    })

    // 触发全局事件
    const app = getApp()
    if (app && app.globalEvent) {
      app.globalEvent.emit('order:new', data)
    }
  }

  /**
   * 处理新悬赏单
   */
  handleNewRewardOrder(data) {
    const { orderId, orderNo, serviceName, duration, totalAmount } = data

    // 显示通知
    wx.showToast({
      title: '有新的悬赏单可抢！',
      icon: 'none',
      duration: 3000
    })

    // 触发全局事件，刷新抢单列表
    const app = getApp()
    if (app && app.globalEvent) {
      app.globalEvent.emit('order:new_reward', data)
    }

    // 播放提示音（可选）
    const innerAudioContext = wx.createInnerAudioContext()
    innerAudioContext.src = '/assets/sounds/new_order.mp3'
    innerAudioContext.play()
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

    // 触发全局事件
    const app = getApp()
    if (app && app.globalEvent) {
      app.globalEvent.emit('order:status_changed', data)
    }

    // 如果当前在订单详情页，刷新详情
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    if (currentPage && currentPage.route && currentPage.route.includes('order/detail')) {
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
