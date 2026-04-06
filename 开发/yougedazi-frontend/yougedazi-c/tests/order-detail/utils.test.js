/**
 * order-detail/modules/utils.js 单元测试
 *
 * 原则：所有计算在后端，前端只负责展示
 * - 时间格式化只处理显示格式
 * - 不涉及业务计算（计时、进度等）
 */

'use strict';

const {
  formatTime,
  formatFullDateTime,
  extractCompanionInfo,
  extractOrderInfo,
  generateTimeLine
} = require('../../pages/order-detail/modules/utils');

const { ORDER_STATUS } = require('../../utils/constants');

// ════════════════════════════════════════════════════════════════════════════
// 1. formatTime 测试
// ════════════════════════════════════════════════════════════════════════════
describe('formatTime', () => {
  test('格式化标准时间字符串', () => {
    const result = formatTime('2026-03-12T12:05:00');
    expect(result).toBe('3月12日 12:05');
  });

  test('处理空值', () => {
    expect(formatTime(null)).toBe('');
    expect(formatTime(undefined)).toBe('');
    expect(formatTime('')).toBe('');
  });

  test('处理跨天时间', () => {
    const result = formatTime('2026-12-31T23:59:00');
    expect(result).toBe('12月31日 23:59');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. formatFullDateTime 测试
// ════════════════════════════════════════════════════════════════════════════
describe('formatFullDateTime', () => {
  test('格式化完整日期时间', () => {
    const date = new Date('2026-03-12T12:05:30');
    const result = formatFullDateTime(date);
    expect(result).toBe('2026-03-12 12:05:30');
  });

  test('补零格式化', () => {
    const date = new Date('2026-01-01T01:02:03');
    const result = formatFullDateTime(date);
    expect(result).toBe('2026-01-01 01:02:03');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. extractCompanionInfo 测试
// ════════════════════════════════════════════════════════════════════════════
describe('extractCompanionInfo', () => {
  test('提取完整搭子信息', () => {
    const order = {
      companion: {
        id: 'comp_001',
        nickname: '小雨',
        avatar: '/avatar.jpg'
      }
    };
    const result = extractCompanionInfo(order, {});

    expect(result.id).toBe('comp_001');
    expect(result.nickname).toBe('小雨');
    expect(result.avatar).toBe('/avatar.jpg');
  });

  test('搭子信息缺失时使用默认值', () => {
    const order = { companion: null };
    const result = extractCompanionInfo(order, {});

    expect(result.id).toBe('');
    expect(result.nickname).toBe('等待接单');
    expect(result.avatar).toBe('/assets/images/avatar-default.png');
  });

  test('搭子字段缺失时使用默认值', () => {
    const order = { companion: {} };
    const result = extractCompanionInfo(order, {});

    expect(result.id).toBe('');
    expect(result.nickname).toBe('等待接单');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. extractOrderInfo 测试
// ════════════════════════════════════════════════════════════════════════════
describe('extractOrderInfo', () => {
  test('提取完整订单信息', () => {
    const order = {
      order_no: 'PP202603120001',
      created_at: '2026-03-12T12:00:00Z',
      service_name: '游戏搭子',
      duration: 2,
      total_amount: 20000
    };
    const acceptedLog = { created_at: '2026-03-12T12:30:00' };
    const paidRecord = { pay_time: '2026-03-12T12:05:00Z' };

    const result = extractOrderInfo(order, acceptedLog, paidRecord);

    expect(result.orderNo).toBe('PP202603120001');
    expect(result.createdAt).toBe('2026-03-12 12:00:00');
    expect(result.paidAt).toBe('2026-03-12 12:05:00');
    expect(result.serviceType).toBe('游戏搭子');
    expect(result.totalAmount).toBe(200); // 分转元
  });

  test('处理缺失的时间字段', () => {
    const order = {
      order_no: 'PP001',
      total_amount: 10000
    };
    const result = extractOrderInfo(order, null, null);

    expect(result.createdAt).toBe('');
    expect(result.paidAt).toBe('');
    expect(result.totalAmount).toBe(100);
  });

  test('金额转换为元', () => {
    const order = { total_amount: 5000 }; // 50元
    const result = extractOrderInfo(order, null, null);
    expect(result.totalAmount).toBe(50);
    expect(result.servicePrice).toBe(50);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. generateTimeLine 测试
// ════════════════════════════════════════════════════════════════════════════
describe('generateTimeLine', () => {
  const mockFormatTime = (t) => t ? t.slice(0, 16).replace('T', ' ') : '';

  test('生成完整时间轴', () => {
    const order = {
      status: ORDER_STATUS.SERVING,
      created_at: '2026-03-12T12:00:00',
      payment_records: [{ status: 'paid', pay_time: '2026-03-12T12:05:00' }],
      operation_logs: [
        { action: ORDER_STATUS.ACCEPTED, created_at: '2026-03-12T12:10:00' }
      ]
    };

    const result = generateTimeLine(order, mockFormatTime);

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].status).toBe('created');
    expect(result[1].status).toBe('paid');
  });

  test('标记当前状态节点', () => {
    const order = {
      status: ORDER_STATUS.SERVING,
      created_at: '2026-03-12T12:00:00',
      operation_logs: [
        { action: ORDER_STATUS.SERVING, created_at: '2026-03-12T12:20:00' }
      ]
    };

    const result = generateTimeLine(order, mockFormatTime);
    const currentNode = result.find(item => item.isCurrent);

    expect(currentNode).toBeDefined();
    expect(currentNode.status).toBe(ORDER_STATUS.SERVING);
  });

  test('空订单数据返回空数组', () => {
    const result = generateTimeLine({}, mockFormatTime);
    expect(result).toEqual([]);
  });
});
