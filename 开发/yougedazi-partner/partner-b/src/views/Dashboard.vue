<template>
  <div class="dashboard-page">
    <div class="page-header">
      <h2>公会看板</h2>
      <span class="update-time">数据更新时间：{{ updateTime }}</span>
    </div>

    <el-row :gutter="20" class="stat-cards">
      <StatCard :value="stats.totalCompanions" label="旗下搭子总数" icon="UserFilled" icon-class="blue" />
      <StatCard :value="stats.onlineCompanions" label="在线搭子数" icon="CircleCheck" icon-class="green" />
      <StatCard :value="stats.todayOrders" label="今日订单数" icon="ShoppingCart" icon-class="purple" />
      <StatCard :value="'¥' + formatNumber(stats.todayRevenue)" label="今日流水" icon="Money" icon-class="orange" />
      <StatCard :value="'¥' + formatNumber(stats.pendingSettlement)" label="待结算金额" icon="Wallet" icon-class="red" />
      <StatCard :value="onlineRate + '%'" label="在线率" icon="TrendCharts" icon-class="cyan" />
    </el-row>

    <el-row :gutter="20" class="chart-section">
      <el-col :xs="24" :lg="16">
        <ChartCard title="搭子活跃度趋势" :option="trendOption">
          <template #header-extra>
            <el-radio-group v-model="trendPeriod" size="small">
              <el-radio-button label="week">近7天</el-radio-button>
              <el-radio-button label="month">近30天</el-radio-button>
            </el-radio-group>
          </template>
        </ChartCard>
      </el-col>
      <el-col :xs="24" :lg="8">
        <ChartCard title="订单类型分布" :option="pieOption" />
      </el-col>
    </el-row>

    <el-row :gutter="20" class="task-section">
      <el-col :xs="24" :md="12">
        <el-card class="task-card">
          <template #header>
            <div class="card-header">
              <span><el-icon><User /></el-icon>新申请入驻搭子</span>
              <el-tag type="warning" v-if="pendingTasks.newApplications > 0">{{ pendingTasks.newApplications }} 待处理</el-tag>
            </div>
          </template>
          <div v-if="pendingTasks.newApplications > 0" class="task-alert">
            <el-alert :title="`有 ${pendingTasks.newApplications} 位新搭子申请入驻`" type="warning" :closable="false" show-icon>
              <el-button type="primary" size="small" @click="goToCompanions">立即处理</el-button>
            </el-alert>
          </div>
          <el-empty v-else description="暂无新申请" :image-size="80" />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card class="task-card">
          <template #header>
            <div class="card-header">
              <span><el-icon><Warning /></el-icon>待处理投诉</span>
              <el-tag type="danger" v-if="pendingTasks.pendingComplaints > 0">{{ pendingTasks.pendingComplaints }} 待处理</el-tag>
            </div>
          </template>
          <div v-if="pendingTasks.pendingComplaints > 0" class="task-alert">
            <el-alert :title="`有 ${pendingTasks.pendingComplaints} 个订单投诉待处理`" type="error" :closable="false" show-icon>
              <el-button type="danger" size="small" @click="goToOrders">立即处理</el-button>
            </el-alert>
          </div>
          <el-empty v-else description="暂无待处理投诉" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { useDashboardStatsStore } from '@/stores/dashboardStats'
import { useDashboardAnalyticsStore } from '@/stores/dashboardAnalytics'
import { usePendingTasksStore } from '@/stores/pendingTasks'
import StatCard from '@/components/common/StatCard.vue'
import ChartCard from '@/components/common/ChartCard.vue'

const router = useRouter()
const statsStore = useDashboardStatsStore()
const analyticsStore = useDashboardAnalyticsStore()
const tasksStore = usePendingTasksStore()

const trendPeriod = ref('week')
const updateTime = ref('')

const stats = computed(() => statsStore.stats)
const activityTrend = computed(() => analyticsStore.activityTrend)
const orderTypes = computed(() => analyticsStore.orderTypes)
const pendingTasks = computed(() => tasksStore.tasks || { newApplications: 0, pendingComplaints: 0 })
const loading = computed(() => statsStore.loading || analyticsStore.loading || tasksStore.loading)

const onlineRate = computed(() => {
  const total = stats.value?.totalCompanions
  if (!total) return 0
  return Math.round((stats.value?.onlineCompanions / total) * 100)
})

const formatNumber = (num) => num?.toLocaleString() || '0'

const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#7d67ea'
const chartColors = ['#7d67ea', '#67C23A', '#E6A23C', '#F56C6C', '#909399']

const trendOption = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
  legend: { data: ['在线搭子数', '订单数'], bottom: 0 },
  grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
  xAxis: { type: 'category', boundaryGap: false, data: activityTrend.value?.dates || [] },
  yAxis: [
    { type: 'value', name: '在线人数', position: 'left' },
    { type: 'value', name: '订单数', position: 'right' }
  ],
  series: [
    {
      name: '在线搭子数', type: 'line', smooth: true,       data: activityTrend.value?.onlineCounts || [],
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(125, 103, 234, 0.3)' }, { offset: 1, color: 'rgba(125, 103, 234, 0.05)' }]) },
      itemStyle: { color: themeColor }
    },
    { name: '订单数', type: 'line', smooth: true, yAxisIndex: 1, data: activityTrend.value?.orderCounts || [], itemStyle: { color: '#67C23A' } }
  ]
}))

const pieOption = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  legend: { orient: 'vertical', right: '5%', top: 'center' },
  series: [{
    type: 'pie', radius: ['40%', '70%'], center: ['40%', '50%'], avoidLabelOverlap: false,
    itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
    label: { show: false },
    emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
    data: orderTypes.value || []
  }],
  color: chartColors
}))

const goToCompanions = () => router.push('/companions')
const goToOrders = () => router.push('/orders')

onMounted(async () => {
  await Promise.all([
    statsStore.fetchStats(),
    analyticsStore.fetchAll(),
    tasksStore.fetchTasks()
  ])
  updateTime.value = new Date().toLocaleString()
})
</script>

<style scoped lang="scss">
.dashboard-page {
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    h2 { font-size: 24px; font-weight: 500; color: #303133; margin: 0; }
    .update-time { font-size: 13px; color: #909399; }
  }
}
.stat-cards, .chart-section, .task-section { margin-bottom: 20px; .el-col { margin-bottom: 20px; } }
.task-card {
  .card-header { display: flex; justify-content: space-between; align-items: center; font-weight: 500; .el-icon { margin-right: 8px; vertical-align: middle; } }
  .task-alert { width: 100%; :deep(.el-alert__content) { flex: 1; } .el-button { margin-top: 8px; } }
  .task-empty { width: 100%; }
}
</style>
