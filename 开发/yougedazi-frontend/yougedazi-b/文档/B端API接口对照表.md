# 有个搭子 B端 API接口对照速查表

## 📋 接口总览

| 模块 | 接口数量 | 前端页面 | 后端路由文件 |
|-----|---------|---------|-------------|
| 登录授权 | 3 | login.js | auth/index.ts |
| 工作台 | 4 | workbench.js | b/workbench.ts |
| 订单管理 | 8 | b-order-list.js, b-order-detail.js, task-square.js | b/orders.ts |
| 收益提现 | 4 | earnings.js, withdraw.js | b/earnings.ts |
| 个人中心 | 3 | profile.js, register.js | b/profile.ts |
| 消息通知 | 5 | message.js | b/notifications.ts |

---

## 🔐 登录授权模块

| 功能 | 方法 | 后端端点 | 前端调用位置 | 请求参数 | 响应数据 |
|-----|------|---------|------------|---------|---------|
| 微信登录 | POST | `/api/auth/wx-login` | login.js:132 | `{code, role: 'companion', nickname?, avatar?}` | `{access_token, refresh_token, id}` |
| Token刷新 | POST | `/api/auth/refresh` | app.js:111 | `{refresh_token}` | `{access_token, refresh_token}` |
| 审核状态 | GET | `/api/b/profile/status` | 需完善 | - | `{audit_status, reject_reason, has_profile}` |

---

## 🏠 工作台模块

| 功能 | 方法 | 后端端点 | 前端调用位置 | 请求参数 | 响应数据 |
|-----|------|---------|------------|---------|---------|
| 工作台首页 | GET | `/api/b/workbench` | workbench.js:279 | - | `{status, profile, today_stats, ongoing_order, services}` |
| 切换在线 | POST | `/api/b/workbench/toggle-online` | 需对接 | `{is_online: boolean}` | `{is_online, message}` |
| 服务列表 | GET | `/api/b/workbench/services` | 需对接 | - | `{services: []}` |
| 更新服务 | PUT | `/api/b/workbench/services/:id` | 需对接 | `{hourly_price?, min_duration?, is_active?, description?}` | `{service}` |

### 工作台数据字段对照

```typescript
// 后端返回数据结构
{
  status: {
    is_online: boolean,      // 对应前端 isWorking
    is_working: boolean      // 是否有进行中订单
  },
  profile: {
    nickname: string,
    avatar: string,
    rating: number,          // 评分
    total_orders: number,    // 历史总订单
    deposit_level: string    // 保证金档位
  },
  today_stats: {
    order_count: number,     // 今日订单数
    earnings: number         // 今日收益（分）
  },
  ongoing_order: {
    id: string,
    order_no: string,
    service_name: string,
    remaining_minutes: number,
    total_amount: number     // 订单金额（分）
  },
  services: [
    {
      service_id: string,
      name: string,
      hourly_price: number,  // 时薪（分）
      is_active: boolean     // 是否上架
    }
  ]
}
```

---

## 📦 订单管理模块

| 功能 | 方法 | 后端端点 | 前端调用位置 | 请求参数 | 响应数据 |
|-----|------|---------|------------|---------|---------|
| 订单列表 | GET | `/api/b/orders` | b-order-list.js:43 | `?status&page&page_size` | `{list, total, page, page_size, has_more}` |
| 抢单列表 | GET | `/api/b/orders/grab` | task-square.js:45 | - | `{list: [{id, order_no, service_name, ...}]}` |
| 订单详情 | GET | `/api/b/orders/:id` | b-order-detail.js:140 | - | Order完整对象 |
| 接单 | POST | `/api/b/orders/:id/accept` | b-order-detail.js:363 | - | `{order}` |
| 抢单 | POST | `/api/b/orders/:id/grab` | task-square.js:199 | - | `{order}` |
| 开始服务 | POST | `/api/b/orders/:id/start` | b-order-detail.js:430 | - | `{order}` |
| 完成服务 | POST | `/api/b/orders/:id/complete` | b-order-detail.js:588 | - | null |
| 服务倒计时 | GET | `/api/b/orders/:id/timer` | workbench.js:231 | - | `{remaining_seconds}` |

