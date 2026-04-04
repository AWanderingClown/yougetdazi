import { prisma } from '../lib/prisma'
import { getWxPayInstance } from '../lib/wxpay'

/**
 * PaymentService
 *
 * 职责：
 * 1. 发起微信预支付（JSAPI）
 * 2. 发起退款（退款结果由 webhook 回调异步更新）
 *
 * 注意：
 * - 所有金额单位：分（整数），禁止浮点数
 * - 退款金额服务端计算，不信任任何外部输入
 */
export class PaymentService {
  /**
   * 创建微信预支付订单
   * 返回前端调起支付所需的参数包
   */
  async createWxPayOrder(params: {
    outTradeNo:  string
    description: string
    amount:      number        // 分
    openid:      string
    notifyUrl:   string
  }) {
    const wxpay = getWxPayInstance()

    if (!wxpay) {
      // 开发/测试环境：返回 mock 数据，不调用真实接口
      console.warn('[PaymentService] 微信支付未配置，返回 mock 预支付参数')
      return {
        prepay_id: `mock_${params.outTradeNo}`,
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr:  crypto.randomUUID().replace(/-/g, ''),
        package:   `prepay_id=mock_${params.outTradeNo}`,
        signType:  'RSA' as const,
        paySign:   'mock_sign',
      }
    }

    const result = await wxpay.transactions_jsapi({
      description:  params.description,
      out_trade_no: params.outTradeNo,
      notify_url:   params.notifyUrl,
      amount: {
        total:    params.amount,
        currency: 'CNY',
      },
      payer: {
        openid: params.openid,
      },
    })

    if (result.status !== 200 || !result.data?.prepay_id) {
      throw new Error(`微信预支付失败: ${JSON.stringify(result.error ?? result.data)}`)
    }

    const prepayId  = result.data.prepay_id as string
    const appid     = process.env.WX_C_APP_ID!
    const timeStamp = String(Math.floor(Date.now() / 1000))
    const nonceStr  = crypto.randomUUID().replace(/-/g, '')
    const pkg       = `prepay_id=${prepayId}`

    // 按微信规范拼接签名串：每个字段以 \n 结尾
    const signStr = `${appid}\n${timeStamp}\n${nonceStr}\n${pkg}\n`
    const paySign = wxpay.sha256WithRsa(signStr)

    return { prepay_id: prepayId, timeStamp, nonceStr, package: pkg, signType: 'RSA' as const, paySign }
  }

  /**
   * 发起退款
   * 调用时机：cancelOrder 确定 refund_amount > 0 后
   *
   * outTradeNo / originalAmount 由调用方从已加载的 payment_records 中传入，
   * 避免在此处重复查询数据库
   */
  async refund(params: {
    paymentId:      string
    outTradeNo:     string   // 原始支付的商户单号（退款接口必传）
    originalAmount: number   // 原始支付金额（退款接口必传，单位：分）
    refundAmount:   number   // 本次退款金额，分
    reason:         string
  }) {
    const outRefundNo = `REFUND_${crypto.randomUUID().replace(/-/g, '')}`

    await prisma.refundRecord.create({
      data: {
        payment_id:    params.paymentId,
        out_refund_no: outRefundNo,
        refund_amount: params.refundAmount,
        reason:        params.reason,
        status:        'pending',
      },
    })

    const wxpay = getWxPayInstance()

    if (!wxpay) {
      // 开发/测试环境：跳过真实退款接口
      console.warn(`[PaymentService] 微信支付未配置，跳过退款 API 调用 (${outRefundNo})`)
      return { out_refund_no: outRefundNo }
    }

    const result = await wxpay.refunds({
      out_trade_no:  params.outTradeNo,
      out_refund_no: outRefundNo,
      reason:        params.reason,
      amount: {
        refund:   params.refundAmount,
        total:    params.originalAmount,
        currency: 'CNY',
      },
    })

    if (result.status !== 200) {
      await prisma.refundRecord.update({
        where: { out_refund_no: outRefundNo },
        data:  { status: 'failed' },
      })
      throw new Error(`微信退款请求失败: ${JSON.stringify(result.error ?? result.data)}`)
    }

    // 退款最终结果通过 /webhook/wx-refund 异步回调更新（1-3min）
    return { out_refund_no: outRefundNo }
  }

}

export const paymentService = new PaymentService()
