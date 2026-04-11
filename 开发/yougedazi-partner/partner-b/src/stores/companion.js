import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getCompanionList, getCompanionDetail, createCompanion, updateCompanion, toggleCompanionStatus } from '@/api/companion'
import { mockCompanions } from '@/utils/mockData'

const MOCK_ENABLED = import.meta.env.DEV

export const useCompanionStore = defineStore('companion', () => {
  const companions = ref([])
  const currentCompanion = ref(null)
  const loading = ref(false)
  const total = ref(0)
  const filters = ref({ status: '', search: '' })
  let abortController = null

  const onlineCount = computed(() =>
    companions.value.filter(c => c.status === 'online').length
  )

  const pendingCount = computed(() =>
    companions.value.filter(c => c.status === 'pending').length
  )

  const fetchCompanions = async (params = {}) => {
    if (abortController) abortController.abort()
    abortController = new AbortController()
    loading.value = true
    try {
      if (MOCK_ENABLED) {
        await new Promise(r => setTimeout(r, 300))
        let result = [...mockCompanions]
        if (filters.value.status) {
          result = result.filter(c => c.status === filters.value.status)
        }
        if (filters.value.search) {
          const s = filters.value.search.toLowerCase()
          result = result.filter(c =>
            c.nickname.toLowerCase().includes(s) ||
            c.phone.includes(s)
          )
        }
        companions.value = result
        total.value = result.length
      } else {
        const res = await getCompanionList({ ...params, ...filters.value })
        companions.value = res.list || res
        total.value = res.total || companions.value.length
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('fetchCompanions error:', e)
      }
    } finally {
      loading.value = false
    }
  }

  const fetchCompanionDetail = async (id) => {
    try {
      if (MOCK_ENABLED) {
        await new Promise(r => setTimeout(r, 200))
        currentCompanion.value = mockCompanions.find(c => c.id === id) || null
      } else {
        currentCompanion.value = await getCompanionDetail(id)
      }
    } catch (e) {
      console.error('fetchCompanionDetail error:', e)
    }
  }

  const addCompanion = async (data) => {
    if (MOCK_ENABLED) {
      await new Promise(r => setTimeout(r, 300))
      const newCompanion = { id: Date.now(), ...data, status: 'pending' }
      companions.value.unshift(newCompanion)
      total.value++
      return newCompanion
    }
    return await createCompanion(data)
  }

  const editCompanion = async (id, data) => {
    if (MOCK_ENABLED) {
      await new Promise(r => setTimeout(r, 300))
      const idx = companions.value.findIndex(c => c.id === id)
      if (idx !== -1) {
        companions.value[idx] = { ...companions.value[idx], ...data }
      }
      return companions.value[idx]
    }
    return await updateCompanion(id, data)
  }

  const setCompanionStatus = async (id, status) => {
    if (MOCK_ENABLED) {
      await new Promise(r => setTimeout(r, 200))
      const idx = companions.value.findIndex(c => c.id === id)
      if (idx !== -1) {
        companions.value[idx].status = status
      }
      return true
    }
    return await toggleCompanionStatus(id, { status })
  }

  const setFilters = (newFilters) => {
    filters.value = { ...filters.value, ...newFilters }
  }

  return {
    companions,
    currentCompanion,
    loading,
    total,
    filters,
    onlineCount,
    pendingCount,
    fetchCompanions,
    fetchCompanionDetail,
    addCompanion,
    editCompanion,
    setCompanionStatus,
    setFilters
  }
})
