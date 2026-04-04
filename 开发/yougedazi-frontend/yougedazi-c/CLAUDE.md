# 有个搭子 - C端（用户端）微信小程序

## 项目简介
线下陪玩搭子平台的用户端微信小程序。用户可以浏览搭子、下单、支付、聊天、评价。

## 核心约束（必须遵守）

### 修改前必须做的
1. 只能修改指定的文件，其他文件一律不许动
2. 修改前必须列出要改的文件清单，等用户确认后再编码
3. 不要删除现有代码（只能新增或修改）
4. 不要修改全局样式（app.wxss）

### 颜色规范（严格执行）
```css
/* 主色调 - 所有按钮、标题、重点元素 */
linear-gradient(135deg, #7d67ea 0%, #9a59b8 100%)
/* 单色场景 */
#7d67ea

/* 功能色 */
成功：#10b981  警告：#f59e0b  危险：#ef4444  信息：#3b82f6
```
**禁止使用其他紫色或蓝色作为主色！**

### 微信小程序技术约束
- 修改数据必须用 `this.setData({})`
- 不支持 `*` 选择器
- 不支持 `...` 展开运算符
- 文件编码：UTF-8，无BOM头

### 字段命名映射（新旧对照）
| 旧字段 | 新字段 | 说明 |
|--------|--------|------|
| `orderId` | `id` | 订单ID |
| `totalPrice` | `totalAmount` | 总价 |
| `createTime` | `createdAt` | 创建时间 |
| `orderStatus` | `status` | 订单状态 |
| `serviceName` | `serviceType` | 服务类型 |

### 订单状态（6个）
`pending_payment` → `pending_accept` → `accepted`(preparing/departed) → `serving` → `completed` / `cancelled`

### 未实现的API（不要调用）
- `GET /api/b/profile/status`
- `POST /api/b/workbench/toggle-online`
- `GET /api/b/workbench/services`
- `PUT /api/b/workbench/services/:id`
- `GET /api/b/notifications/unread-count`

## 业务规范
开发前必须阅读（位于项目根目录 `项目规范/` 下）：
- **必读**：`AI协作规范.md` + `通用技术规范.md` + `C端业务规范.md`

关键业务规则速查：
- 聊天权限：已支付+订单未完成才能聊天
- 服务结束按钮：仅服务中>15分钟时显示
- 取消订单：≤2分钟免费，2-15分钟扣50元，>15分钟不可取消
- 换一换：仅悬赏单，无限次数
- 倒计时：服务器计算，与前端状态无关

## 提交前检查
- [ ] `git status` 确认只改了预期的文件
- [ ] 没有AI产生的垃圾文件
- [ ] 数据修改用了 `this.setData({})`
- [ ] 颜色使用正确（渐变紫色）
- [ ] 字段名使用新命名（id, totalAmount, status等）
