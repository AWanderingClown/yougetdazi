import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getDashboardStats } from '@/api/dashboard'
import { mockDashboardStats } from '@/utils/mockData'

const MOCK_ENABLED = import.meta.env.DEV

export const useDashboardStatsStore = defineStore('dashboardStats', () => {
  const stats = ref(null)
  const loading = ref(false)
  let abortController = null

  const fetchStats = async () => {
    if (abortController) abortController.abort()
    abortController = new AbortController()
    loading.value = true
    try {
      if (MOCK_ENABLED) {
        await new Promise(r => setTimeout(r, 300))
        stats.value = mockDashboardStats
      } else {
        stats.value = await getDashboardStats()
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('fetchStats error:', e)
      }
    } finally {
      loading.value = false
    }
  }

  return { stats, loading, fetchStats }
})
