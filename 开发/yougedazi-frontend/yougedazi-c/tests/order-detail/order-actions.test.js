/**
 * order-detail/modules/order-actions.js 单元测试
 */

'use strict';

const OrderActions = require('../../pages/order-detail/modules/order-actions');
const { ORDER_STATUS } = require('../../utils/constants');

// Mock app
const mockAppRequest = jest.fn(() => Promise.resolve({ data: {} }));
global.getApp = jest.fn(() => ({
  request: mockAppRequest
}));

// Mock wx
global.wx = {
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  showToast: jest.fn(),
  showModal: jest.fn(),
  showActionSheet: jest.fn(),
  requestPayment: jest.fn(),
  setClipboardData: jest.fn(),
  setStorageSync: jest.fn(),
  getStorageSync: jest.fn()
};

jest.mock('../../utils/api', () => ({
  orders: {
    pay: jest.fn((id) => `/api/c/orders/${id}/pay`),
    cancel: jest.fn((id) => `/api/c/orders/${id}/cancel`),
    complete: jest.fn((id) => `/api/c/orders/${id}/complete`),
    urge: jest.fn((id) => `/api/c/orders/${id}/urge`),
    review: jest.fn((id) => `/api/c/orders/${id}/review`)
  }
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  Categories: { ORDER: 'order' }
}));

function createMockPage() {
  return {
    data: {
      id: 'order_001',
      status: ORDER_STATUS.PENDING_PAYMENT,
      orderInfo: {},
      showUrgeToast: false
    },
    setData: jest.fn(function(data) {
      Object.assign(this.data, data);
    })
  };
}

describe('OrderActions', () => {
  let mockPage;
  let orderActions;

  beforeEach(() => {
    mockPage = createMockPage();
    orderActions = new OrderActions(mockPage);
    jest.clearAllMocks();
    mockAppRequest.mockReset();
    mockAppRequest.mockResolvedValue({ data: {} });
  });

  describe('constructor', () => {
    test('正确初始化 page 引用', () => {
      expect(orderActions.page).toBe(mockPage);
    });
  });

  describe('onPay', () => {
    test('发起支付请求', async () => {
      mockAppRequest.mockResolvedValueOnce({
        data: { payment_params: { timeStamp: '123', nonceStr: 'abc' } }
      });
      wx.requestPayment.mockImplementation(({ success }) => success && success());

      orderActions.onPay('order_001', jest.fn());
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(wx.showLoading).toHaveBeenCalledWith({ title: '获取支付信息...' });
    });

    test('支付成功触发回调', async () => {
      const onSuccess = jest.fn();
      mockAppRequest.mockResolvedValueOnce({ data: { payment_params: {} } });
      wx.requestPayment.mockImplementation(({ success }) => success && success());

      orderActions.onPay('order_001', onSuccess);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(wx.showToast).toHaveBeenCalledWith({ title: '支付成功', icon: 'success' });
    });

    test('支付失败显示错误', async () => {
      mockAppRequest.mockResolvedValueOnce({ data: { payment_params: {} } });
      wx.requestPayment.mockImplementation(({ fail }) => fail && fail({ errMsg: 'fail' }));

      orderActions.onPay('order_001', jest.fn());
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(wx.showToast).toHaveBeenCalledWith({ title: '支付失败', icon: 'none' });
    });
  });

  describe('executeCancel', () => {
    test('执行取消并触发回调', async () => {
      mockAppRequest.mockResolvedValueOnce({});

      orderActions.executeCancel('order_001', jest.fn());
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(wx.showToast).toHaveBeenCalledWith({ title: '取消成功', icon: 'success' });
    });
  });

  describe('autoCancelOrder', () => {
    test('自动取消更新页面状态', () => {
      orderActions.autoCancelOrder(jest.fn());

      expect(mockPage.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ORDER_STATUS.CANCELLED
        })
      );
    });
  });

  describe('onUrge', () => {
    test('发送催促请求', () => {
      mockPage.data.showUrgeToast = false;
      orderActions.onUrge('order_001');

      expect(mockPage.setData).toHaveBeenCalledWith({ showUrgeToast: true });
      expect(wx.showToast).toHaveBeenCalledWith({ title: '已提醒搭子加快进度', icon: 'none', duration: 2000 });
    });

    test('防止重复催促', () => {
      mockPage.data.showUrgeToast = true;
      mockAppRequest.mockClear();

      orderActions.onUrge('order_001');

      expect(mockAppRequest).not.toHaveBeenCalled();
    });
  });

  describe('submitReview', () => {
    test('提交评价', async () => {
      const tags = [{ text: '服务态度好', selected: true }];
      mockAppRequest.mockResolvedValueOnce({});

      orderActions.submitReview('order_001', 5, '非常好', tags, jest.fn());
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockAppRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: expect.objectContaining({ rating: 5 })
        })
      );
    });

    test('未评分时提示', () => {
      orderActions.submitReview('order_001', 0, '', [], jest.fn());
      expect(wx.showToast).toHaveBeenCalledWith({ title: '请先进行星级评分', icon: 'none' });
    });
  });

  describe('onCopyOrderNo', () => {
    test('复制订单号到剪贴板', () => {
      wx.setClipboardData.mockImplementation(({ success }) => success && success());

      orderActions.onCopyOrderNo('PP202603120001');

      expect(wx.setClipboardData).toHaveBeenCalledWith(expect.objectContaining({ data: 'PP202603120001' }));
    });
  });
});
