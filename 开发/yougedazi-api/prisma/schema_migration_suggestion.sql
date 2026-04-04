-- ============================================================
-- PP-Mate API Schema 修改建议
-- 用于支持新实现的 API 功能
-- ============================================================

-- 1. 添加 Companion 表字段（用于 C 端陪玩师列表/详情展示）
-- 这些字段在 API 中被引用，但数据库模型中不存在

ALTER TABLE companions 
ADD COLUMN IF NOT EXISTS city VARCHAR(50),
ADD COLUMN IF NOT EXISTS age INTEGER CHECK (age >= 18 AND age <= 60),
ADD COLUMN IF NOT EXISTS bio TEXT;

-- 2. OrderRenewal 表字段扩展（用于续费支付状态追踪）
-- 当前只有基础字段，建议添加以下字段以支持完整状态管理

-- 方案 A: 在 order_renewals 表添加状态字段（推荐）
-- 需要创建枚举类型
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'renewal_status') THEN
        CREATE TYPE renewal_status AS ENUM ('pending', 'paid', 'failed');
    END IF;
END$$;

ALTER TABLE order_renewals
ADD COLUMN IF NOT EXISTS status renewal_status DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(64),
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_order_renewals_status ON order_renewals(status);
CREATE INDEX IF NOT EXISTS idx_order_renewals_transaction_id ON order_renewals(transaction_id);

-- 3. 添加订单续费关联字段（可选）
-- 如果需要在订单表中直接追踪总续费次数和金额

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS renewal_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS renewal_amount INTEGER DEFAULT 0;  -- 单位：分

-- 4. 添加陪玩师统计字段（可选，用于缓存统计）
-- 如果需要在 companions 表中缓存统计数据

ALTER TABLE companions
ADD COLUMN IF NOT EXISTS today_order_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS today_earnings INTEGER DEFAULT 0;  -- 单位：分

-- ============================================================
-- 回滚 SQL（如需要）
-- ============================================================
/*
-- 回滚 companions 添加的字段
ALTER TABLE companions 
DROP COLUMN IF EXISTS city,
DROP COLUMN IF EXISTS age,
DROP COLUMN IF EXISTS bio,
DROP COLUMN IF EXISTS today_order_count,
DROP COLUMN IF EXISTS today_earnings;

-- 回滚 order_renewals 添加的字段
ALTER TABLE order_renewals
DROP COLUMN IF EXISTS status,
DROP COLUMN IF EXISTS transaction_id,
DROP COLUMN IF EXISTS paid_at;

-- 回滚 orders 添加的字段
ALTER TABLE orders
DROP COLUMN IF EXISTS renewal_count,
DROP COLUMN IF EXISTS renewal_amount;

-- 删除枚举类型
DROP TYPE IF EXISTS renewal_status;
*/
