<template>
  <el-col :xs="span.xs" :sm="span.sm" :md="span.md" :lg="span.lg">
    <div class="stat-card">
      <div class="stat-icon" :class="iconClass">
        <el-icon><component :is="icon" /></el-icon>
      </div>
      <div class="stat-info">
        <div class="stat-value">{{ value }}</div>
        <div class="stat-label">{{ label }}</div>
      </div>
    </div>
  </el-col>
</template>

<script setup>
defineProps({
  value: { type: [Number, String], required: true },
  label: { type: String, required: true },
  icon: { type: String, required: true },
  iconClass: { type: String, default: 'blue' },
  span: {
    type: Object,
    default: () => ({ xs: 12, sm: 8, md: 6, lg: 4 })
  }
})
</script>

<style scoped lang="scss">
.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);

  .stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 16px;

    .el-icon {
      font-size: 24px;
      color: #fff;
    }

    &.blue { background: linear-gradient(135deg, var(--color-primary), #9a59b8); }
    &.green { background: linear-gradient(135deg, var(--color-success), #95d475); }
    &.orange { background: linear-gradient(135deg, var(--color-warning), #eebe77); }
    &.red { background: linear-gradient(135deg, var(--color-danger), #f89898); }
    &.cyan { background: linear-gradient(135deg, #36cfc9, #5cdbd3); }
  }

  .stat-info {
    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: #303133;
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 14px;
      color: #909399;
    }
  }
}
</style>
