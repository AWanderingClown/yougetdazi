// 团队管理接口
import request from '@/utils/request'

// 获取子账号列表
export const getSubAccountList = () => {
  return request({
    url: '/partner/team/accounts',
    method: 'get'
  })
}

// 创建子账号
export const createSubAccount = (data) => {
  return request({
    url: '/partner/team/accounts',
    method: 'post',
    data
  })
}

// 更新子账号
export const updateSubAccount = (id, data) => {
  return request({
    url: `/partner/team/accounts/${id}`,
    method: 'put',
    data
  })
}

// 删除子账号
export const deleteSubAccount = (id) => {
  return request({
    url: `/partner/team/accounts/${id}`,
    method: 'delete'
  })
}

// 获取角色列表
export const getRoleList = () => {
  return request({
    url: '/partner/team/roles',
    method: 'get'
  })
}

// 获取操作日志
export const getOperationLogs = (params) => {
  return request({
    url: '/partner/team/logs',
    method: 'get',
    params
  })
}
