<template>
  <el-col :xs="24" :sm="12" :lg="6">
    <div class="finance-card" :class="type">
      <div class="finance-icon"><el-icon><component :is="icon" /></el-icon></div>
      <div class="finance-info">
        <div class="finance-label">{{ label }}</div>
        <div class="finance-value">{{ value }}</div>
      </div>
    </div>
  </el-col>
</template>

<script setup>
defineProps({
  value: { type: [Number, String], required: true },
  label: { type: String, required: true },
  icon: { type: String, required: true },
  type: { type: String, default: 'primary' }
})
</script>

<style scoped lang="scss">
.finance-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  &.primary { background: linear-gradient(135deg, #7d67ea, #9a59b8); }
  &.warning { background: linear-gradient(135deg, #E6A23C, #eebe77); }
  &.success { background: linear-gradient(135deg, #67C23A, #95d475); }
  &.info { background: linear-gradient(135deg, #909399, #b1b3b8); }
  .finance-icon {
    width: 56px; height: 56px; border-radius: 12px;
    background: rgba(255, 255, 255, 0.2);
    display: flex; align-items: center; justify-content: center;
    margin-right: 16px;
    .el-icon { font-size: 28px; color: #fff; }
  }
  .finance-info { color: #fff; .finance-label { font-size: 14px; opacity: 0.9; margin-bottom: 4px; } .finance-value { font-size: 24px; font-weight: 600; } }
}
</style>
