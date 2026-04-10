// 培训资料接口
import request from '@/utils/request'

// 获取培训资料列表
export const getTrainingList = (params) => {
  return request({
    url: '/partner/training/materials',
    method: 'get',
    params
  })
}

// 获取资料详情
export const getTrainingDetail = (id) => {
  return request({
    url: `/partner/training/materials/${id}`,
    method: 'get'
  })
}

// 标记已读
export const markAsRead = (id) => {
  return request({
    url: `/partner/training/materials/${id}/read`,
    method: 'post'
  })
}
