/**
 * 订单服务模块 - 共享订单相关逻辑
 * 用于在多个页面中复用订单操作
 */

const api = require('./api');

/**
 * 显示取消订单确认弹窗
 * @param {string} orderId - 订单ID
 * @param {Object} options - 配置选项
 * @param {Function} options.onSuccess - 取消成功回调
 * @param {Function} options.onCancel - 用户取消回调
 */
function showCancelOrderModal(orderId, options = {}) {
  const { onSuccess, onCancel } = options;
  
  wx.showLoading({ title: '查询退款信息...' });
  
  // 调用后端取消预览接口获取准确的退款信息
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
    
    // 显示退款确认弹窗
    const refundText = refund_amount > 0 
      ? `\n\n退款金额：¥${(refund_amount / 100).toFixed(2)}`
      : '\n\n取消后无退款';
    
    wx.showModal({
      title: '确认取消订单',
      content: `${cancel_reason}${refundText}`,
      confirmText: '确认取消',
      confirmColor: '#f44336',
      success: (modalRes) => {
        if (modalRes.confirm) {
          executeCancelOrder(orderId, onSuccess);
        } else if (onCancel) {
          onCancel();
        }
      }
    });
  }).catch(err => {
    wx.hideLoading();
    const logger = require('./logger');
    logger.error(logger.Categories.ORDER, '查询退款信息失败:', err);
    wx.showToast({ 
      title: err?.message || '查询失败，请重试', 
      icon: 'none' 
    });
  });
}

/**
 * 执行取消订单操作
 * @param {string} orderId - 订单ID
 * @param {Function} onSuccess - 成功回调
 */
function executeCancelOrder(orderId, onSuccess) {
  wx.showLoading({ title: '处理中...' });
  
  const app = getApp();
  app.request({
    url: api.orders.cancel(orderId),
    method: 'POST'
  }).then(() => {
    wx.hideLoading();
    wx.showToast({ title: '取消成功', icon: 'success' });
    // 后端会通过 Socket 推送 order:status_changed，UI 自动刷新
    // 同时重新拉一次详情，保证数据最新
    setTimeout(() => {
      if (onSuccess) onSuccess();
    }, 800);
  }).catch((err) => {
    wx.hideLoading();
    wx.showToast({ title: err?.message || '取消失败，请重试', icon: 'none' });
  });
}

/**
 * 显示联系客服选项
 * @param {string} orderId - 订单ID（可选）
 */
function showCustomerServiceOptions(orderId) {
  const config = require('../config/backend-config.js');
  const itemList = ['在线客服', `客服电话 ${config.customerService.phone}`];
  
  wx.showActionSheet({
    itemList,
    success: (res) => {
      if (res.tapIndex === 1) {
        wx.makePhoneCall({ 
          phoneNumber: config.customerService.phone 
        });
      } else {
        wx.showToast({ title: '正在连接客服...', icon: 'none' });
      }
    }
  });
}

/**
 * 显示服务中取消确认（需要客服介入）
 * @param {string} orderId - 订单ID
 * @param {number} elapsedMinutes - 已服务分钟数
 * @param {Object} options - 配置选项
 */
function showServiceCancelModal(orderId, elapsedMinutes, options = {}) {
  const { onContactService } = options;
  
  wx.showModal({
    title: '确认取消订单',
    content: `服务已进行${elapsedMinutes}分钟，取消订单需要客服审核。是否联系客服处理？`,
    confirmText: '联系客服',
    cancelText: '再想想',
    success: (res) => {
      if (res.confirm) {
        showCustomerServiceOptions(orderId);
        if (onContactService) onContactService();
      }
    }
  });
}

module.exports = {
  showCancelOrderModal,
  executeCancelOrder,
  showCustomerServiceOptions,
  showServiceCancelModal
};
