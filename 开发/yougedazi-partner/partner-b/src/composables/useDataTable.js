import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { PAGE_SIZE } from '@/utils/index'

export function useDataTable(apiFn, options = {}) {
  const {
    immediate = true,
    defaultFilters = {}
  } = options

  const data = ref([])
  const loading = ref(false)
  const total = ref(0)
  const filters = reactive({ ...defaultFilters })
  const pagination = reactive({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0
  })

  const hasMore = computed(() => data.value.length < total.value)

  const loadData = async (extraParams = {}) => {
    loading.value = true
    try {
      const params = {
        page: pagination.page,
        page_size: pagination.pageSize,
        ...filters,
        ...extraParams
      }
      const result = await apiFn(params)
      if (Array.isArray(result)) {
        data.value = result
        total.value = result.length
      } else {
        data.value = result.list || result.data || []
        total.value = result.total || data.value.length
      }
      pagination.total = total.value
    } catch (e) {
      console.error('loadData error:', e)
      ElMessage.error('加载数据失败')
    } finally {
      loading.value = false
    }
  }

  const reload = () => {
    pagination.page = 1
    return loadData()
  }

  const nextPage = () => {
    if (hasMore.value) {
      pagination.page++
      return loadData()
    }
  }

  const setFilters = (newFilters) => {
    Object.assign(filters, newFilters)
  }

  const resetFilters = () => {
    Object.keys(filters).forEach(k => delete filters[k])
    Object.assign(filters, defaultFilters)
  }

  const onPageChange = (page) => {
    pagination.page = page
    loadData()
  }

  const onSizeChange = (size) => {
    pagination.pageSize = size
    pagination.page = 1
    loadData()
  }

  if (immediate) {
    loadData()
  }

  return {
    data,
    loading,
    total,
    filters,
    pagination,
    hasMore,
    loadData,
    reload,
    nextPage,
    setFilters,
    resetFilters,
    onPageChange,
    onSizeChange
  }
}
