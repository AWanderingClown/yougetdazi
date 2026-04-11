import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPendingTasks } from '@/api/dashboard'
import { mockPendingTasks } from '@/utils/mockData'

const MOCK_ENABLED = import.meta.env.DEV

export const usePendingTasksStore = defineStore('pendingTasks', () => {
  const tasks = ref(null)
  const loading = ref(false)
  let abortController = null

  const fetchTasks = async () => {
    if (abortController) abortController.abort()
    abortController = new AbortController()
    loading.value = true
    try {
      if (MOCK_ENABLED) {
        await new Promise(r => setTimeout(r, 200))
        tasks.value = mockPendingTasks
      } else {
        tasks.value = await getPendingTasks()
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('fetchTasks error:', e)
      }
    } finally {
      loading.value = false
    }
  }

  return { tasks, loading, fetchTasks }
})
