import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login, getGuildInfo } from '@/api/auth'
import Cookies from 'js-cookie'

const TOKEN_KEY = 'partner_b_token'

export const useUserStore = defineStore('user', () => {
  // State
  const token = ref(Cookies.get(TOKEN_KEY) || '')
  const guildInfo = ref(null)
  const loading = ref(false)

  // Getters
  const isLoggedIn = computed(() => !!token.value)
  const guildId = computed(() => guildInfo.value?.id)
  const guildName = computed(() => guildInfo.value?.name)
  const permissions = computed(() => guildInfo.value?.permissions || [])

  // Actions
  const setToken = (newToken) => {
    token.value = newToken
    if (newToken) {
      Cookies.set(TOKEN_KEY, newToken, { expires: 7 })
    } else {
      Cookies.remove(TOKEN_KEY)
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
    }
  }

  const logout = () => {
    setToken('')
    guildInfo.value = null
  }

  const hasPermission = (permission) => {
    return permissions.value.includes(permission) || permissions.value.includes('all')
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
    logout,
    hasPermission
  }
})
