// pages/order-detail/modules/order-actions.js
// 订单操作模块 - 支付、取消、换一换、续费、结束服务等

const { ORDER_STATUS } = require('../../../utils/constants');
const api = require('../../../utils/api');

/**
 * 订单操作类
 */
class OrderActions {
  /**
   * @param {Object} page - 页面实例引用
   */
  constructor(page) {
    this.page = page;
  }

  /**
   * 立即支付
   * @param {string} orderId - 订单ID
   * @param {Function} onSuccess - 成功回调
   */
  onPay(orderId, onSuccess) {
    wx.showLoading({ title: '获取支付信息...' });
    const app = getApp();

    app.request({ url: api.orders.pay(orderId), method: 'POST' })
      .then(res => {
        wx.hideLoading();
        const { payment_params } = res.data;
        wx.requestPayment({
          ...payment_params,
          success: () => {
            wx.showToast({ title: '支付成功', icon: 'success' });
            setTimeout(() => { if (onSuccess) onSuccess(); }, 1500);
          },
          fail: (err) => {
            if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
              wx.showToast({ title: '支付失败', icon: 'none' });
            }
          }
        });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err?.message || '获取支付信息失败', icon: 'none' });
      });
  }

  /**
   * 查询取消预览信息并确认
   * @param {string} orderId - 订单ID
   * @param {Function} onConfirm - 确认后回调
   */
  confirmCancelOrder(orderId, onConfirm) {
    this._showCancelConfirm(orderId, onConfirm);
  }

  /**
   * 执行取消订单
   * @param {string} orderId - 订单ID
   * @param {Function} onSuccess - 成功回调
   */
  executeCancel(orderId, onSuccess) {
    wx.showLoading({ title: '处理中...' });
    const app = getApp();

    app.request({
      url: api.orders.cancel(orderId),
      method: 'POST',
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '取消成功', icon: 'success' });
      setTimeout(() => { if (onSuccess) onSuccess(); }, 800);
    }).catch((err) => {
      wx.hideLoading();
      wx.showToast({ title: err?.message || '取消失败，请重试', icon: 'none' });
    });
  }

  /**
   * 自动取消订单（支付超时）
   * @param {Function} onComplete - 完成后回调
   */
  autoCancelOrder(onComplete) {
    const { formatFullDateTime } = require('./utils');

    this.page.setData({
      status: ORDER_STATUS.CANCELLED,
      'orderInfo.cancelReason': '支付超时，系统自动取消',
      'orderInfo.cancelledAt': formatFullDateTime(new Date())
    });

    wx.showToast({
      title: '订单已超时取消',
      icon: 'none'
    });

    if (onComplete) onComplete();
  }

  /**
   * 换一换 - 更换搭子
   * @param {string} orderId - 订单ID
   * @param {Function} onSuccess - 成功回调
   */
  onChangeCompanion(orderId, onSuccess) {
    wx.showModal({
      title: '确认更换搭子',
      content: '更换后当前搭子将失效，系统会为您重新匹配，是否继续？',
      confirmText: '确认更换',
      confirmColor: '#667eea',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '更换中...' });
          const app = getApp();

          app.request({ url: api.orders.changeCompanion(orderId), method: 'POST' })
            .then(() => {
              wx.hideLoading();
              wx.showToast({ title: '已更换，重新匹配中', icon: 'success' });
              setTimeout(() => { if (onSuccess) onSuccess(); }, 1500);
            })
            .catch(err => {
              wx.hideLoading();
              wx.showToast({ title: err?.message || '更换失败', icon: 'none' });
            });
        }
      }
    });
  }

  /**
   * 服务结束 - 用户提前结束服务
   * @param {string} orderId - 订单ID
   * @param {number} elapsedMinutes - 已进行分钟数
   * @param {Function} onSuccess - 成功回调
   */
  onEndService(orderId, elapsedMinutes, onSuccess) {
    wx.showModal({
      title: '确认结束服务',
      content: `服务已进行${elapsedMinutes}分钟，确认提前结束吗？`,
      confirmText: '确认结束',
      confirmColor: '#667eea',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          const app = getApp();

          app.request({ url: api.orders.complete(orderId), method: 'POST' })
            .then(() => {
              wx.hideLoading();
              wx.showToast({ title: '服务已结束', icon: 'success' });
              setTimeout(() => { if (onSuccess) onSuccess(); }, 1500);
            })
            .catch(err => {
              wx.hideLoading();
              wx.showToast({ title: err?.message || '操作失败', icon: 'none' });
            });
        }
      }
    });
  }

  /**
   * 服务时间用完结束
   * @param {string} orderId - 订单ID
   * @param {Function} onRenewal - 续费回调
   * @param {Function} onComplete - 完成回调
   */
  onServiceEnd(orderId, onRenewal, onComplete) {
    const app = getApp();

    app.request({
      url: api.orders.complete(orderId),
      method: 'POST'
    }).then(() => {
      wx.showModal({
        title: '服务已结束',
        content: '服务时间已用完，是否需要续费？',
        confirmText: '立即续费',
        cancelText: '结束服务',
        success: (res) => {
          if (res.confirm) {
            if (onRenewal) onRenewal();
          } else {
            // 同步更新本地存储
            const directOrders = wx.getStorageSync('direct_orders') || [];
            const updated = directOrders.map(o =>
              o.id === orderId ? { ...o, status: ORDER_STATUS.COMPLETED } : o
            );
            wx.setStorageSync('direct_orders', updated);

            this.page.setData({
              status: ORDER_STATUS.COMPLETED,
              'orderInfo.hasReviewed': false
            });

            if (onComplete) onComplete();
          }
        }
      });
    }).catch(err => {
      wx.showToast({
        title: err?.message || '服务结束处理失败',
        icon: 'none'
      });
    });
  }

  /**
   * 催一催
   * @param {string} orderId - 订单ID
   */
  onUrge(orderId) {
    if (this.page.data.showUrgeToast) return;

    this.page.setData({ showUrgeToast: true });
    const app = getApp();

    app.request({ url: api.orders.urge(orderId), method: 'POST' })
      .catch(() => {});

    wx.showToast({ title: '已提醒搭子加快进度', icon: 'none', duration: 2000 });
    setTimeout(() => { this.page.setData({ showUrgeToast: false }); }, 2000);
  }

  /**
   * 请求提前结束（服务中取消）- 复用confirmCancelOrder逻辑
   * @param {string} orderId - 订单ID
   * @param {Function} onConfirm - 确认后回调
   */
  onRequestEnd(orderId, onConfirm) {
    this._showCancelConfirm(orderId, onConfirm, { showCancel: true, cancelText: '再想想' });
  }

  /**
   * 显示取消确认弹窗的公共方法
   * @param {string} orderId - 订单ID
   * @param {Function} onConfirm - 确认后回调
   * @param {Object} options - 弹窗选项
   */
  _showCancelConfirm(orderId, onConfirm, options = {}) {
    const { showCancel = false, cancelText = '' } = options;
    wx.showLoading({ title: '查询退款信息...' });
    const app = getApp();

    app.request({
      url: api.orders.cancelPreview(orderId),
      method: 'GET'
    }).then(res => {
      wx.hideLoading();
      const { can_cancel, refund_amount, cancel_reason } = res.data || {};

      if (!can_cancel) {
        wx.showModal({
          title: '无法取消',
          content: cancel_reason || '当前状态不支持取消，如有问题请联系客服',
          showCancel: false,
          confirmText: '我知道了'
        });
        return;
      }

      const refundText = refund_amount > 0
        ? `\n\n退款金额：¥${(refund_amount / 100).toFixed(2)}`
        : '\n\n取消后无退款';

      wx.showModal({
        title: '确认取消订单',
        content: `${cancel_reason}${refundText}`,
        confirmText: '确认取消',
        confirmColor: '#f44336',
        showCancel,
        cancelText,
        success: (modalRes) => {
          if (modalRes.confirm && onConfirm) {
            onConfirm();
          }
        }
      });
    }).catch(err => {
      wx.hideLoading();
      const logger = require('../../../utils/logger');
      logger.error(logger.Categories.ORDER, '查询退款信息失败:', err);
      wx.showToast({
        title: err?.message || '查询失败，请重试',
        icon: 'none'
      });
    });
  }

  /**
   * 处理续费支付
   * @param {string} orderId - 订单ID
   * @param {number} addedHours - 增加的小时数
   * @param {Function} onSuccess - 成功回调
   */
  processRenewalPayment(orderId, addedHours, onSuccess) {
    wx.showLoading({ title: '创建续费订单...' });
    const app = getApp();

    app.request({
      url: api.orders.renew(orderId),
      method: 'POST',
      data: { added_hours: addedHours },
    }).then((res) => {
      wx.hideLoading();
      const { payment_params } = res.data;
      wx.requestPayment({
        ...payment_params,
        success: () => {
          wx.showToast({ title: '支付成功，续费处理中', icon: 'success' });
          setTimeout(() => { if (onSuccess) onSuccess(); }, 2000);
        },
        fail: (err) => {
          if (err.errMsg && err.errMsg.includes('cancel')) {
            wx.showToast({ title: '已取消支付', icon: 'none' });
          } else {
            wx.showToast({ title: '支付失败，请重试', icon: 'none' });
          }
        },
      });
    }).catch((err) => {
      wx.hideLoading();
      wx.showToast({ title: err?.message || '创建续费订单失败', icon: 'none' });
    });
  }

  /**
   * 显示续费确认弹窗
   * @param {number} addedHours - 增加的小时数
   * @param {Function} onConfirm - 确认回调
   */
  showRenewalConfirm(addedHours, onConfirm) {
    wx.showModal({
      title: '确认续费',
      content: `续费${addedHours}小时，费用由后端按时薪计算`,
      success: (modalRes) => {
        if (modalRes.confirm && onConfirm) {
          onConfirm(addedHours);
        }
      },
    });
  }

  /**
   * 续费入口
   * @param {string} orderId - 订单ID
   * @param {number} currentDuration - 当前时长
   * @param {Function} onSuccess - 成功回调
   */
  onRenewal(orderId, currentDuration, onSuccess) {
    // 从后端获取可续费选项
    const app = getApp();
    app.request({ url: api.orders.renewalOptions(orderId) })
      .then((res) => {
        const { available_hours, max_duration } = res.data || {};

        if (!available_hours || available_hours.length === 0) {
          wx.showToast({ title: '已达到最大时长限制', icon: 'none' });
          return;
        }

        const itemList = available_hours.map(h => `续费${h}小时`);

        wx.showActionSheet({
          itemList,
          success: (res) => {
            const addedHours = available_hours[res.tapIndex];

            if (currentDuration + addedHours > max_duration) {
              wx.showToast({ title: '超过最大时长限制', icon: 'none' });
              return;
            }

            this.showRenewalConfirm(addedHours, (hours) => {
              this.processRenewalPayment(orderId, hours, onSuccess);
            });
          },
        });
      })
      .catch(() => {
        wx.showToast({ title: '获取续费选项失败', icon: 'none' });
      });
  }

  /**
   * 提交评价
   * @param {string} orderId - 订单ID
   * @param {number} rating - 评分
   * @param {string} content - 评价内容
   * @param {Array} tags - 标签数组
   * @param {Function} onSuccess - 成功回调
   */
  submitReview(orderId, rating, content, tags, onSuccess) {
    if (rating === 0) {
      wx.showToast({ title: '请先进行星级评分', icon: 'none' });
      return;
    }

    const selectedTags = tags.filter(t => t.selected).map(t => t.text);
    wx.showLoading({ title: '提交中...' });
    const app = getApp();

    app.request({
      url: api.orders.review(orderId),
      method: 'POST',
      data: { rating, content, tags: selectedTags },
    }).then(() => {
      wx.hideLoading();
      this.page.setData({ 'orderInfo.hasReviewed': true });
      wx.showToast({ title: '评价提交成功', icon: 'success' });
      if (onSuccess) onSuccess();
    }).catch((err) => {
      wx.hideLoading();
      wx.showToast({ title: err?.message || '提交失败，请重试', icon: 'none' });
    });
  }

  /**
   * 复制订单号
   * @param {string} orderNo - 订单号
   */
  onCopyOrderNo(orderNo) {
    wx.setClipboardData({
      data: orderNo,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  }

  /**
   * 取消悬赏订单
   * @param {string} orderId - 订单ID
   * @param {Function} onSuccess - 成功回调
   */
  onCancelReward(orderId, onSuccess) {
    wx.showModal({
      title: '确认取消',
      content: '取消后悬赏将下架，资金将原路退回，是否继续？',
      confirmColor: '#f44336',
      success: (res) => {
        if (res.confirm) {
          // 更新本地存储
          const rewardOrders = wx.getStorageSync('reward_orders') || [];
          const updatedOrders = rewardOrders.map(order => {
            if (order.id === orderId) {
              return {
                ...order,
                status: ORDER_STATUS.CANCELLED,
                cancelReason: '用户主动取消悬赏'
              };
            }
            return order;
          });
          wx.setStorageSync('reward_orders', updatedOrders);

          this.page.setData({ status: ORDER_STATUS.CANCELLED });
          wx.showToast({
            title: '已取消，资金将原路退回',
            icon: 'none',
            duration: 2000
          });

          if (onSuccess) onSuccess();
        }
      }
    });
  }
}

module.exports = OrderActions;
