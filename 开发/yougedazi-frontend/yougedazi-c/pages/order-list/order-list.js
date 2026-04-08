// pages/order-list/order-list.js - 订单列表
const { 
  ORDER_STATUS, 
  CANCEL_RULE, 
  TIMER, 
  canCancelOrder, 
  getPendingPaymentActions,
  getWaitingGrabActions,
  getAcceptedActions,
  getDepartedActions,
  getServingActions,
  getCompletedActions
} = require('../../utils/constants');
const api = require('../../utils/api');
const mockOrders = require('../../mock-data/orders');
const { showCustomerServiceOptions } = require('../../utils/order-service');

Page({
  data: {
    currentTab: 0,
    tabs: ['服务中', '已完成', '已取消'],
    expandedOrderId: null, // 当前展开的订单ID
    // serviceTimer 移到实例属性，避免不必要的视图更新
    remainingSeconds: 0, // 剩余秒数
    timerDisplay: '00:00:00', // 倒计时显示
    tabCounts: [0, 0, 0],
    orders: [],
    isLoading: true
  },

  onLoad() {
    const savedTab = wx.getStorageSync('order_current_tab');
    if (savedTab !== '' && savedTab !== undefined && savedTab !== null) {
      this.setData({ currentTab: parseInt(savedTab) || 0 }, () => {
        this.loadOrders();
      });
    } else {
      this.loadOrders();
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    
    const defaultTab = wx.getStorageSync('order_default_tab');
    if (defaultTab !== '' && defaultTab !== undefined && defaultTab !== null) {
      this.setData({ currentTab: parseInt(defaultTab) || 0 }, () => {
        this.loadOrders();
      });
      wx.removeStorageSync('order_default_tab');
      wx.setStorageSync('order_current_tab', defaultTab);
    } else {
      this.loadOrders();
    }
  },

  onHide() {
    // 页面隐藏时停止计时器并收起展开状态
    if (this.serviceTimer) {
      clearInterval(this.serviceTimer);
      this.serviceTimer = null;
    }
    // 收起展开状态
    this.setData({ expandedOrderId: null });
  },

  // 切换Tab
  onTabChange(e) {
    if (this.data.isLoading) return;

    if (this.serviceTimer) {
      clearInterval(this.serviceTimer);
      this.serviceTimer = null;
    }

    const index = parseInt(e.currentTarget.dataset.index);
    this.setData({
      currentTab: index,
      expandedOrderId: null
    });
    wx.setStorageSync('order_current_tab', index);
    this.loadOrders();
  },

  // 状态 → 显示文本/样式（mock阶段本地用）
  _getStatusMeta(status) {
    const map = {
      pending_payment: { text: '待支付',  cls: 'status-warning' },
      pending_accept:  { text: '待接单',  cls: 'status-warning' },
      waiting_grab:    { text: '等待接单', cls: 'status-info'    },
      accepted:        { text: '已接单',  cls: 'status-primary'  },
      serving:         { text: '服务中',  cls: 'status-primary'  },
      completed:       { text: '已完成',  cls: 'status-success'  },
      cancelled:       { text: '已取消',  cls: 'status-secondary' },
      departed:        { text: '搭子已出发', cls: 'status-info' },
      in_progress:     { text: '服务中', cls: 'status-primary' }
    };
    return map[status] || { text: status, cls: '' };
  },

  // 生成基于状态和时间的按钮集合
  // 返回结构：[{ text, action, type }, ...]
  // 动作名称会绑定到 onActionTap 的 switch
  // 所有状态都根据时间规则返回对应的按钮配置
  getActionsForStatus(status, orderTime, completionTime, serviceStartTime, acceptedAt) {
    // 待支付订单
    if (status === ORDER_STATUS.PENDING_PAYMENT) {
      const actions = getPendingPaymentActions(status, orderTime);
      if (actions) return actions;
    }

    // 等待接单
    if (status === ORDER_STATUS.WAITING_GRAB) {
      const actions = getWaitingGrabActions(status, orderTime);
      if (actions) return actions;
    }

    // 已接单 - 使用接单时间判断
    if (status === ORDER_STATUS.ACCEPTED) {
      const actions = getAcceptedActions(status, acceptedAt);
      if (actions) return actions;
    }

    // 搭子已出发
    if (status === ORDER_STATUS.DEPARTED) {
      const actions = getDepartedActions(status);
      if (actions) return actions;
    }

    // 服务中
    if (status === ORDER_STATUS.SERVING) {
      const actions = getServingActions(status, serviceStartTime);
      if (actions) return actions;
    }

    // 已完成
    if (status === ORDER_STATUS.COMPLETED) {
      const actions = getCompletedActions(status, completionTime);
      if (actions) return actions;
    }

    // 其他状态使用默认配置
    switch (status) {
      case ORDER_STATUS.PENDING:
        return [
          { text: '取消订单', action: 'cancel', type: 'default' },
          { text: '查看详情', action: 'detail', type: 'default' }
        ]
      case ORDER_STATUS.CANCELLED:
        return [
          { text: '再次下单', action: 'reorder', type: 'primary' },
          { text: '查看详情', action: 'detail', type: 'default' }
        ]
      default:
        return [ { text: '查看详情', action: 'detail', type: 'default' } ]
    }
  },

  // 加载订单 - 使用模拟数据
  loadOrders() {
    this.setData({ isLoading: true });

    const activeStatuses = [
      ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PENDING, ORDER_STATUS.ACCEPTED,
      ORDER_STATUS.SERVING, ORDER_STATUS.WAITING_GRAB
    ];

    // 使用模拟数据
    const list = mockOrders.orders || [];

    // 将模拟数据映射为前端所需格式
    const allOrders = list.map(o => {
      const meta = this._getStatusMeta(o.status);
      const appointmentDate = o.appointment_date || '';
      const appointmentTime = o.appointment_time || '';
      // 下单时间（用于计算时间相关的按钮逻辑）
      const orderTime = o.created_at || o.order_time || Date.now();

      // 检查待支付订单是否超过15分钟，如果是则标记为已取消
      let finalStatus = o.status;
      let finalStatusText = meta.text;
      let finalStatusClass = meta.cls;

      if (o.status === ORDER_STATUS.PENDING_PAYMENT) {
        const timeStatus = o.time_status;
        if (timeStatus && timeStatus.exceeded_15_minutes) {
          finalStatus = ORDER_STATUS.CANCELLED;
          finalStatusText = '已取消';
          finalStatusClass = 'status-secondary';
        }
      }

      // 完成时间（用于已完成订单的评价按钮判断）
      const completionTime = o.completion_time || null;
      // 服务开始时间（用于服务中订单的按钮判断）
      const serviceStartTime = o.service_start_time || null;
      // 接单时间（用于已接单订单的取消按钮判断）
      const acceptedAt = o.accepted_at ? new Date(o.accepted_at).getTime() : null;

      // 动态按钮（根据状态和时间显示不同的操作按钮）
      const dynamicActions = this.getActionsForStatus(finalStatus, orderTime, completionTime, serviceStartTime, acceptedAt);
      return {
        id: o.id,
        order_no: o.order_no,
        status: finalStatus,
        statusText: finalStatusText,
        statusClass: finalStatusClass,
        orderTime: orderTime,
        companion: o.companion_id ? {
          id:       o.companion_id,
          nickname: o.companion_name || '',
          avatar:   o.companion_avatar || ''
        } : null,
        serviceType:     o.service_name,
        duration:        o.duration,
        appointmentDate: appointmentDate,
        appointmentTime: appointmentTime,
        totalAmount:     o.total_price || 0,
        actions:         dynamicActions
      };
    });

    // 根据当前Tab筛选订单
    const tabIndex = this.data.currentTab;
    let filteredOrders = [];

    if (tabIndex === 0) {
      filteredOrders = allOrders.filter(o => activeStatuses.includes(o.status));
    } else if (tabIndex === 1) {
      filteredOrders = allOrders.filter(o => o.status === ORDER_STATUS.COMPLETED);
    } else if (tabIndex === 2) {
      filteredOrders = allOrders.filter(o => o.status === ORDER_STATUS.CANCELLED);
    }

    // 计算各Tab数量
    const tabCounts = [
      allOrders.filter(o => activeStatuses.includes(o.status)).length,
      allOrders.filter(o => o.status === ORDER_STATUS.COMPLETED).length,
      allOrders.filter(o => o.status === ORDER_STATUS.CANCELLED).length
    ];

    this.setData({
      orders: filteredOrders,
      tabCounts: tabCounts,
      isLoading: false
    });
  },

  // 点击订单
  onOrderTap(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.orders.find(o => o.id === id);
    
    // 服务中/已接单/悬赏订单，点击卡片展开/收起详情
    if (order && [ORDER_STATUS.ACCEPTED, ORDER_STATUS.SERVING, ORDER_STATUS.WAITING_GRAB].includes(order.status)) {
      // 点击卡片本身也触发展开/收起
      const expandedOrderId = this.data.expandedOrderId === id ? null : id;
      this.setData({ expandedOrderId });
    } else {
      // 其他状态跳转到详情页，传递订单状态
      const status = order ? order.status : '';
      wx.navigateTo({
        url: `/pages/order-detail/order-detail?id=${id}&status=${status}`
      });
    }
  },

  // 长按订单 - 显示删除选项（仅已完成/已取消可删除）
  onOrderLongPress(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.orders.find(o => o.id === id);
    
    // 只有已完成或已取消的订单可以删除
    if (!order || (order.status !== ORDER_STATUS.COMPLETED && order.status !== ORDER_STATUS.CANCELLED)) {
      wx.showToast({
        title: '该状态订单不可删除',
        icon: 'none'
      });
      return;
    }
    
    wx.showActionSheet({
      itemList: ['删除订单'],
      itemColor: '#e74c3c',
      success: (res) => {
        if (res.tapIndex === 0) {
          this.deleteOrder(id);
        }
      }
    });
  },

  // 删除订单
  deleteOrder(orderId) {
    wx.showModal({
      title: '确认删除',
      content: '删除后订单将不再显示，是否确认删除？',
      confirmText: '删除',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          // 先查找要删除的订单（在过滤前查找）
          const deletedOrder = this.data.orders.find(o => o.id === orderId);
          
          // 调用后端删除接口
          const app = getApp();
          app.request({
            url: api.orders.delete(orderId),
            method: 'DELETE'
          }).then(() => {
            // 从列表中移除
            const orders = this.data.orders.filter(o => o.id !== orderId);
            
            // 更新Tab计数
            const newTabCounts = [...this.data.tabCounts];
            if (deletedOrder) {
              const activeStatuses = [
                ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PENDING, ORDER_STATUS.ACCEPTED,
                ORDER_STATUS.SERVING, ORDER_STATUS.WAITING_GRAB
              ];
              if (activeStatuses.includes(deletedOrder.status)) {
                newTabCounts[0] = Math.max(0, newTabCounts[0] - 1);
              } else if (deletedOrder.status === ORDER_STATUS.COMPLETED) {
                newTabCounts[1] = Math.max(0, newTabCounts[1] - 1);
              } else if (deletedOrder.status === ORDER_STATUS.CANCELLED) {
                newTabCounts[2] = Math.max(0, newTabCounts[2] - 1);
              }
            }
            this.setData({ 
              orders: orders,
              tabCounts: newTabCounts
            });
            wx.showToast({
              title: '已删除',
              icon: 'success'
            });
          }).catch(err => {
            wx.showToast({
              title: err?.message || '删除失败',
              icon: 'none'
            });
          });
        }
      }
    });
  },

  // 点击预约时间/地址区域跳转到详情页
  onDetailTap(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.orders.find(o => o.id === id);
    const status = order ? order.status : '';
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${id}&status=${status}`
    });
  },

  // 点击已抢单搭子跳转到详情页
  onGrabbedCompanionTap(e) {
    const orderId = e.currentTarget.dataset.orderid;
    const order = this.data.orders.find(o => o.id === orderId);
    if (order && order.companion && order.companion.id) {
      wx.navigateTo({
        url: `/pages/dazi-detail/dazi-detail?id=${order.companion.id}`
      });
    }
  },

  // 展开/收起详情
  onToggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    const isExpanding = this.data.expandedOrderId !== id;
    
    // 如果正在收起，先停止计时器
    if (!isExpanding && this.serviceTimer) {
      clearInterval(this.serviceTimer);
      this.serviceTimer = null;
    }
    
    const expandedOrderId = isExpanding ? id : null;
    this.setData({ expandedOrderId });
    
    // 如果展开的是服务中订单，启动倒计时
    if (isExpanding) {
      const order = this.data.orders.find(o => o.id === id);
      if (order && order.status === ORDER_STATUS.SERVING) {
        this.startServiceTimer(order.id, order.duration, order.serviceStartTime);
      }
    }
  },

  // 启动服务倒计时 - 显示剩余时间
  startServiceTimer(orderId, durationHours, serviceStartTime) {
    // 清除已有计时器
    if (this.serviceTimer) {
      clearInterval(this.serviceTimer);
    }
    
    // 计算总秒数
    const totalSeconds = durationHours * 3600;
    
    // 如果传入了服务开始时间，计算实际剩余时间
    let remainingSeconds;
    if (serviceStartTime) {
      const now = Date.now();
      const elapsed = Math.floor((now - serviceStartTime) / 1000);
      remainingSeconds = Math.max(0, totalSeconds - elapsed);
    } else {
      // 模拟已进行35%（用于测试）
      const elapsedSeconds = Math.floor(totalSeconds * 0.35);
      remainingSeconds = totalSeconds - elapsedSeconds;
    }
    
    this.setData({ remainingSeconds });
    this.updateTimerDisplay(remainingSeconds);
    
    // 标记是否已经显示过续费提醒
    let hasShownRenewalReminder = false;
    
    const timer = setInterval(() => {
      remainingSeconds--;
      
      // 更新显示（倒计时）
      this.setData({ remainingSeconds });
      this.updateTimerDisplay(remainingSeconds);
      
      // 倒计时结束前10分钟提醒续费（使用<=防止跳过）
      const RENEWAL_REMINDER_SECONDS = 10 * 60;
      if (remainingSeconds <= RENEWAL_REMINDER_SECONDS && !hasShownRenewalReminder) {
        hasShownRenewalReminder = true;
        this.showRenewalReminder(orderId);
      }
      
      // 倒计时结束，自动完成订单
      if (remainingSeconds <= 0) {
        clearInterval(timer);
        this.serviceTimer = null;
        this.setData({
          timerDisplay: '00:00:00'
        });
        this.autoCompleteOrder(orderId);
        return;
      }
    }, TIMER.UI_TICK_INTERVAL_MS);
    
    this.serviceTimer = timer;
  },

  // 显示续费提醒
  showRenewalReminder(orderId) {
    wx.showModal({
      title: '服务即将结束',
      content: '服务还剩10分钟结束，是否需要续费？',
      confirmText: '立即续费',
      cancelText: '不用了',
      success: (res) => {
        if (res.confirm) {
          // 跳转到续费页面或调用续费方法
          this.handleRenewal(orderId);
        }
      }
    });
  },

  // 处理续费 —— 跳转到订单详情页在那里续费（避免重复实现支付逻辑）
  handleRenewal(orderId) {
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${orderId}`
    });
  },

  // 自动完成订单 - 调用后端完成接口
  autoCompleteOrder(orderId) {
    // 防止重复提交
    if (this.data._completingOrderId === orderId) return;
    this.setData({ _completingOrderId: orderId });
    
    const app = getApp();
    app.request({
      url: api.orders.complete(orderId),
      method: 'POST'
    }).then(() => {
      const orders = this.data.orders.map(o => {
        if (o.id === orderId) {
          return {
            ...o,
            status: ORDER_STATUS.COMPLETED,
            statusText: '已完成',
            statusClass: 'status-success'
          };
        }
        return o;
      });
      
      this.setData({ orders, _completingOrderId: null });
      
      wx.showToast({
        title: '服务已结束，订单完成',
        icon: 'success'
      });
    }).catch(err => {
      this.setData({ _completingOrderId: null });
      wx.showToast({
        title: err?.message || '订单完成处理失败',
        icon: 'none'
      });
    });
  },

  // 更新计时器显示
  updateTimerDisplay(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const timerDisplay = 
      String(hours).padStart(2, '0') + ':' +
      String(minutes).padStart(2, '0') + ':' +
      String(secs).padStart(2, '0');
    
    this.setData({ timerDisplay });
  },

  onUnload() {
    // 页面卸载时清除计时器
    if (this.serviceTimer) {
      clearInterval(this.serviceTimer);
    }
  },

  // 点击操作按钮
  onActionTap(e) {
    const { orderid, action } = e.currentTarget.dataset;
    
    switch(action) {
      case 'pay':
        this.handlePay(orderid);
        break;
      case 'cancel':
        this.handleCancel(orderid);
        break;
      case 'chat':
        this.handleChat(orderid);
        break;
      case 'reorder':
        this.handleReorder(orderid);
        break;
      case 'review':
        this.handleReview(orderid);
        break;
      case 'detail':
        this.handleDetail(orderid);
        break;
      case 'urge':
        this.handleUrge(orderid);
        break;
      case 'contact_service':
        this.handleContactService(orderid);
        break;
      case 'change':
        this.handleChange(orderid);
        break;
      case 'complete':
        this.handleComplete(orderid);
        break;
      case 'cancel_reward':
        this.handleCancelReward(orderid);
        break;
      case 'share_reward':
        this.handleShareReward(orderid);
        break;
    }
  },

  // 支付 - 跳转到订单详情页完成支付
  handlePay(orderId) {
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${orderId}`
    });
  },

  // 取消订单 - 先向后端查询退款预览，再让用户确认
  handleCancel(orderId) {
    const app = getApp();
    wx.showLoading({ title: '查询中...' });

    app.request({ url: api.orders.cancelPreview(orderId) })
      .then(res => {
        wx.hideLoading();
        const { can_cancel, cancel_fee, cancel_reason } = res.data || {};

        if (!can_cancel) {
          wx.showModal({
            title: '无法取消',
            content: cancel_reason || '当前状态不支持取消，如有问题请联系客服',
            showCancel: false,
            confirmText: '我知道了',
          });
          return;
        }

        // 有扣费（搭子已出发）
        if (cancel_fee > 0) {
          wx.showModal({
            title: '取消订单',
            content: '搭子已出发，现在取消将扣除 ¥50 打车费，是否确认取消？',
            cancelText: '继续等待',
            confirmText: '确认取消',
            confirmColor: '#ef4444',
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.executeCancel(orderId);
              }
            },
          });
          return;
        }

        // 无扣费 - 二次确认
        wx.showModal({
          title: '取消订单',
          content: '搭子已接单，准备出发中，您确认要取消吗？',
          cancelText: '继续等待',
          confirmText: '确认取消',
          confirmColor: '#ef4444',
          success: (modalRes) => {
            if (modalRes.confirm) {
              this.executeCancel(orderId);
            }
          },
        });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '查询失败，请重试', icon: 'none' });
      });
  },
  
  // 显示客服介入提示
  showCustomerServiceModal(orderId) {
    wx.showModal({
      title: '申请客服介入',
      content: '服务进行中（≤15分钟），取消订单需要客服审核。是否联系客服处理？',
      confirmText: '联系客服',
      cancelText: '再想想',
      success: (res) => {
        if (res.confirm) {
          // 跳转到客服页面或拨打客服电话
          const config = require('../../config/backend-config.js');
          wx.showActionSheet({
            itemList: ['在线客服', `客服电话 ${config.customerService.phone}`],
            success: (sheetRes) => {
              if (sheetRes.tapIndex === 1) {
                wx.makePhoneCall({ phoneNumber: config.customerService.phone });
              } else {
                wx.showToast({ title: '正在连接客服...', icon: 'none' });
              }
            }
          });
        }
      }
    });
  },
  
  // 执行取消操作
  executeCancel(orderId) {
    const app = getApp();
    wx.showLoading({ title: '取消中...' });

    app.request({ url: api.orders.cancel(orderId), method: 'POST' })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '订单已取消', icon: 'success' });
        this.loadOrders();
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err?.message || '取消失败，请重试', icon: 'none' });
      });
  },

  // 聊天
  handleChat(orderId) {
    const order = this.data.orders.find(o => o.id === orderId);
    if (order) {
      // 检查是否有搭子接单（悬赏订单需要等待抢单后才能联系）
      if (!order.companion) {
        wx.showToast({
          title: '暂无搭子接单',
          icon: 'none'
        });
        return;
      }
      const companion = order.companion;
      wx.navigateTo({
        url: `/pages/chat/chat?companionId=${companion.id}&nickname=${encodeURIComponent(companion.nickname)}&avatar=${encodeURIComponent(companion.avatar)}&id=${orderId}`
      });
    }
  },

  // 再次下单
  handleReorder(orderId) {
    const order = this.data.orders.find(o => o.id === orderId);
    if (order) {
      wx.navigateTo({
        url: `/pages/dazi-detail/dazi-detail?id=${order.companion?.id || ''}`
      });
    }
  },

  // 评价
  handleReview(orderId) {
    wx.navigateTo({
      url: '/pages/review/review?id=' + orderId
    });
  },

  // 查看评价
  handleViewReview(orderId) {
    wx.showToast({ title: '评价功能开发中', icon: 'none' });
  },

  // 查看详情
  handleDetail(orderId) {
    wx.navigateTo({
      url: '/pages/order-detail/order-detail?id=' + orderId
    });
  },

  // 催一催
  handleUrge(orderId) {
    wx.showToast({
      title: '已提醒搭子加快进度',
      icon: 'none'
    });
  },

  // 联系客服
  handleContact(orderId) {
    const config = require('../../config/backend-config.js');
    wx.showActionSheet({
      itemList: ['在线客服', '客服电话'],
      success: (res) => {
        if (res.tapIndex === 1) {
          wx.makePhoneCall({
            phoneNumber: config.customerService.phone
          });
        }
      }
    });
  },

  // 联系客服（已完成订单专用）
  handleContactService(orderId) {
    showCustomerServiceOptions(orderId);
  },

  // 换一换（重新发布悬赏或匹配新搭子）
  handleChange(orderId) {
    const order = this.data.orders.find(o => o.id === orderId);
    if (order) {
      wx.showModal({
        title: '换一换',
        content: '确定要重新匹配搭子吗？当前悬赏将重新发布。',
        confirmText: '确定',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.showToast({
              title: '正在重新匹配...',
              icon: 'loading'
            });
            // 这里可以调用API重新匹配
          }
        }
      });
    }
  },

  // 服务结束（用户主动结束服务）
  handleComplete(orderId) {
    wx.showModal({
      title: '结束服务',
      content: '确定要结束当前服务吗？结束后将跳转到评价页面。',
      confirmText: '结束服务',
      confirmColor: '#f44336',
      success: (res) => {
        if (res.confirm) {
          // 调用API结束服务
          wx.showLoading({ title: '处理中...' });
          setTimeout(() => {
            wx.hideLoading();
            // 跳转到评价页面
            wx.navigateTo({
              url: `/pages/review/review?id=${orderId}`
            });
          }, 1000);
        }
      }
    });
  },

  // 取消悬赏
  handleCancelReward(orderId) {
    wx.showModal({
      title: '取消悬赏',
      content: '取消后金额将原路退回，确定要取消吗？',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          this.executeCancel(orderId);
        }
      }
    });
  },

  // 分享悬赏任务
  handleShareReward(orderId) {
    // 获取订单信息用于分享
    const order = this.data.orders.find(o => o.id === orderId);
    if (!order) return;
    
    // 显示分享菜单
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
    
    // 提示用户点击右上角分享
    wx.showModal({
      title: '分享任务',
      content: `分享「${order.serviceType}」悬赏任务给好友，点击右上角「...」选择转发即可`,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 去首页
  goToHome() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadOrders();
    wx.stopPullDownRefresh();
  },

  // 页面分享配置
  onShareAppMessage() {
    return {
      title: '我的订单列表 - PP Mate',
      path: '/pages/order-list/order-list'
    };
  }
});
