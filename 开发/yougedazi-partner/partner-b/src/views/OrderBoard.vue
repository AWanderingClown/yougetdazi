<template>
  <div class="order-page">
    <div class="page-header">
      <h2>订单看板</h2>
      <el-button @click="exportData"><el-icon><Download /></el-icon>导出数据</el-button>
    </div>

    <el-row :gutter="20" class="stat-row">
      <StatCard :value="stats.today" label="今日订单" icon="Document" icon-class="blue" />
      <StatCard :value="stats.week" label="本周订单" icon="Calendar" icon-class="green" />
      <StatCard :value="stats.month" label="本月订单" icon="Histogram" icon-class="purple" />
      <StatCard :value="stats.pending" label="待处理" icon="Clock" icon-class="orange" />
    </el-row>

    <SearchFilter :model="filterForm" @search="handleSearch" @reset="resetFilter">
      <el-form-item label="订单状态">
        <el-select v-model="filterForm.status" placeholder="全部状态" clearable style="width: 140px">
          <el-option label="待接单" value="pending" /><el-option label="服务中" value="in_progress" /><el-option label="已完成" value="completed" /><el-option label="已取消" value="cancelled" />
        </el-select>
      </el-form-item>
      <el-form-item label="服务类型">
        <el-select v-model="filterForm.type" placeholder="全部类型" clearable style="width: 140px">
          <el-option label="游戏陪玩" value="game" /><el-option label="语音聊天" value="voice" /><el-option label="线下活动" value="offline" /><el-option label="才艺展示" value="talent" />
        </el-select>
      </el-form-item>
      <el-form-item label="搭子"><el-input v-model="filterForm.companion" placeholder="搜索搭子昵称" clearable style="width: 160px" /></el-form-item>
      <el-form-item label="日期范围">
        <el-date-picker v-model="filterForm.dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width: 260px" />
      </el-form-item>
    </SearchFilter>

    <el-card class="order-list-card">
      <DataTable :data="orderList" :loading="loading" :total="pagination.total" v-model:page="pagination.page" v-model:page-size="pagination.pageSize" @size-change="loadData" @page-change="loadData">
        <el-table-column type="index" width="50" />
        <el-table-column label="订单编号" prop="id" width="160" />
        <el-table-column label="搭子" width="120">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.companionName }}</el-tag></template>
        </el-table-column>
        <el-table-column label="服务类型" width="120">
          <template #default="{ row }"><el-tag :type="getServiceTypeType(row.serviceType)" size="small">{{ row.serviceType }}</el-tag></template>
        </el-table-column>
        <el-table-column label="时长" width="80" align="center"><template #default="{ row }">{{ row.duration }}小时</template></el-table-column>
        <el-table-column label="金额" width="120" align="right"><template #default="{ row }"><span class="order-amount">¥{{ row.amount }}</span></template></el-table-column>
        <el-table-column label="C端用户信息" min-width="200">
          <template #default="{ row }">
            <div class="user-info-masked">
              <p><el-icon><User /></el-icon><span class="masked">{{ row.userInfo.nickname }}</span></p>
              <p class="order-count"><el-tag size="small" type="info">历史订单 {{ row.userInfo.orderCount }} 笔</el-tag></p>
              <p class="user-note" v-if="row.userInfo.note"><el-icon><ChatDotSquare /></el-icon>{{ row.userInfo.note }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="下单时间" width="160"><template #default="{ row }">{{ row.createTime }}</template></el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" text @click="viewDetail(row)">详情</el-button>
            <el-button v-if="row.status === 'completed' && hasComplaint(row)" type="danger" size="small" text @click="handleComplaint(row)">投诉</el-button>
          </template>
        </el-table-column>
      </DataTable>
    </el-card>

    <el-dialog v-model="detailDialogVisible" title="订单详情" width="600px">
      <div v-if="currentOrder" class="order-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单编号" :span="2">{{ currentOrder.id }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ currentOrder.createTime }}</el-descriptions-item>
          <el-descriptions-item label="订单状态"><el-tag :type="getStatusType(currentOrder.status)">{{ getStatusText(currentOrder.status) }}</el-tag></el-descriptions-item>
        </el-descriptions>
        <div class="detail-section">
          <h4>服务信息</h4>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="服务搭子">{{ currentOrder.companionName }}</el-descriptions-item>
            <el-descriptions-item label="服务类型">{{ currentOrder.serviceType }}</el-descriptions-item>
            <el-descriptions-item label="服务时长">{{ currentOrder.duration }} 小时</el-descriptions-item>
            <el-descriptions-item label="订单金额"><span class="amount">¥{{ currentOrder.amount }}</span></el-descriptions-item>
          </el-descriptions>
        </div>
        <div class="detail-section">
          <h4>C端用户信息（脱敏）</h4>
          <el-alert title="根据平台隐私保护政策，B端无法查看C端用户的真实联系方式" type="info" :closable="false" show-icon style="margin-bottom: 16px" />
          <el-descriptions :column="1" border>
            <el-descriptions-item label="用户昵称"><span class="masked">{{ currentOrder.userInfo?.nickname }}</span></el-descriptions-item>
            <el-descriptions-item label="历史订单">{{ currentOrder.userInfo?.orderCount }} 笔</el-descriptions-item>
            <el-descriptions-item label="备注需求">{{ currentOrder.userInfo?.note || '无' }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
    </el-dialog>

    <FormDialog v-model="complaintDialogVisible" title="投诉处理" :model="complaintForm" @confirm="submitComplaint">
      <el-form-item label="投诉原因">
        <el-select v-model="complaintForm.reason" placeholder="请选择投诉原因" style="width: 100%">
          <el-option label="服务态度问题" value="attitude" /><el-option label="未按时服务" value="late" /><el-option label="服务质量不符" value="quality" /><el-option label="其他原因" value="other" />
        </el-select>
      </el-form-item>
      <el-form-item label="处理说明"><el-input v-model="complaintForm.remark" type="textarea" :rows="4" placeholder="请输入处理说明" /></el-form-item>
    </FormDialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { mockOrders } from '@/utils/mockData'
import { ORDER_STATUS_MAP, SERVICE_TYPE_MAP, getStatusInfo, MOCK_DELAY, PAGE_SIZE } from '@/utils/index'
import StatCard from '@/components/common/StatCard.vue'
import SearchFilter from '@/components/common/SearchFilter.vue'
import DataTable from '@/components/common/DataTable.vue'
import FormDialog from '@/components/common/FormDialog.vue'

const loading = ref(false)
const stats = reactive({ today: 86, week: 586, month: 2156, pending: 12 })
const filterForm = reactive({ status: '', type: '', companion: '', dateRange: [] })
const pagination = reactive({ page: 1, pageSize: PAGE_SIZE, total: 0 })
const orderList = ref([])
const detailDialogVisible = ref(false)
const complaintDialogVisible = ref(false)
const currentOrder = ref(null)
const complaintForm = reactive({ reason: '', remark: '' })

const getStatusType = (status) => getStatusInfo(ORDER_STATUS_MAP, status).type
const getStatusText = (status) => getStatusInfo(ORDER_STATUS_MAP, status).text
const getServiceTypeType = (type) => SERVICE_TYPE_MAP[type]?.type || ''
const hasComplaint = () => Math.random() > 0.8

const loadData = async () => {
  loading.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY.MEDIUM))
    orderList.value = mockOrders
    pagination.total = mockOrders.length
  } catch (error) {
    ElMessage.error('加载数据失败')
    console.error('loadData error:', error)
  } finally {
    loading.value = false
  }
}
const handleSearch = () => { pagination.page = 1; loadData() }
const resetFilter = () => { filterForm.status = ''; filterForm.type = ''; filterForm.companion = ''; filterForm.dateRange = []; handleSearch() }
const viewDetail = (row) => { currentOrder.value = row; detailDialogVisible.value = true }
const handleComplaint = (row) => { currentOrder.value = row; complaintForm.reason = ''; complaintForm.remark = ''; complaintDialogVisible.value = true }
const submitComplaint = () => {
  if (!complaintForm.reason) {
    ElMessage.warning('请选择投诉原因')
    return
  }
  ElMessage.success('投诉处理已提交')
  complaintDialogVisible.value = false
}
const exportData = () => ElMessage.success('订单数据导出成功')

onMounted(loadData)
</script>

<style scoped lang="scss">
.order-page { .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; h2 { font-size: 24px; font-weight: 500; color: #303133; margin: 0; } } }
.stat-row { margin-bottom: 20px; }
.order-list-card { .order-amount { color: #F56C6C; font-weight: 500; } .user-info-masked { p { display: flex; align-items: center; gap: 6px; margin: 4px 0; font-size: 13px; .el-icon { color: #909399; font-size: 14px; } .masked { font-family: monospace; } } .order-count { margin-top: 4px; } .user-note { color: #606266; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } } }
.order-detail { .detail-section { margin-top: 24px; h4 { font-size: 16px; font-weight: 500; color: #303133; margin-bottom: 16px; padding-left: 8px; border-left: 4px solid #7d67ea; } .amount { color: #F56C6C; font-weight: 600; font-size: 16px; } .masked { font-family: monospace; color: #606266; } } }
</style>
