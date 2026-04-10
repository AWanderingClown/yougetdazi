<template>
  <div class="settlement-page">
    <div class="page-header">
      <h2>结算中心</h2>
      <el-button type="primary" @click="showWithdrawDialog = true"><el-icon><Money /></el-icon>申请提现</el-button>
    </div>

    <el-row :gutter="20" class="finance-overview">
      <FinanceCard :value="'¥' + formatNumber(settlement.availableBalance)" label="可提现余额" icon="Wallet" type="primary" />
      <FinanceCard :value="'¥' + formatNumber(settlement.frozenAmount)" label="冻结金额" icon="Lock" type="warning" />
      <FinanceCard :value="'¥' + formatNumber(settlement.totalRevenue)" label="累计总流水" icon="TrendCharts" type="success" />
      <FinanceCard :value="(settlement.commissionRate * 100).toFixed(0) + '%'" label="佣金比例" icon="Percentage" type="info" />
    </el-row>

    <el-tabs v-model="activeTab" type="border-card" class="settlement-tabs">
      <el-tab-pane label="佣金明细" name="commission">
        <DataTable :data="commissionList" :loading="loading" :total="commissionPagination.total" v-model:page="commissionPagination.page" v-model:page-size="commissionPagination.pageSize" @size-change="loadData" @page-change="loadData">
          <el-table-column type="index" width="50" />
          <el-table-column label="订单编号" prop="orderId" width="160" />
          <el-table-column label="搭子" width="120"><template #default="{ row }"><el-tag size="small" effect="plain">{{ row.companionName }}</el-tag></template></el-table-column>
          <el-table-column label="订单金额" width="120" align="right"><template #default="{ row }">¥{{ row.amount }}</template></el-table-column>
          <el-table-column label="佣金金额" width="120" align="right"><template #default="{ row }"><span class="commission-amount">¥{{ row.commission }}</span></template></el-table-column>
          <el-table-column label="结算时间" width="160"><template #default="{ row }">{{ row.createTime }}</template></el-table-column>
          <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 'settled' ? 'success' : 'warning'" size="small">{{ row.status === 'settled' ? '已结算' : '待结算' }}</el-tag></template></el-table-column>
        </DataTable>
      </el-tab-pane>

      <el-tab-pane label="提现记录" name="withdrawal">
        <DataTable :data="withdrawalList" :loading="loading" :total="withdrawalPagination.total" v-model:page="withdrawalPagination.page" v-model:page-size="withdrawalPagination.pageSize" @size-change="loadData" @page-change="loadData">
          <el-table-column type="index" width="50" />
          <el-table-column label="提现金额" width="120" align="right"><template #default="{ row }"><span class="withdraw-amount">¥{{ formatNumber(row.amount) }}</span></template></el-table-column>
          <el-table-column label="收款账户" min-width="200"><template #default="{ row }">{{ row.account }}</template></el-table-column>
          <el-table-column label="申请时间" width="160"><template #default="{ row }">{{ row.applyTime }}</template></el-table-column>
          <el-table-column label="到账时间" width="160"><template #default="{ row }">{{ row.completeTime || '-' }}</template></el-table-column>
          <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="getWithdrawStatusType(row.status)" size="small">{{ getWithdrawStatusText(row.status) }}</el-tag></template></el-table-column>
        </DataTable>
      </el-tab-pane>

      <el-tab-pane label="结算配置" name="config">
        <el-card class="config-card">
          <template #header><div class="config-header"><span>结算周期设置</span><el-tag type="info">自动结算</el-tag></div></template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="结算周期">T+7（订单完成后7天结算）</el-descriptions-item>
            <el-descriptions-item label="最低提现金额">¥1000.00</el-descriptions-item>
            <el-descriptions-item label="提现手续费">0%（平台承担）</el-descriptions-item>
            <el-descriptions-item label="到账时间">1-3个工作日</el-descriptions-item>
            <el-descriptions-item label="收款账户">工商银行（尾号8888）<el-button type="primary" size="small" text class="change-btn">更换账户</el-button></el-descriptions-item>
          </el-descriptions>
        </el-card>
        <el-card class="config-card rate-card">
          <template #header><div class="config-header"><span>佣金比例说明</span></div></template>
          <el-alert title="佣金计算规则" type="info" :closable="false" show-icon style="margin-bottom: 16px">
            <p>佣金 = 订单金额 × 佣金比例</p>
            <p>当前您的公会佣金比例为 {{ (settlement.commissionRate * 100).toFixed(0) }}%</p>
          </el-alert>
          <el-table :data="rateTiers" stripe>
            <el-table-column label="月流水区间" prop="range" /><el-table-column label="佣金比例" prop="rate" /><el-table-column label="说明" prop="desc" />
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <FormDialog v-model="showWithdrawDialog" title="申请提现" :model="withdrawForm" :rules="withdrawRules" :loading="submitting" @confirm="submitWithdraw" ref="withdrawFormRef">
      <el-form-item label="可提现余额"><div class="available-balance">¥{{ formatNumber(settlement.availableBalance) }}</div></el-form-item>
      <el-form-item label="提现金额" prop="amount">
        <el-input-number v-model="withdrawForm.amount" :min="1000" :max="settlement.availableBalance" :precision="2" :step="100" style="width: 200px" /><span class="unit">元</span>
      </el-form-item>
      <el-form-item label="收款账户"><div class="account-info"><p>工商银行（尾号8888）</p><el-button type="primary" size="small" text>更换账户</el-button></div></el-form-item>
      <el-form-item label="预计到账"><div class="estimate-info"><p>1-3个工作日</p><p class="tip">提现申请提交后，平台将在1-3个工作日内处理</p></div></el-form-item>
    </FormDialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { mockSettlement, mockCommissions, mockWithdrawals } from '@/utils/mockData'