### 订单状态流转图

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  pending    │────▶│  accepted   │────▶│   serving   │
│  (待接单)   │     │  (已接单)   │     │  (服务中)   │
└─────────────┘     └─────────────┘     └──────┬──────┘
       │                                         │
       │                                         ▼
       │                                  ┌─────────────┐
       │                                  │  completed  │
       │                                  │  (已完成)   │
       │                                  └─────────────┘
       │
       ▼
┌─────────────┐
│  cancelled  │
│  (已取消)   │
└─────────────┘
```

### 订单状态常量对照

| 常量名 | 后端值 | 前端显示 | 颜色 |
|-------|-------|---------|------|
| PENDING_PAYMENT | 'pending_payment' | '待支付' | warning |
| PENDING | 'pending_accept' | '待接单' | warning |
| WAITING_GRAB | 'waiting_grab' | '等待抢单' | warning |
| ACCEPTED | 'accepted' | '已接单' | primary |
| SERVING | 'serving' | '服务中' | success |
| COMPLETED | 'completed' | '已完成' | info |
| CANCELLED | 'cancelled' | '已取消' | danger |

---

## 💰 收益提现模块

| 功能 | 方法 | 后端端点 | 前端调用位置 | 请求参数 | 响应数据 |
|-----|------|---------|------------|---------|---------|
| 收益概览 | GET | `/api/b/earnings` | earnings.js:61 | - | `{today, this_week, this_month, total, withdrawable}` |
| 收益明细 | GET | `/api/b/earnings/records` | earnings.js:63 | `?page&page_size&start_date&end_date&type` | `{list, total, has_more}` |
| 保证金状态 | GET | `/api/b/deposit` | 需对接 | - | `{current_level, deposit_amount, max_order_amount, upgrade_options}` |
| 申请提现 | POST | `/api/b/earnings/withdraw` | withdraw.js:56 | `{amount, method}` | `{withdrawal_id, status}` |
| 提现记录 | GET | `/api/b/earnings/withdraw-records` | 需对接 | `?page&page_size` | `{list, total, has_more}` |

### 收益类型对照

| 类型 | 后端值 | 说明 |
|-----|-------|------|
| 订单收入 | 'order_income' | 服务完成后的收入 |
| 奖励 | 'bonus' | 平台奖励 |
| 处罚 | 'penalty' | 违规处罚 |
| 退款 | 'refund' | 退款 |

### 金额单位说明

> ⚠️ **重要**: 后端存储金额单位为**分**，前端显示需要除以100

```javascript
// 后端返回: 25600 (分)
// 前端显示: ¥256.00
const displayAmount = (backendAmount / 100).toFixed(2);
```

---

## 👤 个人中心模块

| 功能 | 方法 | 后端端点 | 前端调用位置 | 请求参数 | 响应数据 |
|-----|------|---------|------------|---------|---------|
| 完整资料 | GET | `/api/b/profile` | auth.js:35 | - | `{id, nickname, avatar, ..., can_accept_order}` |
| 注册提交 | POST | `/api/b/profile/register` | register.js:245 | `{nickname, avatar, gender, age, city, real_name, id_card_no, id_card_front, id_card_back, skills, bio}` | `{id, audit_status}` |
| 审核状态 | GET | `/api/b/profile/status` | login.js | - | `{audit_status, reject_reason, has_profile}` |

### 审核状态对照

| 状态值 | 显示文本 | 说明 |
|-------|---------|------|
| 'pending' | '审核中' | 提交审核后 |
| 'approved' | '已通过' | 审核通过，可接单 |
| 'rejected' | '已拒绝' | 审核拒绝，需重新提交 |

### 保证金档位对照

| 档位 | 后端值 | 条件 | 限制 |
|-----|-------|------|------|
| 新手期 | 'rookie' | 0-1单 | 免保证金，最多1单 |
| 成长期 | 'growth' | 2-10单 | 需缴纳¥99，最多10单 |
| 成熟期 | 'mature' | 10单以上 | 需累计缴纳¥500 |

---

## 🔔 消息通知模块

| 功能 | 方法 | 后端端点 | 前端调用位置 | 请求参数 | 响应数据 |
|-----|------|---------|------------|---------|---------|
| 通知列表 | GET | `/api/b/notifications` | message.js | `?page&page_size&is_read` | `{list, total, has_more}` |
| 标记已读 | POST | `/api/b/notifications/:id/read` | 需对接 | - | null |
| 全部已读 | POST | `/api/b/notifications/read-all` | 需对接 | - | `{updated_count}` |
| 未读数 | GET | `/api/b/notifications/unread-count` | 需对接 | - | `{count}` |
| 公告列表 | GET | `/api/b/announcements` | 需对接 | - | `{list}` |

### 通知类型对照

| 类型 | 后端值 | 说明 | 前端图标 |
|-----|-------|------|---------|
| 新订单 | 'order' | 新订单提醒 | 📦 |
| 收益 | 'order_income' | 收益到账 | 💰 |
| 系统 | 'system' | 系统公告 | 📢 |
| 审核 | 'audit' | 审核结果 | 📝 |

---

## 🔌 Socket.IO 实时推送

### 连接配置

```javascript
// app.js
const socket = io('wss://api.ppmate.com', {
  auth: { token: 'Bearer xxx' }
});
```

### 事件对照表

| 事件名 | 方向 | 来源 | 处理页面 | 说明 |
|-------|-----|------|---------|------|
| `order:new` | 接收 | 后端 | workbench.js | 新指定单推送 |
| `order:new_reward` | 接收 | 后端 | workbench.js | 新悬赏单推送 |
| `order:status_changed` | 接收 | 后端 | b-order-detail.js | 订单状态变更 |
| `message:new` | 接收 | 后端 | message.js | 新聊天消息 |
| `notification:new` | 接收 | 后端 | message.js | 新系统通知 |
| `join:order` | 发送 | 前端 | b-order-detail.js | 进入订单详情 |
| `leave:order` | 发送 | 前端 | b-order-detail.js | 离开订单详情 |

### Socket事件数据结构

```typescript
// order:new
{
  orderId: string,
  orderNo: string,
  serviceName: string,
  duration: number,
  totalAmount: number,
  userInfo: {
    nickname: string,
    avatar: string
  }
}

