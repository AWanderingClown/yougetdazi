/**
 * 数据库初始化脚本
 * 运行：npx tsx --env-file=.env prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('开始初始化数据库...')

  // ── 1. 插入超级管理员账号 ──────────────────────────────────────
  const username = 'admin'
  const plainPassword = 'admin123456'

  const existing = await prisma.adminUser.findUnique({ where: { username } })

  if (existing) {
    console.log(`Admin 账号 "${username}" 已存在，跳过创建。`)
  } else {
    const passwordHash = await bcrypt.hash(plainPassword, 12)
    const admin = await prisma.adminUser.create({
      data: {
        username,
        password:     passwordHash,
        role:         'super_admin',
        display_name: '超级管理员',
        is_active:    true,
      },
    })
    console.log(`✓ Admin 账号创建成功：`)
    console.log(`  ID       : ${admin.id}`)
    console.log(`  用户名   : ${admin.username}`)
    console.log(`  密码     : ${plainPassword}`)
    console.log(`  角色     : ${admin.role}`)
  }

  // ── 2. 插入平台基础配置 ───────────────────────────────────────
  const configs = [
    {
      config_key:   'order_timeout',
      config_value: { payment_minutes: 15, accept_minutes: 15 },
      description:  '订单超时配置（分钟）：payment_minutes=支付超时，accept_minutes=接单超时',
    },
    {
      config_key:   'fee_rate',
      config_value: { value: 0.2 },
      description:  '平台抽成比例（小数，0.2 = 20%），超级管理员/运营可修改',
    },
    {
      config_key:   'deposit_rules',
      config_value: {
        levels: [
          { level: 'none',    amount: 0,     max_orders: 3,    description: '未缴保证金，每日最多接 3 单' },
          { level: 'basic',   amount: 20000, max_orders: 10,   description: '缴纳 200 元，每日最多接 10 单' },
          { level: 'premium', amount: 50000, max_orders: null, description: '缴纳 500 元，无限接单' },
        ],
      },
      description:  '保证金档位规则（amount 单位为分，max_orders 为 null 表示无限制），超级管理员/运营可修改',
    },
  ]

  for (const cfg of configs) {
    await prisma.platformConfig.upsert({
      where:  { config_key: cfg.config_key },
      update: {},
      create: cfg,
    })
    console.log(`✓ 平台配置 "${cfg.config_key}" 已就绪`)
  }

  console.log('\n初始化完成！')
}

main()
  .catch((e) => {
    console.error('初始化失败：', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
