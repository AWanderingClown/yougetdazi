<template>
  <el-container class="layout-container">
    <!-- 左侧菜单 -->
    <el-aside width="220px" class="sidebar">
      <div class="logo-area">
        <el-avatar :size="40" :src="guildInfo?.logo || defaultLogo" />
        <div class="guild-info">
          <div class="guild-name">{{ guildInfo?.name || '公会后台' }}</div>
          <el-tag size="small" type="success">B端合作商</el-tag>
        </div>
      </div>
      
      <el-menu
        :default-active="activeMenu"
        class="sidebar-menu"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#7d67ea"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon>
            <component :is="item.icon" />
          </el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <!-- 顶部导航 -->
      <el-header class="header">
        <div class="header-left">
          <Breadcrumb />
        </div>
        <div class="header-right">
          <el-badge :value="pendingCount" :hidden="pendingCount === 0" class="message-badge">
            <el-icon :size="20"><Bell /></el-icon>
          </el-badge>
          
          <el-dropdown @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="32" :src="userAvatar" />
              <span class="username">{{ guildInfo?.contact || '管理员' }}</span>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">公会信息</el-dropdown-item>
                <el-dropdown-item command="password">修改密码</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 主内容区 -->
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import Breadcrumb from '@/components/Breadcrumb.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const defaultLogo = 'https://placeholder.com/100x100'
const userAvatar = 'https://placeholder.com/40x40'

// 模拟待处理数量
const pendingCount = ref(7)

const activeMenu = computed(() => route.path)

const guildInfo = computed(() => userStore.guildInfo)

const menuItems = [
  { path: '/dashboard', title: '公会看板', icon: 'DataLine' },
  { path: '/companions', title: '搭子管理', icon: 'UserFilled' },
  { path: '/orders', title: '订单看板', icon: 'List' },
  { path: '/settlement', title: '结算中心', icon: 'Money' },
  { path: '/team', title: '团队管理', icon: 'User' },
  { path: '/training', title: '培训资料', icon: 'Document' }
]

onMounted(() => {
  if (!userStore.guildInfo) {
    userStore.fetchGuildInfo()
  }
})

const handleCommand = (command) => {
  switch (command) {
    case 'profile':
      ElMessage.info('公会信息功能开发中')
      break
    case 'password':
      ElMessage.info('修改密码功能开发中')
      break
    case 'logout':
      ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        userStore.logout()
        router.push('/login')
        ElMessage.success('已退出登录')
      })
      break
  }
}
</script>

<style scoped lang="scss">
.layout-container {
  height: 100vh;
}

.sidebar {
  background-color: #304156;
  
  .logo-area {
    display: flex;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #1f2d3d;
    
    .guild-info {
      margin-left: 12px;
      flex: 1;
      
      .guild-name {
        color: #fff;
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 140px;
      }
    }
  }
  
  .sidebar-menu {
    border-right: none;
    
    :deep(.el-menu-item) {
      &:hover {
        background-color: #263445 !important;
      }
      
      .el-icon {
        margin-right: 8px;
      }
    }
  }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #fff;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  
  .header-left {
    display: flex;
    align-items: center;
  }
  
  .header-right {
    display: flex;
    align-items: center;
    gap: 24px;
    
    .message-badge {
      cursor: pointer;
      color: #606266;
      
      &:hover {
        color: #7d67ea;
      }
    }
    
    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      
      &:hover {
        background-color: #f5f7fa;
      }
      
      .username {
        font-size: 14px;
        color: #606266;
      }
    }
  }
}

.main-content {
  background-color: #f5f7fa;
  padding: 20px;
  overflow-y: auto;
}
</style>
