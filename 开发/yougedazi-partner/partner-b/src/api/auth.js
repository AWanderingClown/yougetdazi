// 认证相关接口
import request from '@/utils/request'
import { mockGuildInfo } from '@/utils/mockData'

const MOCK_ENABLED = import.meta.env.DEV

// 公会登录
export const login = (data) => {
  if (MOCK_ENABLED) {
    return Promise.resolve({
      token: 'mock_token_' + Date.now(),
      guildInfo: mockGuildInfo
    })
  }
  return request({
    url: '/partner/auth/login',
    method: 'post',
    data
  })
}

// 获取公会信息
export const getGuildInfo = () => {
  if (MOCK_ENABLED) {
    return Promise.resolve(mockGuildInfo)
  }
  return request({
    url: '/partner/guild/info',
    method: 'get'
  })
}

// 修改密码
export const changePassword = (data) => {
  if (MOCK_ENABLED) {
    return Promise.resolve({ success: true })
  }
  return request({
    url: '/partner/auth/password',
    method: 'put',
    data
  })
}
