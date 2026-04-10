<template>
  <el-card class="chart-card">
    <template #header>
      <div class="card-header">
        <span>{{ title }}</span>
        <slot name="header-extra" />
      </div>
    </template>
    <div ref="chartRef" class="chart-container"></div>
  </el-card>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  title: { type: String, default: '' },
  option: { type: Object, required: true }
})

const chartRef = ref(null)
let chart = null

const initChart = () => {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  chart.setOption(props.option)
}

watch(() => props.option, (newOption) => {
  chart?.setOption(newOption)
}, { deep: true })

const handleResize = () => chart?.resize()

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})

defineExpose({ chart })
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
}
.chart-container {
  height: 320px;
}
</style>