// order:status_changed
{
  orderId: string,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  message?: string
}

// message:new
{
  session_id: string,
  content: string,
  type: 'text' | 'image',
  created_at: string
}
```

---

## ⚠️ 常见问题

### Q1: 前端调用接口返回404
**原因**: 路径拼写错误  
**解决**: 检查是否使用了正确的路径前缀 `/api/b/`

### Q2: 金额显示不正确
**原因**: 单位转换错误  
**解决**: 后端返回分，前端需要除以100

### Q3: Token过期后未自动刷新
**原因**: 自动刷新逻辑异常  
**解决**: 检查`app.js`中的`_refreshToken`方法和`request`封装

### Q4: Socket.IO连接失败
**原因**: 网络问题或token无效  
**解决**: 检查`pushServerUrl`配置和token有效期

---

## 📊 接口状态汇总

| 接口 | 状态 | 优先级 | 备注 |
|-----|------|-------|------|
| POST /api/auth/wx-login | ✅ | - | 正常 |
| POST /api/auth/refresh | ✅ | - | 正常 |
| GET /api/b/workbench | ✅ | - | 正常 |
| POST /api/b/workbench/toggle-online | ✅ | P1 | 前端需对接 |
| GET /api/b/orders | ✅ | - | 正常 |
| GET /api/b/orders/grab | ✅ | P0 | 前端路径错误 |
| POST /api/b/orders/:id/grab | ✅ | P0 | 前端路径错误 |
| GET /api/b/orders/:id/timer | ⚠️ | P0 | 后端需添加 |
| GET /api/b/earnings | ✅ | - | 正常 |
| POST /api/b/earnings/withdraw | ⚠️ | P1 | 后端需添加 |
| GET /api/b/profile | ⚠️ | P1 | 后端需添加 |
| GET /api/b/notifications | ✅ | P2 | 前端需对接 |

---

**文档版本**: v1.0  
**更新日期**: 2026-03-26  
**维护者**: Kimi Code CLI
