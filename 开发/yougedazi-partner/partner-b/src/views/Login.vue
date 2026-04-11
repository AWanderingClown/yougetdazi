<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <div class="brand-logo">
          <img src="https://placeholder.com/80x80" alt="logo" />
        </div>
        <h1 class="brand-name">有个搭子</h1>
        <p class="brand-subtitle">B端合作商后台</p>
      </div>
      
      <div class="login-form-wrapper">
        <h2 class="form-title">机构账号登录</h2>
        
        <el-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="loginRules"
          class="login-form"
          @keyup.enter="handleLogin"
        >
          <el-form-item prop="account">
            <el-input
              v-model="loginForm.account"
              placeholder="请输入机构账号"
              size="large"
              :prefix-icon="OfficeBuilding"
            />
          </el-form-item>
          
          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              type="password"
              placeholder="请输入登录密码"
              size="large"
              :prefix-icon="Lock"
              show-password
            />
          </el-form-item>
          
          <el-form-item>
            <div class="form-options">
              <el-checkbox v-model="rememberMe">记住账号</el-checkbox>
              <el-link type="primary" :underline="false" @click="handleForgotPassword">
                忘记密码？
              </el-link>
            </div>
          </el-form-item>
          
          <el-form-item>
            <el-button
              type="primary"
              size="large"
              class="login-btn"
              :loading="loading"
              @click="handleLogin"
            >
              登 录
            </el-button>
          </el-form-item>
        </el-form>
        
        <div class="login-tips">
          <el-alert
            title="B端合作商登录说明"
            type="info"
            :closable="false"
            show-icon
          >
            <template #default>
              <p>• 仅限已签约公会/机构使用</p>
              <p>• 如需开通账号请联系平台商务</p>
            </template>
          </el-alert>
        </div>
      </div>
    </div>
    
    <div class="login-footer">
      <p>© 2024 有个搭子 - B端合作商管理平台</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { OfficeBuilding, Lock } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { escapeHtml } from '@/utils/index'

const router = useRouter()
const userStore = useUserStore()

const loginFormRef = ref(null)
const loading = ref(false)
const rememberMe = ref(false)

const loginForm = reactive({
  account: '',
  password: ''
})

const loginRules = {
  account: [
    { required: true, message: '请输入机构账号', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入登录密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ]
}

// 从本地存储恢复账号
onMounted(() => {
  const savedAccount = localStorage.getItem('partner_b_account')
  if (savedAccount) {
    loginForm.account = savedAccount
    rememberMe.value = true
  }
})

const handleLogin = async () => {
  const valid = await loginFormRef.value.validate().catch(() => false)
  if (!valid) return
  
  loading.value = true
  
  try {
    await userStore.loginAction(loginForm)
    
    if (rememberMe.value) {
      localStorage.setItem('partner_b_account', loginForm.account)
    } else {
      localStorage.removeItem('partner_b_account')
    }
    
    ElMessage.success('登录成功')
    router.push('/dashboard')
  } catch (error) {
    const raw = error?.response?.data?.message || error?.message || '登录失败，请检查账号密码'
    ElMessage.error(escapeHtml(raw))
    loginForm.password = ''
  } finally {
    loading.value = false
  }
}

const handleForgotPassword = () => {
  ElMessage.info('请联系平台客服重置密码')
}
</script>

<style scoped lang="scss">
.login-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.login-box {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 420px;
  overflow: hidden;
}

.login-header {
  background: linear-gradient(135deg, #7d67ea 0%, #9a59b8 100%);
  padding: 40px 32px;
  text-align: center;
  color: #fff;
  
  .brand-logo {
    width: 80px;
    height: 80px;
    margin: 0 auto 16px;
    background: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    
    img {
      width: 60px;
      height: 60px;
      border-radius: 50%;
    }
  }
  
  .brand-name {
    font-size: 28px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  
  .brand-subtitle {
    font-size: 16px;
    opacity: 0.9;
  }
}

.login-form-wrapper {
  padding: 32px;
  
  .form-title {
    font-size: 20px;
    font-weight: 500;
    color: #303133;
    margin-bottom: 24px;
    text-align: center;
  }
}

.login-form {
  .form-options {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }
  
  .login-btn {
    width: 100%;
    font-size: 16px;
  }
}

.login-tips {
  margin-top: 24px;
  
  p {
    margin: 4px 0;
    font-size: 13px;
    color: #606266;
  }
}

.login-footer {
  margin-top: 32px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  text-align: center;
}
</style>
