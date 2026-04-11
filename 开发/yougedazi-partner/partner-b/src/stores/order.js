import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getOrderList, getOrderDetail, handleOrderComplaint as apiHandleComplaint } from '@/api/order'
import { mockOrders } from '@/utils/mockData'

const MOCK_ENABLED = import.meta.env.DEV

export const useOrderStore = defineStore('order', () => {
  const orders = ref([])
  const currentOrder = ref(null)
  const loading = ref(false)
  const total = ref(0)
  const filters = ref({
    status: '',
    search: '',
    dateRange: null
  })
  let abortController = null

  const hasComplaintCount = computed(() =>
    orders.value.filter(o => o.hasComplaint).length
  )

  const pendingComplaintCount = computed(() =>
    orders.value.filter(o => o.hasComplaint && o.complaintStatus === 'pending').length
  )

  const fetchOrders = async (params = {}) => {
    if (abortController) abortController.abort()
    abortController = new AbortController()
    loading.value = true
    try {
      if (MOCK_ENABLED) {
        await new Promise(r => setTimeout(r, 300))
        let result = [...mockOrders]
        if (filters.value.status) {
          result = result.filter(o => o.status === filters.value.status)
        }
        if (filters.value.search) {
          const s = filters.value.search.toLowerCase()
          result = result.filter(o =>
            o.orderNo.toLowerCase().includes(s) ||
            (o.userInfo?.nickname || '').toLowerCase().includes(s)
          )
        }
        orders.value = result
        total.value = result.length
      } else {
        const res = await getOrderList({ ...params, ...filters.value })
        orders.value = res.list || res
        total.value = res.total || orders.value.length
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('fetchOrders error:', e)
      }
    } finally {
      loading.value = false
    }
  }

  const fetchOrderDetail = async (id) => {
    try {
      if (MOCK_ENABLED) {
        await new Promise(r => setTimeout(r, 200))
        currentOrder.value = mockOrders.find(o => o.id === id) || null
      } else {
        currentOrder.value = await getOrderDetail(id)
      }
    } catch (e) {
      console.error('fetchOrderDetail error:', e)
    }
  }

  const handleComplaint = async (id, data) => {
    if (MOCK_ENABLED) {
      await new Promise(r => setTimeout(r, 300))
      const idx = orders.value.findIndex(o => o.id === id)
      if (idx !== -1) {
        orders.value[idx].complaintStatus = 'resolved'
      }
      return true
    }
    return await apiHandleComplaint(id, data)
  }

  const setFilters = (newFilters) => {
    filters.value = { ...filters.value, ...newFilters }
  }

  return {
    orders,
    currentOrder,
    loading,
    total,
    filters,
    hasComplaintCount,
    pendingComplaintCount,
    fetchOrders,
    fetchOrderDetail,
    handleComplaint,
    setFilters
  }
})