import { WITHDRAW_STATUS_MAP, getStatusInfo, formatMoney, PAGE_SIZE, MOCK_DELAY } from '@/utils/index'
import FinanceCard from '@/components/common/FinanceCard.vue'
import DataTable from '@/components/common/DataTable.vue'
import FormDialog from '@/components/common/FormDialog.vue'

const loading = ref(false)
const submitting = ref(false)
const activeTab = ref('commission')
const showWithdrawDialog = ref(false)
const withdrawFormRef = ref(null)
const settlement = reactive({ ...mockSettlement })
const commissionPagination = reactive({ page: 1, pageSize: PAGE_SIZE, total: 0 })
const withdrawalPagination = reactive({ page: 1, pageSize: PAGE_SIZE, total: 0 })
const commissionList = ref([])
const withdrawalList = ref([])
const withdrawForm = reactive({ amount: 1000 })
const withdrawRules = { amount: [{ required: true, message: '请输入提现金额', trigger: 'blur' }, { type: 'number', min: 1000, message: '最低提现金额为1000元', trigger: 'blur' }] }
const rateTiers = [
  { range: '0 - 50,000', rate: '25%', desc: '基础档位' },
  { range: '50,000 - 100,000', rate: '28%', desc: '达标档位' },
  { range: '100,000 - 200,000', rate: '30%', desc: '当前档位' },
  { range: '200,000+', rate: '32%', desc: '优秀档位' }
]

const getWithdrawStatusType = (status) => getStatusInfo(WITHDRAW_STATUS_MAP, status).type
const getWithdrawStatusText = (status) => getStatusInfo(WITHDRAW_STATUS_MAP, status).text

const loadData = async () => {
  loading.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY.MEDIUM))
    commissionList.value = mockCommissions
    withdrawalList.value = mockWithdrawals
    commissionPagination.total = mockCommissions.length
    withdrawalPagination.total = mockWithdrawals.length
  } catch (error) {
    ElMessage.error('加载数据失败')
    console.error('loadData error:', error)
  } finally {
    loading.value = false
  }
}
const submitWithdraw = async () => {
  const valid = await withdrawFormRef.value?.formRef.validate().catch(() => false)
  if (!valid) {
    submitting.value = false
    return
  }
  if (withdrawForm.amount > settlement.availableBalance) {
    ElMessage.warning('提现金额不能大于可提现余额')
    submitting.value = false
    return
  }
  submitting.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY.LONG))
    ElMessage.success('提现申请提交成功')
    showWithdrawDialog.value = false
    loadData()
  } catch (error) {
    ElMessage.error('提现申请提交失败')
  } finally {
    submitting.value = false
  }
}

onMounted(loadData)
</script>

<style scoped lang="scss">
.settlement-page { .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; h2 { font-size: 24px; font-weight: 500; color: #303133; margin: 0; } } }
.finance-overview { margin-bottom: 20px; }
.settlement-tabs { .commission-amount { color: #67C23A; font-weight: 500; } .withdraw-amount { color: #7d67ea; font-weight: 500; } }
.config-card { margin-bottom: 20px; .config-header { display: flex; justify-content: space-between; align-items: center; font-weight: 500; } .change-btn { margin-left: 12px; } .tip { font-size: 13px; color: #909399; margin-top: 8px; } }
.available-balance { font-size: 24px; font-weight: 600; color: #67C23A; }
.unit { margin-left: 8px; color: #606266; }
.account-info { p { font-size: 14px; color: #303133; margin-bottom: 8px; } }
.estimate-info { p { font-size: 14px; color: #303133; &.tip { font-size: 12px; color: #909399; margin-top: 4px; } } }
</style>
