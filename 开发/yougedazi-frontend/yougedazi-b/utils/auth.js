/**
 * 有个搭子 B端权限检查工具
 * 权限数据来源：后端 GET /api/b/profile，不信任本地存储
 */

/**
 * 显示保证金不足弹窗
 */
function showDepositModal(reason, onConfirm) {
  wx.showModal({
    title: '保证金缴纳提示',
    content: reason || '保证金不足，缴纳后方可接单',
    confirmText: '立即缴纳',
    cancelText: '稍后再说',
    confirmColor: '#667eea',
    success: (res) => {
      if (res.confirm && onConfirm) {
        onConfirm();
      }
    }
  });
}

/**
 * 统一的接单权限检查（查询后端，带弹窗）
 * @param {Object} options
 * @param {boolean} options.showModal      - 是否在不可接单时弹窗提示（默认true）
 * @param {Function} options.onCanAccept   - 可以接单时的回调
 * @param {Function} options.onCannotAccept - 不能接单时的回调
 */
function checkAcceptPermission(options = {}) {
  const { showModal = true, onCanAccept, onCannotAccept } = options;
  const app = getApp();

  app.request({ url: '/api/b/profile' })
    .then(res => {
      const profile = res.data || {};
      const canAccept = profile.can_accept_order !== false;

      if (canAccept) {
        if (onCanAccept) onCanAccept();
      } else {
        if (showModal) {
          showDepositModal(profile.cannot_accept_reason || '保证金不足，缴纳后方可接单', () => {
            wx.navigateTo({ url: '/pages/deposit/deposit' });
          });
        }
        if (onCannotAccept) onCannotAccept();
      }
    })
    .catch(() => {
      wx.showToast({ title: '权限校验失败，请重试', icon: 'none' });
      if (onCannotAccept) onCannotAccept();
    });
}

/**
 * 检查是否可以开始工作（异步版本，返回 Promise）
 */
function checkCanStartWork() {
  const app = getApp();
  return app.request({ url: '/api/b/profile' }).then(res => {
    const profile = res.data || {};
    return {
      canWork: profile.can_accept_order !== false,
      reason:  profile.cannot_accept_reason || '',
    };
  });
}

module.exports = {
  showDepositModal,
  checkAcceptPermission,
  checkCanStartWork,
};
