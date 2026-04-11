import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getActivityTrend, getOrderTypeDistribution } from '@/api/dashboard'
import { mockActivityTrend, mockOrderTypes } from '@/utils/mockData'

const MOCK_ENABLED = import.meta.env.DEV

export const useDashboardAnalyticsStore = defineStore('dashboardAnalytics', () => {
  const activityTrend = ref(null)
  const orderTypes = ref(null)
  const loading = ref(false)
  let abortController = null

  const fetchActivityTrend = async (params) => {
    try {
      if (MOCK_ENABLED) {
        await new Promise(r => setTimeout(r, 200))
        activityTrend.value = mockActivityTrend
      } else {
        activityTrend.value = await getActivityTrend(params)
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('fetchActivityTrend error:', e)
      }
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
      if (e.name !== 'AbortError') {
        console.error('fetchOrderTypes error:', e)
      }
    }
  }

  const fetchAll = async () => {
    if (abortController) abortController.abort()
    abortController = new AbortController()
    loading.value = true
    try {
      await Promise.all([fetchActivityTrend(), fetchOrderTypes()])
    } finally {
      loading.value = false
    }
  }

  return { activityTrend, orderTypes, loading, fetchActivityTrend, fetchOrderTypes, fetchAll }
})
