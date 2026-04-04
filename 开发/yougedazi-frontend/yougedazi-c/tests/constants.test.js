/**
 * constants.js 单元测试
 *
 * 严格对照业务规范：
 * - 按钮显示规则表
 * - 取消规则
 * - 时间阈值：2分钟 / 15分钟 / 24小时
 *
 * 测试策略：
 * - 所有时间相关测试使用 jest.useFakeTimers + jest.setSystemTime
 *   确保 Date.now() 返回可预期的值，测试间互相隔离
 */

'use strict';

const {
  ORDER_STATUS,
  CANCEL_RULE,
  canCancelOrder,
  getCancelTip,
  getOrderTimeStatus,
  getPendingPaymentActions,
  getWaitingGrabActions,
  getAcceptedActions,
  getDepartedActions,
  getServingActions,
  getCompletedActions,
  checkDepositLevel,
  DEFAULT_DEPOSIT_CONFIG
} = require('../utils/constants');

// ─── 时间辅助常量 ────────────────────────────────────────────────────────────
const ONE_MIN_MS      = 60 * 1000;
const TWO_MIN_MS      = 2  * 60 * 1000;      // 120 000
const FIFTEEN_MIN_MS  = 15 * 60 * 1000;      // 900 000
const TWENTY_FOUR_H   = 24 * 60 * 60 * 1000; // 86 400 000

// 固定"当前时间"锚点，保证所有测试不受真实时钟影响
const NOW = 1_700_000_000_000; // 2023-11-14 22:13:20 UTC（任意固定值）

// ─── 辅助函数 ────────────────────────────────────────────────────────────────
/** 返回相对 NOW 偏移 offsetMs 的时间戳 */
function t(offsetMs) {
  return NOW - offsetMs;
}

/** 从按钮数组中提取 action 列表，便于断言 */
function actions(buttons) {
  return buttons.map((b) => b.action);
}

/** 从按钮数组中提取 text 列表 */
function texts(buttons) {
  return buttons.map((b) => b.text);
}

