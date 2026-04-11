<template>
  <div class="error-page">
    <div class="error-content">
      <h1>404</h1>
      <p>抱歉，页面不存在</p>
      <el-button type="primary" @click="goHome">返回首页</el-button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
const goHome = () => router.push('/')
</script>

<style scoped>
.error-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #f5f7fa;
}
.error-content {
  text-align: center;
}
.error-content h1 {
  font-size: 72px;
  color: #7d67ea;
  margin-bottom: 16px;
}
.error-content p {
  font-size: 18px;
  color: #606266;
  margin-bottom: 32px;
}
</style>
