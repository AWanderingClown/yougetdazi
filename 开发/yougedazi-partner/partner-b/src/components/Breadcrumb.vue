<template>
  <el-breadcrumb separator="/">
    <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
    <el-breadcrumb-item v-if="currentTitle">{{ currentTitle }}</el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const currentTitle = computed(() => {
  return route.meta?.title || ''
})
</script>

<style scoped>
.el-breadcrumb {
  font-size: 14px;
}
</style>
