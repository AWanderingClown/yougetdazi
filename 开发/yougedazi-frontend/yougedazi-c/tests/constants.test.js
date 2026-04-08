/**
 * constants.js 单元测试
 *
 * 原则：所有计算在后端，前端只负责展示
 * - 按钮显示仅基于状态，不基于时间计算
 * - 后端返回 should_show_buttons / available_actions 等字段
 */

'use strict';

const {
  ORDER_STATUS,
  CANCEL_RULE,
  canCancelOrder,
  getCancelTip,
  getPendingPaymentActions,
  getWaitingGrabActions,
  getAcceptedActions,
  getDepartedActions,
  getServingActions,
  getCompletedActions,
  getCancelledActions,
  getPendingAcceptActions,
  checkDepositLevel,
  DEFAULT_DEPOSIT_CONFIG
} = require('../utils/constants');

// 辅助函数
function actions(buttons) {
  return buttons ? buttons.map((b) => b.action) : null;
}

function texts(buttons) {
  return buttons ? buttons.map((b) => b.text) : null;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. CANCEL_RULE 常量正确性
// ════════════════════════════════════════════════════════════════════════════
describe('CANCEL_RULE 时间阈值常量', () => {
  test('TWO_MINUTES 等于 2 * 60 * 1000 ms', () => {
    expect(CANCEL_RULE.TWO_MINUTES).toBe(2 * 60 * 1000);
  });

  test('FIFTEEN_MINUTES 等于 15 * 60 * 1000 ms', () => {
    expect(CANCEL_RULE.FIFTEEN_MINUTES).toBe(15 * 60 * 1000);
  });

  test('TWENTY_FOUR_HOURS 等于 24 * 60 * 60 * 1000 ms', () => {
    expect(CANCEL_RULE.TWENTY_FOUR_HOURS).toBe(24 * 60 * 60 * 1000);
  });

  test('CANCEL_FEE 等于 50', () => {
    expect(CANCEL_RULE.CANCEL_FEE).toBe(50);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. canCancelOrder
// ════════════════════════════════════════════════════════════════════════════
describe('canCancelOrder(status)', () => {
  const CANCELABLE = [
    ORDER_STATUS.PENDING_PAYMENT,
    ORDER_STATUS.PENDING,
    ORDER_STATUS.WAITING_GRAB,
    ORDER_STATUS.ACCEPTED,
    ORDER_STATUS.SERVING
  ];

  CANCELABLE.forEach((status) => {
    test(`状态 "${status}" 可取消`, () => {
      expect(canCancelOrder(status)).toBe(true);
    });
  });

  test('状态 completed 不可取消', () => {
    expect(canCancelOrder(ORDER_STATUS.COMPLETED)).toBe(false);
  });

  test('状态 cancelled 不可取消', () => {
    expect(canCancelOrder(ORDER_STATUS.CANCELLED)).toBe(false);
  });

  test('传入无效状态字符串时不可取消', () => {
    expect(canCancelOrder('unknown_status')).toBe(false);
  });

  test('传入 null 状态时不可取消', () => {
    expect(canCancelOrder(null)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. getCancelTip
// ════════════════════════════════════════════════════════════════════════════
describe('getCancelTip(status)', () => {
  test('pending_payment 返回未支付提示', () => {
    expect(getCancelTip(ORDER_STATUS.PENDING_PAYMENT)).toBe('订单未支付，取消后无退款');
  });

  test('pending_accept 返回全额退款提示', () => {
    expect(getCancelTip(ORDER_STATUS.PENDING)).toBe('搭子未接单，取消后将全额退款');
  });

  test('waiting_grab 返回全额退款提示', () => {
    expect(getCancelTip(ORDER_STATUS.WAITING_GRAB)).toBe('搭子未接单，取消后将全额退款');
  });

  test('accepted 返回规则预览提示', () => {
    expect(getCancelTip(ORDER_STATUS.ACCEPTED)).toBe('搭子已接单，取消规则请查看退款预览');
  });

  test('serving 返回服务中提示', () => {
    expect(getCancelTip(ORDER_STATUS.SERVING)).toBe('服务进行中，取消规则请查看退款预览');
  });

  test('未知状态返回默认提示', () => {
    const result = getCancelTip('unknown');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. 按钮函数 - 仅基于状态，不基于时间
// ════════════════════════════════════════════════════════════════════════════
describe('按钮配置函数（仅基于状态）', () => {
  test('getPendingPaymentActions: 非 pending_payment 返回 null', () => {
    expect(getPendingPaymentActions(ORDER_STATUS.PENDING)).toBeNull();
    expect(getPendingPaymentActions(null)).toBeNull();
  });

  test('getPendingPaymentActions: 返回支付、取消、详情按钮', () => {
    const buttons = getPendingPaymentActions(ORDER_STATUS.PENDING_PAYMENT);
    expect(actions(buttons)).toEqual(['pay', 'cancel', 'detail']);
  });

  test('getPendingAcceptActions: 非 pending 返回 null', () => {
    expect(getPendingAcceptActions(ORDER_STATUS.PENDING_PAYMENT)).toBeNull();
    expect(getPendingAcceptActions(null)).toBeNull();
  });

  test('getPendingAcceptActions: 返回取消、详情按钮（定向和悬赏任务均无换一换）', () => {
    const buttons = getPendingAcceptActions(ORDER_STATUS.PENDING);
    expect(actions(buttons)).toEqual(['cancel', 'detail']);
  });

  test('getWaitingGrabActions: 非 waiting_grab 返回 null', () => {
    expect(getWaitingGrabActions(ORDER_STATUS.PENDING_PAYMENT)).toBeNull();
    expect(getWaitingGrabActions(null)).toBeNull();
  });

  test('getWaitingGrabActions: 返回取消、详情按钮', () => {
    const buttons = getWaitingGrabActions(ORDER_STATUS.WAITING_GRAB);
    expect(actions(buttons)).toEqual(['cancel', 'detail']);
  });

  test('getAcceptedActions: 非 accepted 返回 null', () => {
    expect(getAcceptedActions(ORDER_STATUS.SERVING)).toBeNull();
    expect(getAcceptedActions(null)).toBeNull();
  });

  test('getAcceptedActions: 悬赏任务返回联系、换一换、取消、详情按钮', () => {
    const buttons = getAcceptedActions(ORDER_STATUS.ACCEPTED, 'reward');
    expect(actions(buttons)).toEqual(['chat', 'change', 'cancel', 'detail']);
  });

  test('getAcceptedActions: 定向任务返回联系、取消、详情按钮（无换一换）', () => {
    const buttons = getAcceptedActions(ORDER_STATUS.ACCEPTED, 'direct');
    expect(actions(buttons)).toEqual(['chat', 'cancel', 'detail']);
  });

  test('getDepartedActions: 非 departed 返回 null', () => {
    expect(getDepartedActions(ORDER_STATUS.SERVING)).toBeNull();
    expect(getDepartedActions(null)).toBeNull();
  });

  test('getDepartedActions: 返回联系、取消、详情按钮', () => {
    const buttons = getDepartedActions(ORDER_STATUS.DEPARTED);
    expect(actions(buttons)).toEqual(['chat', 'cancel', 'detail']);
  });

  test('getServingActions: 非 serving 返回 null', () => {
    expect(getServingActions(ORDER_STATUS.ACCEPTED)).toBeNull();
    expect(getServingActions(null)).toBeNull();
  });

  test('getServingActions: 返回联系、取消、详情按钮', () => {
    const buttons = getServingActions(ORDER_STATUS.SERVING);
    expect(actions(buttons)).toEqual(['chat', 'cancel', 'detail']);
  });

  test('getCompletedActions: 非 completed 返回 null', () => {
    expect(getCompletedActions(ORDER_STATUS.SERVING)).toBeNull();
    expect(getCompletedActions(null)).toBeNull();
  });

  test('getCompletedActions: 返回评价、联系客服、详情按钮', () => {
    const buttons = getCompletedActions(ORDER_STATUS.COMPLETED);
    expect(actions(buttons)).toEqual(['review', 'contact_service', 'detail']);
  });

  test('getCancelledActions: 非 cancelled 返回 null', () => {
    expect(getCancelledActions(ORDER_STATUS.SERVING)).toBeNull();
    expect(getCancelledActions(null)).toBeNull();
  });

  test('getCancelledActions: 返回再次下单、联系客服、详情按钮', () => {
    const buttons = getCancelledActions(ORDER_STATUS.CANCELLED);
    expect(actions(buttons)).toEqual(['reorder', 'contact_service', 'detail']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. checkDepositLevel
// ════════════════════════════════════════════════════════════════════════════
describe('checkDepositLevel(totalOrders, depositedAmount, config)', () => {
  const cfg = DEFAULT_DEPOSIT_CONFIG;

  test('0单（新手期）：无需保证金，isFull=true', () => {
    const result = checkDepositLevel(0, 0, cfg);
    expect(result.stage).toBe('rookie');
    expect(result.stageText).toBe('新手期');
    expect(result.needDeposit).toBe(false);
    expect(result.needAmount).toBe(0);
    expect(result.isFull).toBe(true);
  });

  test('1单（rookieMax 边界，新手期）：无需保证金', () => {
    const result = checkDepositLevel(1, 0, cfg);
    expect(result.stage).toBe('rookie');
    expect(result.needDeposit).toBe(false);
  });

  test('2单（成长期）且未缴纳：需缴纳 99 元', () => {
    const result = checkDepositLevel(2, 0, cfg);
    expect(result.stage).toBe('growth');
    expect(result.stageText).toBe('成长期');
    expect(result.needDeposit).toBe(true);
    expect(result.needAmount).toBe(99);
    expect(result.isFull).toBe(false);
  });

  test('成长期已缴纳 99 元（满额）：isFull=true，无需再缴', () => {
    const result = checkDepositLevel(5, 99, cfg);
    expect(result.stage).toBe('growth');
    expect(result.needDeposit).toBe(false);
    expect(result.needAmount).toBe(0);
    expect(result.isFull).toBe(true);
  });

  test('11单（成熟期）且未缴纳：需缴纳 500 元', () => {
    const result = checkDepositLevel(11, 0, cfg);
    expect(result.stage).toBe('mature');
    expect(result.stageText).toBe('成熟期');
    expect(result.needDeposit).toBe(true);
    expect(result.needAmount).toBe(500);
    expect(result.isFull).toBe(false);
  });

  test('成熟期已缴纳 500 元：isFull=true', () => {
    const result = checkDepositLevel(20, 500, cfg);
    expect(result.stage).toBe('mature');
    expect(result.isFull).toBe(true);
    expect(result.needDeposit).toBe(false);
    expect(result.needAmount).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. ORDER_STATUS 常量正确性
// ════════════════════════════════════════════════════════════════════════════
describe('ORDER_STATUS 常量', () => {
  test('PENDING_PAYMENT = "pending_payment"', () => {
    expect(ORDER_STATUS.PENDING_PAYMENT).toBe('pending_payment');
  });

  test('PENDING = "pending_accept"（待接单）', () => {
    expect(ORDER_STATUS.PENDING).toBe('pending_accept');
  });

  test('ACCEPTED = "accepted"', () => {
    expect(ORDER_STATUS.ACCEPTED).toBe('accepted');
  });

  test('SERVING = "serving"', () => {
    expect(ORDER_STATUS.SERVING).toBe('serving');
  });

  test('COMPLETED = "completed"', () => {
    expect(ORDER_STATUS.COMPLETED).toBe('completed');
  });

  test('CANCELLED = "cancelled"', () => {
    expect(ORDER_STATUS.CANCELLED).toBe('cancelled');
  });

  test('WAITING_GRAB = "waiting_grab"', () => {
    expect(ORDER_STATUS.WAITING_GRAB).toBe('waiting_grab');
  });

  test('DEPARTED = "departed"（已出发子状态）', () => {
    expect(ORDER_STATUS.DEPARTED).toBe('departed');
  });
});
