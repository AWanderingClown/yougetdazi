import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getDashboardStats, getActivityTrend, getOrderTypeDistribution, getPendingTasks } from '@/api/dashboard'
import { mockDashboardStats, mockActivityTrend, mockOrderTypes, mockPendingTasks } from '@/utils/mockData'

const MOCK_ENABLED = import.meta.env.DEV

export const useDashboardStore = defineStore('dashboard', () => {
  const stats = ref(null)
  const activityTrend = ref(null)
  const orderTypes = ref(null)
  const pendingTasks = ref(null)
  const loading = ref(false)
  const updateTime = ref('')

  const fetchStats = async () => {
    loading.value = true
    try {
      if (MOCK_ENABLED) {
        await new Promise(r => setTimeout(r, 300))
        stats.value = mockDashboardStats
      } else {
        stats.value = await getDashboardStats()
      }
    } catch (e) {
      console.error('fetchStats error:', e)
    } finally {
      loading.value = false
    }
  }

  const fetchActivityTrend = async (params) => {
    try {
      if (MOCK_ENABLED) {
        await new Promise(r => setTimeout(r, 200))
        activityTrend.value = mockActivityTrend
      } else {
        activityTrend.value = await getActivityTrend(params)
      }
    } catch (e) {
      console.error('fetchActivityTrend error:', e)
    }
  }

  const fetchOrderTypes = async () => {
    try {
      if (MOCK_ENABLED) {
        await new Promise(r => setTimeout(r, 200))
        orderTypes.value = mockOrderTypes
      } else {
        orderTypes.value = await getOrderTypeDistribution()
      }
    } catch (e) {
      console.error('fetchOrderTypes error:', e)
    }
  }

  const fetchPendingTasks = async () => {
    try {
      if (MOCK_ENABLED) {
        await new Promise(r => setTimeout(r, 200))
        pendingTasks.value = mockPendingTasks
      } else {
        pendingTasks.value = await getPendingTasks()
      }
    } catch (e) {
      console.error('fetchPendingTasks error:', e)
    }
  }

  const fetchAll = async () => {
    loading.value = true
    try {
      await Promise.all([
        fetchStats(),
        fetchActivityTrend(),
        fetchOrderTypes(),
        fetchPendingTasks()
      ])
      updateTime.value = new Date().toLocaleString()
    } finally {
      loading.value = false
    }
  }

  return {
    stats,
    activityTrend,
    orderTypes,
    pendingTasks,
    loading,
    updateTime,
    fetchStats,
    fetchActivityTrend,
    fetchOrderTypes,
    fetchPendingTasks,
    fetchAll
  }
})
