import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/Error403.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    component: () => import('@/views/Layout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '公会看板', icon: 'DataLine' }
      },
      {
        path: 'companions',
        name: 'CompanionManage',
        component: () => import('@/views/CompanionManage.vue'),
        meta: { title: '搭子管理', icon: 'UserFilled', permission: 'companion:read' }
      },
      {
        path: 'orders',
        name: 'OrderBoard',
        component: () => import('@/views/OrderBoard.vue'),
        meta: { title: '订单看板', icon: 'List', permission: 'order:read' }
      },
      {
        path: 'settlement',
        name: 'Settlement',
        component: () => import('@/views/Settlement.vue'),
        meta: { title: '结算中心', icon: 'Money', permission: 'settlement:read' }
      },
      {
        path: 'team',
        name: 'TeamManage',
        component: () => import('@/views/TeamManage.vue'),
        meta: { title: '团队管理', icon: 'User', permission: 'team:read' }
      },
      {
        path: 'training',
        name: 'Training',
        component: () => import('@/views/Training.vue'),
        meta: { title: '培训资料', icon: 'Document' }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/Error404.vue'),
    meta: { public: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const userStore = useUserStore()
  
  if (!to.meta.public && !userStore.token) {
    next('/login')
  } else if (to.meta.permission && !userStore.hasPermission(to.meta.permission)) {
    next('/403')
  } else {
    next()
  }
})

export default router
