import WxPay from 'wechatpay-node-v3'
import fs from 'fs'

let instance: WxPay | null = null
let initAttempted = false

/**
 * 获取微信支付 SDK 单例
 * 返回 null 时表示支付证书未配置（开发/测试环境），调用方应自行处理降级
 */
export function getWxPayInstance(): WxPay | null {
  if (initAttempted) return instance

  initAttempted = true

  const requiredEnvVars = [
    'WX_C_APP_ID',
    'WX_MCH_ID',
    'WX_PAY_API_KEY',
    'WX_PAY_KEY_PATH',
    'WX_PAY_CERT_PATH',
    'WX_PAY_MCH_SERIAL_NO',
  ]

  const missingVars = requiredEnvVars.filter(v => !process.env[v])
  if (missingVars.length > 0) {
    console.warn(`[WxPay] 缺少环境变量: ${missingVars.join(', ')}，微信支付未启用`)
    return null
  }

  const privateKeyPath = process.env.WX_PAY_KEY_PATH!
  const certPath       = process.env.WX_PAY_CERT_PATH!

  if (!fs.existsSync(privateKeyPath)) {
    console.warn(`[WxPay] 私钥文件不存在: ${privateKeyPath}`)
    return null
  }
  if (!fs.existsSync(certPath)) {
    console.warn(`[WxPay] 证书文件不存在: ${certPath}`)
    return null
  }

  try {
    instance = new WxPay({
      appid:      process.env.WX_C_APP_ID!,
      mchid:      process.env.WX_MCH_ID!,
      privateKey: fs.readFileSync(privateKeyPath),
      publicKey:  fs.readFileSync(certPath),
      serial_no:  process.env.WX_PAY_MCH_SERIAL_NO!,
      key:        process.env.WX_PAY_API_KEY!,
    } as any)
    console.log('[WxPay] SDK 初始化成功')
    return instance
  } catch (err) {
    console.error('[WxPay] SDK 初始化失败:', err)
    return null
  }
}
