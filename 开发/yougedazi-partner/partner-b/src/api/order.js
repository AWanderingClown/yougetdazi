// 订单管理接口
import request from '@/utils/request'

// 获取订单列表
export const getOrderList = (params) => {
  return request({
    url: '/partner/orders',
    method: 'get',
    params
  })
}

// 获取订单详情
export const getOrderDetail = (id) => {
  return request({
    url: `/partner/orders/${id}`,
    method: 'get'
  })
}

// 处理订单投诉
export const handleOrderComplaint = (id, data) => {
  return request({
    url: `/partner/orders/${id}/complaint`,
    method: 'post',
    data
  })
}
