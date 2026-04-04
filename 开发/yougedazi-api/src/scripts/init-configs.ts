/**
 * 系统配置初始化脚本
 * 
 * 运行方式：
 * npx ts-node src/scripts/init-configs.ts
 */

import { prisma } from '../lib/prisma'

// 默认系统配置
const defaultConfigs = [
  {
    key: 'switches',
    value: {
      serviceSwitches: [
        { key: 'offline_play_night', name: '深夜时段线下陪玩', enabled: true },
        { key: 'video_verification', name: '视频认证服务', enabled: true },
        { key: 'premium_service', name: '增值服务功能', enabled: true },
      ],
      featureSwitches: [
        { key: 'match_service', name: '智能匹配功能', enabled: true },
        { key: 'chat_service', name: '即时通讯功能', enabled: true },
        { key: 'payment_service', name: '支付功能', enabled: true },
      ],
      maintenanceMode: { enabled: false, notice: '', recoveryTime: null }
    },
    description: '全局开关配置'
  },
  {
    key: 'deposit',
    value: {
      rookieMax: 1,
      growthMax: 10,
      growthAmount: 99,
      matureAmount: 500
    },
    description: '保证金档位配置'
  },
  {
    key: 'c-rules',
    value: {
      orderRules: { freeCancelMinutes: 2, cancelFee: 50, minAmount: 50 },
      paymentRules: { timeout: 15 },
      reviewRules: { validDays: 7, needAudit: true }
    },
    description: 'C端规则配置'
  },
  {
    key: 'b-rules',
    value: {
      orderTimeout: 10,
      minResponseTime: 5,
      maxActiveOrders: 3
    },
    description: 'B端规则配置'
  }
]

async function initConfigs() {
  console.log('开始初始化系统配置...')

  for (const config of defaultConfigs) {
    try {
      await prisma.systemConfig.upsert({
        where: { key: config.key },
        update: {},
        create: {
          key: config.key,
          value: config.value,
          description: config.description,
          updated_by: 'system'
        }
      })
      console.log(`✅ 配置已创建/更新: ${config.key}`)
    } catch (err) {
      console.error(`❌ 配置创建失败: ${config.key}`, err)
    }
  }

  console.log('系统配置初始化完成！')
  process.exit(0)
}

initConfigs().catch(err => {
  console.error('初始化失败:', err)
  process.exit(1)
})
