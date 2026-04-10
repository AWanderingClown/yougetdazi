import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import router from '@/router'
import { API_TIMEOUT } from '@/constants'

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
    const message = error.response?.data?.message || error.message || '网络错误'
    ElMessage.error(message)
    if (error.response?.status === 401) handleUnauthorized()
    return Promise.reject(error)
  }
)

const handleUnauthorized = () => {
  if (isRedirecting) return
  isRedirecting = true
  const userStore = useUserStore()
  userStore.logout()
  router.push('/login')
  setTimeout(() => { isRedirecting = false }, 3000)
}

export default service
