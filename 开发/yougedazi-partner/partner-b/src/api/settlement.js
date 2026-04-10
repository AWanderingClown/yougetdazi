// 结算中心接口
import request from '@/utils/request'

// 获取公会流水统计
export const getSettlementStats = () => {
  return request({
    url: '/partner/settlement/stats',
    method: 'get'
  })
}

// 获取佣金明细
export const getCommissionList = (params) => {
  return request({
    url: '/partner/settlement/commissions',
    method: 'get',
    params
  })
}

// 申请提现
export const applyWithdraw = (data) => {
  return request({
    url: '/partner/settlement/withdraw',
    method: 'post',
    data
  })
}

// 获取提现记录
export const getWithdrawList = (params) => {
  return request({
    url: '/partner/settlement/withdrawals',
    method: 'get',
    params
  })
}

// 获取结算周期配置
export const getSettlementConfig = () => {
  return request({
    url: '/partner/settlement/config',
    method: 'get'
  })
}
