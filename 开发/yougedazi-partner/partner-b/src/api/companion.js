// 搭子管理接口
import request from '@/utils/request'

// 获取搭子列表
export const getCompanionList = (params) => {
  return request({
    url: '/partner/companions',
    method: 'get',
    params
  })
}

// 获取搭子详情
export const getCompanionDetail = (id) => {
  return request({
    url: `/partner/companions/${id}`,
    method: 'get'
  })
}

// 审核搭子入驻
export const auditCompanion = (id, data) => {
  return request({
    url: `/partner/companions/${id}/audit`,
    method: 'post',
    data
  })
}

// 更新搭子状态
export const updateCompanionStatus = (id, status) => {
  return request({
    url: `/partner/companions/${id}/status`,
    method: 'put',
    data: { status }
  })
}

// 获取入驻申请列表
export const getApplyList = (params) => {
  return request({
    url: '/partner/companions/applications',
    method: 'get',
    params
  })
}

// 创建搭子
export const createCompanion = (data) => {
  return request({
    url: '/partner/companions',
    method: 'post',
    data
  })
}

// 更新搭子信息
export const updateCompanion = (id, data) => {
  return request({
    url: `/partner/companions/${id}`,
    method: 'put',
    data
  })
}

// 切换搭子状态(启用/禁用)
export const toggleCompanionStatus = (id, data) => {
  return request({
    url: `/partner/companions/${id}/status`,
    method: 'put',
    data
  })
}
