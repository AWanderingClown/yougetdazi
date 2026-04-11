import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login, getGuildInfo, refresh } from '@/api/auth'
import { ElMessage } from 'element-plus'

const SESSION_TOKEN_KEY = 'partner_b_session'

export const useUserStore = defineStore('user', () => {
  const token = ref(sessionStorage.getItem(SESSION_TOKEN_KEY) || '')
  const guildInfo = ref(null)
  const loading = ref(false)

  const isLoggedIn = computed(() => !!token.value)
  const guildId = computed(() => guildInfo.value?.id)
  const guildName = computed(() => guildInfo.value?.name)
  const permissions = computed(() => guildInfo.value?.permissions || [])

  const setToken = (newToken) => {
    token.value = newToken
    if (newToken) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, newToken)
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY)
    }
  }

  const loginAction = async (credentials) => {
    loading.value = true
    try {
      const res = await login(credentials)
      setToken(res.token)
      guildInfo.value = res.guildInfo
      return res
    } finally {
      loading.value = false
    }
  }

  const fetchGuildInfo = async () => {
    if (!token.value) return
    try {
      const res = await getGuildInfo()
      guildInfo.value = res
    } catch (error) {
      console.error('获取公会信息失败:', error)
      ElMessage.error('获取公会信息失败，请刷新页面')
    }
  }

  const refreshToken = async () => {
    try {
      const res = await refresh({ token: token.value })
      setToken(res.token)
      return res.token
    } catch (error) {
      logout()
      throw error
    }
  }

  const logout = () => {
    setToken('')
    guildInfo.value = null
  }

  const hasPermission = (permission) => {
    const perms = permissions.value
    return perms.includes('all') || perms.includes(permission)
  }

  return {
    token,
    guildInfo,
    loading,
    isLoggedIn,
    guildId,
    guildName,
    permissions,
    setToken,
    loginAction,
    fetchGuildInfo,
    refreshToken,
    logout,
    hasPermission
  }
})