// ─── 全局 fake timer 设置 ────────────────────────────────────────────────────
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. CANCEL_RULE 常量正确性
// ════════════════════════════════════════════════════════════════════════════
describe('CANCEL_RULE 时间阈值常量', () => {
  test('TWO_MINUTES 等于 2 * 60 * 1000 ms', () => {
    expect(CANCEL_RULE.TWO_MINUTES).toBe(TWO_MIN_MS);
  });

  test('FIFTEEN_MINUTES 等于 15 * 60 * 1000 ms', () => {
    expect(CANCEL_RULE.FIFTEEN_MINUTES).toBe(FIFTEEN_MIN_MS);
  });

  test('TWENTY_FOUR_HOURS 等于 24 * 60 * 60 * 1000 ms', () => {
    expect(CANCEL_RULE.TWENTY_FOUR_HOURS).toBe(TWENTY_FOUR_H);
  });

  test('CANCEL_FEE 等于 50', () => {
    expect(CANCEL_RULE.CANCEL_FEE).toBe(50);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. canCancelOrder
// ════════════════════════════════════════════════════════════════════════════
describe('canCancelOrder(status, serviceDuration)', () => {
  // 可取消状态
  const CANCELABLE = [
    ORDER_STATUS.PENDING_PAYMENT,
    ORDER_STATUS.PENDING,
    ORDER_STATUS.WAITING_GRAB,
    ORDER_STATUS.ACCEPTED,
    ORDER_STATUS.SERVING
  ];

  CANCELABLE.forEach((status) => {
    test(`状态 "${status}" serviceDuration=0 时可取消`, () => {
      expect(canCancelOrder(status, 0)).toBe(true);
    });
  });

  test('状态 completed 不可取消', () => {
    expect(canCancelOrder(ORDER_STATUS.COMPLETED, 0)).toBe(false);
  });

  test('状态 cancelled 不可取消', () => {
    expect(canCancelOrder(ORDER_STATUS.CANCELLED, 0)).toBe(false);
  });

  test('serving 且 serviceDuration ≤15分钟 可取消', () => {
    expect(canCancelOrder(ORDER_STATUS.SERVING, FIFTEEN_MIN_MS - 1)).toBe(true);
  });

  test('serving 且 serviceDuration = 15分钟（边界）不可取消', () => {
    // elapsed > FIFTEEN_MINUTES 才不能取消，边界值等于 15min 时不可取消（> 判断）
    // 代码：serviceDuration > CANCEL_RULE.FIFTEEN_MINUTES → false → 可取消
    // 实际代码用 >，所以恰好等于 15min 时仍可取消
    expect(canCancelOrder(ORDER_STATUS.SERVING, FIFTEEN_MIN_MS)).toBe(true);
  });

  test('serving 且 serviceDuration > 15分钟 不可取消', () => {
    expect(canCancelOrder(ORDER_STATUS.SERVING, FIFTEEN_MIN_MS + 1)).toBe(false);
  });

  test('serviceDuration 缺省（undefined）时默认为0，可取消', () => {
    expect(canCancelOrder(ORDER_STATUS.SERVING)).toBe(true);
  });

  test('传入无效状态字符串时不可取消', () => {
    expect(canCancelOrder('unknown_status', 0)).toBe(false);
  });

  test('传入 null 状态时不可取消', () => {
    expect(canCancelOrder(null, 0)).toBe(false);
  });

  test('传入空字符串状态时不可取消', () => {
    expect(canCancelOrder('', 0)).toBe(false);
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
// 4. getOrderTimeStatus
// ════════════════════════════════════════════════════════════════════════════
describe('getOrderTimeStatus(orderTime)', () => {
  test('orderTime 为 null 时返回默认值（视为0分钟）', () => {
    const result = getOrderTimeStatus(null);
    expect(result.isWithin2Minutes).toBe(true);
    expect(result.isWithin15Minutes).toBe(true);
    expect(result.exceeded15Minutes).toBe(false);
    expect(result.minutesElapsed).toBe(0);
  });

  test('orderTime 为 undefined 时返回默认值', () => {
    const result = getOrderTimeStatus(undefined);
    expect(result.isWithin2Minutes).toBe(true);
    expect(result.isWithin15Minutes).toBe(true);
    expect(result.exceeded15Minutes).toBe(false);
  });

  test('orderTime 为 0 时返回默认值', () => {
    const result = getOrderTimeStatus(0);
    expect(result.isWithin2Minutes).toBe(true);
    expect(result.isWithin15Minutes).toBe(true);
    expect(result.exceeded15Minutes).toBe(false);
  });

  test('下单 1 分钟前：在2分钟内', () => {
    const result = getOrderTimeStatus(t(ONE_MIN_MS));
    expect(result.isWithin2Minutes).toBe(true);
    expect(result.isWithin15Minutes).toBe(true);
    expect(result.exceeded15Minutes).toBe(false);
    expect(result.minutesElapsed).toBe(1);
  });

  test('下单恰好 2 分钟前：不在2分钟内（边界）', () => {
    // elapsed = TWO_MIN_MS → elapsed < TWO_MIN_MS 为 false
    const result = getOrderTimeStatus(t(TWO_MIN_MS));
    expect(result.isWithin2Minutes).toBe(false);
    expect(result.isWithin15Minutes).toBe(true);
    expect(result.exceeded15Minutes).toBe(false);
  });

  test('下单 5 分钟前：在15分钟内，不在2分钟内', () => {
    const result = getOrderTimeStatus(t(5 * ONE_MIN_MS));
    expect(result.isWithin2Minutes).toBe(false);
    expect(result.isWithin15Minutes).toBe(true);
    expect(result.exceeded15Minutes).toBe(false);
    expect(result.minutesElapsed).toBe(5);
  });

  test('下单恰好 15 分钟前：超过15分钟（边界）', () => {
    // elapsed = FIFTEEN_MIN_MS → elapsed >= FIFTEEN_MIN_MS 为 true
    const result = getOrderTimeStatus(t(FIFTEEN_MIN_MS));
    expect(result.isWithin15Minutes).toBe(false);
    expect(result.exceeded15Minutes).toBe(true);
  });

  test('下单 20 分钟前：超过15分钟', () => {
    const result = getOrderTimeStatus(t(20 * ONE_MIN_MS));
    expect(result.isWithin2Minutes).toBe(false);
    expect(result.isWithin15Minutes).toBe(false);
    expect(result.exceeded15Minutes).toBe(true);
    expect(result.minutesElapsed).toBe(20);
  });

  test('minutesElapsed 使用 Math.floor（不四舍五入）', () => {
    // 经过 119 999 ms = 1.999... 分钟 → Math.floor = 1
    const result = getOrderTimeStatus(t(119_999));
    expect(result.minutesElapsed).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. getPendingPaymentActions
// ════════════════════════════════════════════════════════════════════════════
describe('getPendingPaymentActions(status, orderTime)', () => {
  test('非 pending_payment 状态返回 null', () => {
    expect(getPendingPaymentActions(ORDER_STATUS.PENDING, t(ONE_MIN_MS))).toBeNull();
    expect(getPendingPaymentActions(ORDER_STATUS.ACCEPTED, t(ONE_MIN_MS))).toBeNull();
    expect(getPendingPaymentActions(null, t(ONE_MIN_MS))).toBeNull();
  });

  // ≤2分钟：立即支付 + 取消订单 + 查看详情
  test('≤2分钟：显示"立即支付、取消订单、查看详情"', () => {
    const buttons = getPendingPaymentActions(ORDER_STATUS.PENDING_PAYMENT, t(ONE_MIN_MS));
    expect(actions(buttons)).toEqual(['pay', 'cancel', 'detail']);
    expect(texts(buttons)).toContain('立即支付');
    expect(texts(buttons)).toContain('取消订单');
    expect(texts(buttons)).toContain('查看详情');
  });

  // 刚好0分钟（刚下单）
  test('刚下单（orderTime = NOW）：≤2分钟，显示取消按钮', () => {
    const buttons = getPendingPaymentActions(ORDER_STATUS.PENDING_PAYMENT, NOW);
    expect(actions(buttons)).toContain('cancel');
  });

  // 2-15分钟：立即支付 + 查看详情（无取消）
  test('2-15分钟：显示"立即支付、查看详情"，无取消', () => {
    const buttons = getPendingPaymentActions(ORDER_STATUS.PENDING_PAYMENT, t(5 * ONE_MIN_MS));
    expect(actions(buttons)).toEqual(['pay', 'detail']);
    expect(actions(buttons)).not.toContain('cancel');
  });

  // >15分钟：只有查看详情
  test('>15分钟：仅显示"查看详情"', () => {
    const buttons = getPendingPaymentActions(ORDER_STATUS.PENDING_PAYMENT, t(20 * ONE_MIN_MS));
    expect(actions(buttons)).toEqual(['detail']);
    expect(buttons).toHaveLength(1);
  });

  // 边界：恰好2分钟（不在2分钟内，在15分钟内）→ 2-15分钟逻辑
  test('恰好2分钟前：进入2-15分钟区间，无取消', () => {
    const buttons = getPendingPaymentActions(ORDER_STATUS.PENDING_PAYMENT, t(TWO_MIN_MS));
    expect(actions(buttons)).toContain('pay');
    expect(actions(buttons)).not.toContain('cancel');
  });

  // 边界：恰好15分钟 → exceeded15Minutes = true → 只显示详情
  test('恰好15分钟前：仅显示"查看详情"', () => {
    const buttons = getPendingPaymentActions(ORDER_STATUS.PENDING_PAYMENT, t(FIFTEEN_MIN_MS));
    expect(actions(buttons)).toEqual(['detail']);
  });

  test('每个按钮都有 text、action、type 字段', () => {
    const buttons = getPendingPaymentActions(ORDER_STATUS.PENDING_PAYMENT, t(ONE_MIN_MS));
    buttons.forEach((b) => {
      expect(b).toHaveProperty('text');
      expect(b).toHaveProperty('action');
      expect(b).toHaveProperty('type');
    });
  });

  test('立即支付按钮 type 为 primary', () => {
    const buttons = getPendingPaymentActions(ORDER_STATUS.PENDING_PAYMENT, t(ONE_MIN_MS));
    const payBtn = buttons.find((b) => b.action === 'pay');
    expect(payBtn.type).toBe('primary');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. getWaitingGrabActions（等待抢单 — 悬赏单）
// ════════════════════════════════════════════════════════════════════════════
describe('getWaitingGrabActions(status, orderTime)', () => {
  test('非 waiting_grab 状态返回 null', () => {
    expect(getWaitingGrabActions(ORDER_STATUS.PENDING_PAYMENT, t(ONE_MIN_MS))).toBeNull();
    expect(getWaitingGrabActions(null, t(ONE_MIN_MS))).toBeNull();
  });

  // ≤2分钟：取消(免扣费) + 查看详情
  test('≤2分钟：显示"取消订单(免扣费)、查看详情"', () => {
    const buttons = getWaitingGrabActions(ORDER_STATUS.WAITING_GRAB, t(ONE_MIN_MS));
    expect(texts(buttons)).toContain('取消订单(免扣费)');
    expect(texts(buttons)).toContain('查看详情');
    expect(actions(buttons)).toContain('cancel');
    expect(actions(buttons)).toContain('detail');
  });

  // 2-15分钟：取消(扣50元) + 查看详情（无换一换，waiting_grab 无此按钮）
  test('2-15分钟：显示"取消订单(扣50元)、查看详情"，无"换一换"', () => {
    const buttons = getWaitingGrabActions(ORDER_STATUS.WAITING_GRAB, t(5 * ONE_MIN_MS));
    expect(texts(buttons)).toContain('取消订单(扣50元)');
    expect(texts(buttons)).toContain('查看详情');
    expect(texts(buttons)).not.toContain('换一换');
  });

  // >15分钟：只显示查看详情
  test('>15分钟：仅显示"查看详情"', () => {
    const buttons = getWaitingGrabActions(ORDER_STATUS.WAITING_GRAB, t(20 * ONE_MIN_MS));
    expect(actions(buttons)).toEqual(['detail']);
    expect(buttons).toHaveLength(1);
  });

  test('业务规范说明：waiting_grab 在2-15分钟无"换一换"按钮（区别于 pending_accept）', () => {
    // 验证等待抢单状态不出现换一换按钮
    const within2  = getWaitingGrabActions(ORDER_STATUS.WAITING_GRAB, t(ONE_MIN_MS));
    const within15 = getWaitingGrabActions(ORDER_STATUS.WAITING_GRAB, t(5 * ONE_MIN_MS));
    expect(actions(within2)).not.toContain('change');
    expect(actions(within15)).not.toContain('change');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. getAcceptedActions（已接单 — 准备中子状态）
// ════════════════════════════════════════════════════════════════════════════
describe('getAcceptedActions(status, acceptedAt)', () => {
  test('非 accepted 状态返回 null', () => {
    expect(getAcceptedActions(ORDER_STATUS.SERVING, t(ONE_MIN_MS))).toBeNull();
    expect(getAcceptedActions(ORDER_STATUS.DEPARTED, t(ONE_MIN_MS))).toBeNull();
    expect(getAcceptedActions(null, t(ONE_MIN_MS))).toBeNull();
  });

  // ≤2分钟：联系搭子 + 取消(免扣费) + 查看详情
  test('≤2分钟（准备中）：显示"联系搭子、取消订单(免扣费)、查看详情"', () => {
    const buttons = getAcceptedActions(ORDER_STATUS.ACCEPTED, t(ONE_MIN_MS));
    expect(texts(buttons)).toContain('联系搭子');
    expect(texts(buttons)).toContain('取消订单(免扣费)');
    expect(texts(buttons)).toContain('查看详情');
    expect(actions(buttons)).not.toContain('change');
  });

  // 2-15分钟：联系搭子 + 换一换 + 取消(扣50元) + 查看详情
  test('2-15分钟（准备中）：显示"联系搭子、换一换、取消订单(扣50元)、查看详情"', () => {
    const buttons = getAcceptedActions(ORDER_STATUS.ACCEPTED, t(5 * ONE_MIN_MS));
    expect(texts(buttons)).toContain('联系搭子');
    expect(texts(buttons)).toContain('换一换');
    expect(texts(buttons)).toContain('取消订单(扣50元)');
    expect(texts(buttons)).toContain('查看详情');
  });

  test('2-15分钟：action 顺序为 contact → change → cancel → detail', () => {
    const buttons = getAcceptedActions(ORDER_STATUS.ACCEPTED, t(5 * ONE_MIN_MS));
    expect(actions(buttons)).toEqual(['contact', 'change', 'cancel', 'detail']);
  });

  test('≤2分钟：action 顺序为 contact → cancel → detail', () => {
    const buttons = getAcceptedActions(ORDER_STATUS.ACCEPTED, t(ONE_MIN_MS));
    expect(actions(buttons)).toEqual(['contact', 'cancel', 'detail']);
  });

  test('联系搭子按钮 type 为 primary', () => {
    const buttons = getAcceptedActions(ORDER_STATUS.ACCEPTED, t(ONE_MIN_MS));
    const contactBtn = buttons.find((b) => b.action === 'contact');
    expect(contactBtn.type).toBe('primary');
  });

  // ≤2分钟无"换一换"
  test('≤2分钟：不显示"换一换"', () => {
    const buttons = getAcceptedActions(ORDER_STATUS.ACCEPTED, t(ONE_MIN_MS));
    expect(actions(buttons)).not.toContain('change');
  });

  // >15分钟（acceptedAt = 20分钟前）—— 代码无此分支，走 ≤2分钟默认分支
  // 测试记录此行为，方便发现潜在业务缺口
  test('>15分钟（acceptedAt超时）：代码当前走到默认分支（免扣费取消）', () => {
    const buttons = getAcceptedActions(ORDER_STATUS.ACCEPTED, t(20 * ONE_MIN_MS));
    // 代码实现：超过15分钟后不满足 "2-15分钟" 条件，进入默认 return（≤2分钟按钮）
    expect(texts(buttons)).toContain('取消订单(免扣费)');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. getDepartedActions（已接单 — 已出发子状态）
// ════════════════════════════════════════════════════════════════════════════
describe('getDepartedActions(status)', () => {
  test('非 departed 状态返回 null', () => {
    expect(getDepartedActions(ORDER_STATUS.ACCEPTED)).toBeNull();
    expect(getDepartedActions(ORDER_STATUS.SERVING)).toBeNull();
    expect(getDepartedActions(null)).toBeNull();
  });

  // 任意时间：联系搭子 + 取消(扣50元) + 查看详情
  test('已出发（任意时间）：显示"联系搭子、取消订单(扣50元)、查看详情"', () => {
    const buttons = getDepartedActions(ORDER_STATUS.DEPARTED);
    expect(texts(buttons)).toContain('联系搭子');
    expect(texts(buttons)).toContain('取消订单(扣50元)');
    expect(texts(buttons)).toContain('查看详情');
    expect(buttons).toHaveLength(3);
  });

  test('已出发：action 顺序为 contact → cancel → detail', () => {
    const buttons = getDepartedActions(ORDER_STATUS.DEPARTED);
    expect(actions(buttons)).toEqual(['contact', 'cancel', 'detail']);
  });

  test('联系搭子按钮 type 为 primary', () => {
    const buttons = getDepartedActions(ORDER_STATUS.DEPARTED);
    const contactBtn = buttons.find((b) => b.action === 'contact');
    expect(contactBtn.type).toBe('primary');
  });

  test('无论何时调用结果不变（无时间参数，幂等）', () => {
    const a = getDepartedActions(ORDER_STATUS.DEPARTED);
    const b = getDepartedActions(ORDER_STATUS.DEPARTED);
    expect(a).toEqual(b);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. getServingActions（服务中）
// ════════════════════════════════════════════════════════════════════════════
describe('getServingActions(status, serviceStartTime)', () => {
  test('非 serving 状态返回 null', () => {
    expect(getServingActions(ORDER_STATUS.ACCEPTED, t(ONE_MIN_MS))).toBeNull();
    expect(getServingActions(null, t(ONE_MIN_MS))).toBeNull();
  });

  // ≤15分钟：联系搭子 + 取消(扣50元) + 查看详情
  test('≤15分钟：显示"联系搭子、取消订单(扣50元)、查看详情"', () => {
    const buttons = getServingActions(ORDER_STATUS.SERVING, t(5 * ONE_MIN_MS));
    expect(texts(buttons)).toContain('联系搭子');
    expect(texts(buttons)).toContain('取消订单(扣50元)');
    expect(texts(buttons)).toContain('查看详情');
    expect(actions(buttons)).not.toContain('renew');
    expect(actions(buttons)).not.toContain('complete');
  });

  test('≤15分钟：action 顺序为 contact → cancel → detail', () => {
    const buttons = getServingActions(ORDER_STATUS.SERVING, t(5 * ONE_MIN_MS));
    expect(actions(buttons)).toEqual(['contact', 'cancel', 'detail']);
  });

  // >15分钟：续费 + 服务结束 + 联系搭子 + 查看详情
  test('>15分钟：显示"续费、服务结束、联系搭子、查看详情"', () => {
    const buttons = getServingActions(ORDER_STATUS.SERVING, t(20 * ONE_MIN_MS));
    expect(texts(buttons)).toContain('续费');
    expect(texts(buttons)).toContain('服务结束');
    expect(texts(buttons)).toContain('联系搭子');
    expect(texts(buttons)).toContain('查看详情');
    expect(actions(buttons)).not.toContain('cancel');
  });

  test('>15分钟：action 顺序为 renew → complete → contact → detail', () => {
    const buttons = getServingActions(ORDER_STATUS.SERVING, t(20 * ONE_MIN_MS));
    expect(actions(buttons)).toEqual(['renew', 'complete', 'contact', 'detail']);
  });

  // 边界：恰好15分钟前 → isWithin15Minutes = false → >15分钟逻辑
  test('恰好15分钟前：进入>15分钟区间，显示续费和服务结束', () => {
    const buttons = getServingActions(ORDER_STATUS.SERVING, t(FIFTEEN_MIN_MS));
    expect(actions(buttons)).toContain('renew');
    expect(actions(buttons)).toContain('complete');
  });

  // serviceStartTime 缺省：代码使用 Date.now()，elapsed ≈ 0，在≤15分钟内
  test('serviceStartTime 未传入时默认使用当前时间（elapsed ≈ 0，显示取消按钮）', () => {
    const buttons = getServingActions(ORDER_STATUS.SERVING, undefined);
    expect(actions(buttons)).toContain('cancel');
    expect(actions(buttons)).not.toContain('renew');
  });

  // >15分钟时无取消按钮（业务规范：超时不可取消）
  test('>15分钟：不显示取消按钮', () => {
    const buttons = getServingActions(ORDER_STATUS.SERVING, t(20 * ONE_MIN_MS));
    expect(actions(buttons)).not.toContain('cancel');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. getCompletedActions（已完成）
// ════════════════════════════════════════════════════════════════════════════
describe('getCompletedActions(status, completionTime)', () => {
  test('非 completed 状态返回 null', () => {
    expect(getCompletedActions(ORDER_STATUS.SERVING, t(ONE_MIN_MS))).toBeNull();
    expect(getCompletedActions(null, t(ONE_MIN_MS))).toBeNull();
  });

  // ≤24小时：评价 + 联系客服 + 查看详情
  test('≤24小时：显示评价、联系客服、查看详情', () => {
    const buttons = getCompletedActions(ORDER_STATUS.COMPLETED, t(ONE_MIN_MS * 60)); // 1小时前
    expect(texts(buttons)).toContain('提交评价');
    expect(texts(buttons)).toContain('联系客服');
    expect(texts(buttons)).toContain('查看详情');
  });

  test('≤24小时：action 顺序为 review → contact_service → detail', () => {
    const buttons = getCompletedActions(ORDER_STATUS.COMPLETED, t(ONE_MIN_MS * 60));
    expect(actions(buttons)).toEqual(['review', 'contact_service', 'detail']);
  });

  test('≤24小时：评价按钮 type 为 primary', () => {
    const buttons = getCompletedActions(ORDER_STATUS.COMPLETED, t(ONE_MIN_MS * 60));
    const reviewBtn = buttons.find((b) => b.action === 'review');
    expect(reviewBtn.type).toBe('primary');
  });

  // >24小时：联系客服 + 查看详情（无评价）
  test('>24小时：仅显示"联系客服、查看详情"，无评价', () => {
    const buttons = getCompletedActions(ORDER_STATUS.COMPLETED, t(TWENTY_FOUR_H + ONE_MIN_MS));
    expect(texts(buttons)).toContain('联系客服');
    expect(texts(buttons)).toContain('查看详情');
    expect(actions(buttons)).not.toContain('review');
  });

  test('>24小时：action 顺序为 contact_service → detail', () => {
    const buttons = getCompletedActions(ORDER_STATUS.COMPLETED, t(TWENTY_FOUR_H + ONE_MIN_MS));
    expect(actions(buttons)).toEqual(['contact_service', 'detail']);
  });

  // 边界：恰好24小时前 → isWithin24Hours = false → >24小时逻辑
  test('恰好24小时前：进入>24小时区间，无评价', () => {
    const buttons = getCompletedActions(ORDER_STATUS.COMPLETED, t(TWENTY_FOUR_H));
    expect(actions(buttons)).not.toContain('review');
  });

  // completionTime 为 null/undefined：默认超过24小时
  test('completionTime 为 null：默认超过24小时，显示"联系客服、查看详情"', () => {
    const buttons = getCompletedActions(ORDER_STATUS.COMPLETED, null);
    expect(actions(buttons)).toEqual(['contact_service', 'detail']);
    expect(actions(buttons)).not.toContain('review');
  });

  test('completionTime 为 undefined：与 null 相同', () => {
    const buttons = getCompletedActions(ORDER_STATUS.COMPLETED, undefined);
    expect(actions(buttons)).toEqual(['contact_service', 'detail']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. 业务规范缺口检查：cancelled 状态无独立函数
// ════════════════════════════════════════════════════════════════════════════
describe('业务规范缺口：cancelled 状态', () => {
  /**
   * 业务规范要求 cancelled 状态显示：
   *   再次下单、联系客服、查看详情
   *
   * 当前代码未提供 getCancelledActions 函数。
   * 以下测试记录此缺口，测试预期失败（RED），等待补充实现。
   */
  test('【缺口】应存在 getCancelledActions 函数处理已取消订单按钮', () => {
    const constants = require('../utils/constants');
    // 业务规范要求此函数存在
    expect(typeof constants.getCancelledActions).toBe('function');
  });

  test('【缺口】getCancelledActions 应返回"再次下单、联系客服、查看详情"', () => {
    const constants = require('../utils/constants');
    if (typeof constants.getCancelledActions !== 'function') {
      // 函数不存在时标记为 pending，防止误报 TypeError
      console.warn('getCancelledActions 未实现，跳过按钮内容断言');
      return;
    }
    const buttons = constants.getCancelledActions(ORDER_STATUS.CANCELLED);
    const btnActions = buttons.map((b) => b.action);
    expect(btnActions).toContain('reorder');
    expect(btnActions).toContain('contact_service');
    expect(btnActions).toContain('detail');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 12. 业务规范缺口检查：pending_accept 状态无独立函数
// ════════════════════════════════════════════════════════════════════════════
describe('业务规范缺口：pending_accept 状态按钮函数', () => {
  /**
   * 业务规范要求：
   *   pending_accept ≤2分钟：取消(免扣费) + 查看详情
   *   pending_accept 2-15分钟：换一换 + 取消(扣50元) + 查看详情
   *
   * 当前代码无 getPendingAcceptActions 函数，
   * pending_accept 按钮逻辑未集中管理。
   */
  test('【缺口】应存在 getPendingAcceptActions 函数', () => {
    const constants = require('../utils/constants');
    expect(typeof constants.getPendingAcceptActions).toBe('function');
  });

  test('【缺口】pending_accept ≤2分钟：应显示"取消订单(免扣费)、查看详情"', () => {
    const constants = require('../utils/constants');
    if (typeof constants.getPendingAcceptActions !== 'function') {
      console.warn('getPendingAcceptActions 未实现，跳过');
      return;
    }
    const buttons = constants.getPendingAcceptActions(ORDER_STATUS.PENDING, t(ONE_MIN_MS));
    expect(texts(buttons)).toContain('取消订单(免扣费)');
    expect(texts(buttons)).toContain('查看详情');
  });

  test('【缺口】pending_accept 2-15分钟：应显示"换一换、取消订单(扣50元)、查看详情"', () => {
    const constants = require('../utils/constants');
    if (typeof constants.getPendingAcceptActions !== 'function') {
      console.warn('getPendingAcceptActions 未实现，跳过');
      return;
    }
    const buttons = constants.getPendingAcceptActions(ORDER_STATUS.PENDING, t(5 * ONE_MIN_MS));
    expect(texts(buttons)).toContain('换一换');
    expect(texts(buttons)).toContain('取消订单(扣50元)');
    expect(texts(buttons)).toContain('查看详情');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 13. checkDepositLevel
// ════════════════════════════════════════════════════════════════════════════
describe('checkDepositLevel(totalOrders, depositedAmount, config)', () => {
  const cfg = DEFAULT_DEPOSIT_CONFIG; // { rookieMax:1, growthMax:10, growthAmount:99, matureAmount:500 }

  // ── 新手期 ──
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

  // ── 成长期 ──
  test('2单（成长期）且未缴纳：需缴纳 99 元', () => {
    const result = checkDepositLevel(2, 0, cfg);
    expect(result.stage).toBe('growth');
    expect(result.stageText).toBe('成长期');
    expect(result.needDeposit).toBe(true);
    expect(result.needAmount).toBe(99);
    expect(result.isFull).toBe(false);
  });

  test('成长期已缴纳 50 元：还需缴纳 49 元', () => {
    const result = checkDepositLevel(5, 50, cfg);
    expect(result.stage).toBe('growth');
    expect(result.needDeposit).toBe(true);
    expect(result.needAmount).toBe(49);
    expect(result.isFull).toBe(false);
  });

  test('成长期已缴纳 99 元（满额）：isFull=true，无需再缴', () => {
    const result = checkDepositLevel(5, 99, cfg);
    expect(result.stage).toBe('growth');
    expect(result.needDeposit).toBe(false);
    expect(result.needAmount).toBe(0);
    expect(result.isFull).toBe(true);
  });

  test('成长期已缴纳超出 99（如 150）：isFull=true', () => {
    const result = checkDepositLevel(5, 150, cfg);
    expect(result.isFull).toBe(true);
    expect(result.needAmount).toBe(0);
  });

  test('growthMax 边界（10单）：仍在成长期', () => {
    const result = checkDepositLevel(10, 0, cfg);
    expect(result.stage).toBe('growth');
  });

  // ── 成熟期 ──
  test('11单（成熟期）且未缴纳：需缴纳 500 元', () => {
    const result = checkDepositLevel(11, 0, cfg);
    expect(result.stage).toBe('mature');
    expect(result.stageText).toBe('成熟期');
    expect(result.needDeposit).toBe(true);
    expect(result.needAmount).toBe(500);
    expect(result.isFull).toBe(false);
  });

  test('成熟期已缴纳 200 元：还需 300 元', () => {
    const result = checkDepositLevel(20, 200, cfg);
    expect(result.stage).toBe('mature');
    expect(result.needAmount).toBe(300);
  });

  test('成熟期已缴纳 500 元：isFull=true', () => {
    const result = checkDepositLevel(20, 500, cfg);
    expect(result.stage).toBe('mature');
    expect(result.isFull).toBe(true);
    expect(result.needDeposit).toBe(false);
    expect(result.needAmount).toBe(0);
  });

  // ── 自定义配置 ──
  test('自定义 config 优先于 DEFAULT_DEPOSIT_CONFIG', () => {
    const customCfg = { rookieMax: 3, growthMax: 20, growthAmount: 200, matureAmount: 1000 };
    const result = checkDepositLevel(3, 0, customCfg);
    expect(result.stage).toBe('rookie'); // 3 ≤ 3
  });

  // config 缺省（使用默认值）
  test('config 缺省时使用 DEFAULT_DEPOSIT_CONFIG', () => {
    const result = checkDepositLevel(0, 0);
    expect(result.stage).toBe('rookie');
  });

  // 边界：totalOrders 为负数
  test('totalOrders 为负数：仍视为新手期', () => {
    const result = checkDepositLevel(-1, 0, cfg);
    expect(result.stage).toBe('rookie');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 14. ORDER_STATUS 常量正确性
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
