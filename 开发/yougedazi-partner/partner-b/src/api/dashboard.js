// 看板数据接口
import request from '@/utils/request'

// 获取看板统计数据
export const getDashboardStats = () => {
  return request({
    url: '/partner/dashboard/stats',
    method: 'get'
  })
}

// 获取活跃度趋势
export const getActivityTrend = (params) => {
  return request({
    url: '/partner/dashboard/activity-trend',
    method: 'get',
    params
  })
}

// 获取订单类型分布
export const getOrderTypeDistribution = () => {
  return request({
    url: '/partner/dashboard/order-types',
    method: 'get'
  })
}

// 获取待处理事项
export const getPendingTasks = () => {
  return request({
    url: '/partner/dashboard/pending-tasks',
    method: 'get'
  })
}
