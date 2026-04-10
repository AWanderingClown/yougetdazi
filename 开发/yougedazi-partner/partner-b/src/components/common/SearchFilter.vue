<template>
  <el-card class="filter-card">
    <el-form :model="model" inline v-bind="$attrs">
      <slot />
      <el-form-item v-if="showSearch">
        <el-button type="primary" @click="$emit('search')">
          <el-icon><Search /></el-icon>
          搜索
        </el-button>
      </el-form-item>
      <el-form-item v-if="showReset">
        <el-button @click="$emit('reset')">重置</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
defineProps({
  model: { type: Object, required: true },
  showSearch: { type: Boolean, default: true },
  showReset: { type: Boolean, default: true }
})
defineEmits(['search', 'reset'])
</script>

<style scoped>
.filter-card {
  margin-bottom: 20px;
}
</style>
