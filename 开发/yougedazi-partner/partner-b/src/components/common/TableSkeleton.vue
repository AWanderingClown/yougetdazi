<template>
  <div class="table-skeleton">
    <!-- Header skeleton rows -->
    <div class="skeleton-header">
      <div v-for="i in columns" :key="i" class="skeleton-cell skeleton-header-cell" />
    </div>
    <!-- Body skeleton rows -->
    <div v-for="row in rows" :key="row" class="skeleton-row">
      <div v-for="col in columns" :key="col" class="skeleton-cell" :style="{ width: getCellWidth(col) }" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  rows: { type: Number, default: 5 },
  columns: { type: Number, default: 5 }
})

const getCellWidth = (index) => {
  const widths = ['8%', '20%', '15%', '12%', '10%', '15%', '10%', '10%']
  return widths[(index - 1) % widths.length]
}
</script>

<style scoped lang="scss">
.table-skeleton {
  padding: 16px;
}

.skeleton-header {
  display: flex;
  gap: 12px;
  padding: 12px 8px;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 8px;
}

.skeleton-row {
  display: flex;
  gap: 12px;
  padding: 14px 8px;
  border-bottom: 1px solid #f5f5f5;
}

.skeleton-cell {
  height: 16px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

.skeleton-header-cell {
  height: 14px;
  background: #f5f5f5;
  animation: none;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
