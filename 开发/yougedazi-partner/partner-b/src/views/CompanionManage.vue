<template>
  <div class="companion-page">
    <div class="page-header">
      <h2>搭子管理</h2>
      <el-button type="primary" @click="showApplyDialog = true"><el-icon><Plus /></el-icon>添加搭子</el-button>
    </div>

    <el-row :gutter="20" class="stat-row">
      <StatCard :value="totalCompanions" label="全部搭子" icon="User" icon-class="blue" />
      <StatCard :value="onlineCompanions" label="在线中" icon="CircleCheck" icon-class="green" />
      <StatCard :value="pendingApplications" label="待审核" icon="Clock" icon-class="orange" />
    </el-row>

    <SearchFilter :model="filterForm" @search="handleSearch" @reset="resetFilter">
      <el-form-item label="状态">
        <el-select v-model="filterForm.status" placeholder="全部状态" clearable style="width: 120px">
          <el-option label="在线" value="online" /><el-option label="忙碌" value="busy" /><el-option label="离线" value="offline" />
        </el-select>
      </el-form-item>
      <el-form-item label="昵称">
        <el-input v-model="filterForm.nickname" placeholder="搜索昵称" clearable style="width: 200px" />
      </el-form-item>
    </SearchFilter>

    <el-tabs v-model="activeTab" type="border-card" class="companion-tabs">
      <el-tab-pane label="搭子列表" name="list">
        <DataTable :data="companionList" :loading="loading" :total="pagination.total" v-model:page="pagination.page" v-model:page-size="pagination.pageSize" @size-change="loadData" @page-change="loadData">
          <el-table-column type="index" width="50" />
          <el-table-column label="头像" width="80">
            <template #default="{ row }"><el-avatar :size="50" :src="row.avatar" /></template>
          </el-table-column>
          <el-table-column label="昵称" min-width="120">
            <template #default="{ row }">
              <div class="companion-name"><span class="name">{{ row.nickname }}</span><el-rate v-model="row.rating" disabled :colors="['#7d67ea', '#7d67ea', '#7d67ea']" /></div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag></template>
          </el-table-column>
          <el-table-column label="今日订单" width="100" align="center">
            <template #default="{ row }"><span class="order-num">{{ row.todayOrders }}</span></template>
          </el-table-column>
          <el-table-column label="本月收入" width="120" align="right">
            <template #default="{ row }"><span class="income">¥{{ row.monthIncome }}</span></template>
          </el-table-column>
          <el-table-column label="入驻时间" width="120">
            <template #default="{ row }">{{ formatDate(row.joinTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" size="small" text @click="viewDetail(row)">详情</el-button>
              <el-button type="primary" size="small" text @click="viewOrders(row)">订单</el-button>
              <el-dropdown @command="(cmd) => handleCommand(cmd, row)">
                <el-button type="primary" size="small" text>更多<el-icon class="el-icon--right"><arrow-down /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="enable" v-if="row.status === 'disabled'">启用账号</el-dropdown-item>
                    <el-dropdown-item command="disable" v-if="row.status !== 'disabled'">禁用账号</el-dropdown-item>
                    <el-dropdown-item command="edit">编辑信息</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </DataTable>
      </el-tab-pane>

      <el-tab-pane :label="`入驻审核 (${pendingApplications})`" name="audit">
        <DataTable :data="applicationList" :loading="loading">
          <el-table-column type="index" width="50" />
          <el-table-column label="申请人" min-width="150">
            <template #default="{ row }">
              <div class="applicant-info"><el-avatar :size="40" :src="row.avatar" /><div class="applicant-detail"><div class="nickname">{{ row.nickname }}</div><div class="apply-time">{{ row.applyTime }}</div></div></div>
            </template>
          </el-table-column>
          <el-table-column label="技能标签" min-width="200">
            <template #default="{ row }"><el-tag v-for="skill in row.skills" :key="skill" size="small" class="skill-tag">{{ skill }}</el-tag></template>
          </el-table-column>
          <el-table-column label="经验描述" min-width="200">
            <template #default="{ row }">{{ row.experience }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button type="success" size="small" @click="handleAudit(row, 'pass')">通过</el-button>
              <el-button type="danger" size="small" @click="handleAudit(row, 'reject')">拒绝</el-button>
              <el-button type="primary" size="small" text @click="viewApplication(row)">查看资料</el-button>
            </template>
          </el-table-column>
        </DataTable>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="detailDialogVisible" title="搭子详情" width="700px">
      <div v-if="currentCompanion" class="companion-detail">
        <div class="detail-header">
          <el-avatar :size="80" :src="currentCompanion.avatar" />
          <div class="detail-basic">
            <h3>{{ currentCompanion.nickname }}</h3>
            <el-rate v-model="currentCompanion.rating" disabled />
            <div class="detail-tags"><el-tag v-for="tag in currentCompanion.tags" :key="tag" size="small">{{ tag }}</el-tag></div>
          </div>
        </div>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="账号状态"><el-tag :type="getStatusType(currentCompanion.status)">{{ getStatusText(currentCompanion.status) }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="入驻时间">{{ currentCompanion.joinTime }}</el-descriptions-item>
          <el-descriptions-item label="今日订单">{{ currentCompanion.todayOrders }} 单</el-descriptions-item>
          <el-descriptions-item label="本月收入">¥{{ currentCompanion.monthIncome }}</el-descriptions-item>
          <el-descriptions-item label="联系方式" :span="2">
            <div class="contact-info">
              <p><el-icon><Iphone /></el-icon>手机号：<span class="masked">{{ currentCompanion.phone }}</span><el-tag size="small" type="info">脱敏显示</el-tag></p>
              <p><el-icon><ChatDotRound /></el-icon>微信号：<span class="masked">{{ currentCompanion.wechat }}</span><el-tag size="small" type="info">脱敏显示</el-tag></p>
              <el-alert title="为保护搭子隐私，联系方式已脱敏处理" type="info" :closable="false" show-icon />
            </div>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>

    <FormDialog v-model="showApplyDialog" title="添加搭子" :model="applyForm" @confirm="submitApply">
      <el-form-item label="搭子账号"><el-input v-model="applyForm.account" placeholder="请输入搭子在平台的注册账号" /></el-form-item>
      <el-form-item label="邀请备注"><el-input v-model="applyForm.remark" type="textarea" :rows="3" placeholder="可选，给搭子的邀请留言" /></el-form-item>
    </FormDialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { mockCompanions, mockApplications } from '@/utils/mockData'
import { COMPANION_STATUS, COMPANION_STATUS_MAP, getStatusInfo, PAGE_SIZE, MOCK_DELAY } from '@/utils/index'
import StatCard from '@/components/common/StatCard.vue'
import SearchFilter from '@/components/common/SearchFilter.vue'
import DataTable from '@/components/common/DataTable.vue'
import FormDialog from '@/components/common/FormDialog.vue'

const loading = ref(false)
const activeTab = ref('list')
const filterForm = reactive({ status: '', nickname: '' })
const pagination = reactive({ page: 1, pageSize: PAGE_SIZE, total: 0 })
const companionList = ref([])
const applicationList = ref([])
const totalCompanions = ref(0)
const onlineCompanions = ref(0)
const pendingApplications = ref(0)
const detailDialogVisible = ref(false)
const showApplyDialog = ref(false)
const currentCompanion = ref(null)
const applyForm = reactive({ account: '', remark: '' })

const getStatusType = (status) => getStatusInfo(COMPANION_STATUS_MAP, status).type
const getStatusText = (status) => getStatusInfo(COMPANION_STATUS_MAP, status).text
const formatDate = (date) => dayjs(date).format('YYYY-MM-DD')

const loadData = async () => {
  loading.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY.MEDIUM))
    companionList.value = mockCompanions
    applicationList.value = mockApplications
    totalCompanions.value = mockCompanions.length
    onlineCompanions.value = mockCompanions.filter(c => c.status === COMPANION_STATUS.ONLINE).length
    pendingApplications.value = mockApplications.length
    pagination.total = mockCompanions.length
  } catch (error) {
    ElMessage.error('加载数据失败')
    console.error('loadData error:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { pagination.page = 1; loadData() }
const resetFilter = () => { filterForm.status = ''; filterForm.nickname = ''; handleSearch() }
const viewDetail = (row) => { currentCompanion.value = row; detailDialogVisible.value = true }
const viewOrders = (row) => ElMessage.info(`查看 ${row.nickname} 的订单`)
const handleCommand = (command, row) => {
  if (command === 'enable') ElMessage.success(`已启用 ${row.nickname} 的账号`)
  else if (command === 'disable') ElMessageBox.confirm(`确定要禁用 ${row.nickname} 的账号吗？`, '提示', { type: 'warning' }).then(() => ElMessage.success('账号已禁用'))
  else ElMessage.info('编辑功能开发中')
}
const handleAudit = (row, action) => { const actionText = action === 'pass' ? '通过' : '拒绝'; ElMessageBox.confirm(`确定要${actionText} ${row.nickname} 的入驻申请吗？`, '审核确认', { type: action === 'pass' ? 'success' : 'warning' }).then(() => { ElMessage.success(`已${actionText}申请`); loadData() }) }
const viewApplication = (row) => ElMessage.info(`查看 ${row.nickname} 的详细资料`)
const submitApply = () => { if (!applyForm.account) { ElMessage.warning('请输入搭子账号'); return }; ElMessage.success('邀请已发送'); showApplyDialog.value = false; applyForm.account = ''; applyForm.remark = '' }

onMounted(loadData)
</script>

<style scoped lang="scss">
.companion-page { .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; h2 { font-size: 24px; font-weight: 500; color: #303133; margin: 0; } } }
.stat-row { margin-bottom: 20px; }
.companion-tabs { .companion-name { .name { font-weight: 500; margin-right: 8px; } :deep(.el-rate) { display: inline-block; vertical-align: middle; } } .order-num { color: #7d67ea; font-weight: 500; } .income { color: #F56C6C; font-weight: 500; } }
.applicant-info { display: flex; align-items: center; .applicant-detail { margin-left: 12px; .nickname { font-weight: 500; margin-bottom: 4px; } .apply-time { font-size: 12px; color: #909399; } } }
.skill-tag { margin-right: 8px; margin-bottom: 4px; }
.companion-detail { .detail-header { display: flex; align-items: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #ebeef5; .detail-basic { margin-left: 20px; h3 { margin: 0 0 8px 0; font-size: 20px; } .detail-tags { margin-top: 8px; .el-tag { margin-right: 8px; } } } } .contact-info { p { display: flex; align-items: center; gap: 8px; margin: 8px 0; .el-icon { color: #909399; } .masked { font-family: monospace; color: #606266; } } .el-alert { margin-top: 12px; } } }
</style>
