<template>
  <router-view />
</template>

<script setup>
import { onErrorCaptured } from 'vue'
import { ElMessage } from 'element-plus'

onErrorCaptured((err, instance, info) => {
  console.error('Global error:', err, 'Info:', info)
  ElMessage.error('页面出现错误，请刷新重试')
  return false
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #f5f7fa;
}

#app {
  width: 100%;
  height: 100vh;
}
</style>
