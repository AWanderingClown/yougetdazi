import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import router from '@/router'
import { API_TIMEOUT } from '@/constants'
import Cookies from 'js-cookie'

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: API_TIMEOUT
})

let isRedirecting = false

service.interceptors.request.use(
  (config) => {
    const userStore = useUserStore()
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`
    }
    const csrfToken = Cookies.get('csrf_token')
    if (csrfToken && ['post', 'put', 'delete', 'patch'].includes(config.method?.toLowerCase())) {
      config.headers['X-CSRF-Token'] = csrfToken
    }
    return config
  },
  (error) => Promise.reject(error)
)

service.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res.code !== 200) {
      ElMessage.error(res.message || '请求失败')
      if (res.code === 401) handleUnauthorized()
      return Promise.reject(new Error(res.message || '请求失败'))
    }
    return res.data
  },
  (error) => {
    let message = '网络错误'
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        message = '请求超时，请稍后重试'
      } else if (error.message === 'Network Error') {
        message = '网络连接失败，请检查网络'
      } else {
        message = '网络错误，请稍后重试'
      }
    } else {
      const status = error.response.status
      if (status === 401) {
        handleUnauthorized()
        return Promise.reject(new Error('登录已过期'))
      } else if (status === 403) {
        message = '无访问权限'
      } else if (status === 404) {
        message = '请求的资源不存在'
      } else if (status >= 500) {
        message = '服务器错误，请稍后重试'
      } else {
        message = error.response?.data?.message || '请求失败'
      }
    }
    ElMessage.error(message)
    return Promise.reject(error)
  }
)

const handleUnauthorized = () => {
  if (isRedirecting) return
  isRedirecting = true
  const userStore = useUserStore()
  userStore.logout()
  router.push('/login').catch(() => {})
  setTimeout(() => { isRedirecting = false }, 3000)
}

export default service
