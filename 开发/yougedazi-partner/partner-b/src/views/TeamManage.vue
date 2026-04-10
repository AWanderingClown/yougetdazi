<template>
  <div class="team-page">
    <div class="page-header">
      <h2>团队管理</h2>
      <el-button type="primary" @click="showAddAccountDialog">
        <el-icon><Plus /></el-icon>
        添加子账号
      </el-button>
    </div>

    <el-row :gutter="20" class="stat-row">
      <StatCard :value="stats.total" label="子账号总数" icon="User" icon-class="blue" />
      <StatCard :value="stats.active" label="正常使用" icon="CircleCheck" icon-class="green" />
      <StatCard :value="stats.inactive" label="已禁用" icon="Lock" icon-class="orange" />
    </el-row>

    <el-tabs v-model="activeTab" type="border-card" class="team-tabs">
      <el-tab-pane label="子账号管理" name="accounts">
        <DataTable :data="accountList" :loading="loading" :total="pagination.total" v-model:page="pagination.page" v-model:page-size="pagination.pageSize" @size-change="loadData" @page-change="loadData">
          <el-table-column type="index" width="50" />
          <el-table-column label="账号" prop="username" width="140" />
          <el-table-column label="姓名" prop="name" width="120" />
          <el-table-column label="角色" width="140">
            <template #default="{ row }">
              <el-tag :type="getRoleType(row.role)">{{ getRoleLabel(row.role) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-switch v-model="row.status" active-value="active" inactive-value="inactive" @change="(val) => handleStatusChange(row, val)" />
            </template>
          </el-table-column>
          <el-table-column label="最后登录" width="160">
            <template #default="{ row }">{{ row.lastLogin || '从未登录' }}</template>
          </el-table-column>
          <el-table-column label="创建时间" width="120">
            <template #default="{ row }">{{ formatDate(row.createTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" size="small" text @click="editAccount(row)">编辑</el-button>
              <el-button type="primary" size="small" text @click="resetPassword(row)">重置密码</el-button>
              <el-popconfirm title="确定要删除该账号吗？" @confirm="deleteAccount(row)">
                <template #reference>
                  <el-button type="danger" size="small" text>删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </DataTable>
      </el-tab-pane>

      <el-tab-pane label="角色权限" name="roles">
        <el-row :gutter="20">
          <el-col :xs="24" :lg="8">
            <el-card>
              <template #header><span>角色列表</span></template>
              <el-menu :default-active="selectedRole" @select="handleRoleSelect">
                <el-menu-item v-for="role in roleList" :key="role.id" :index="role.name">
                  <el-icon><UserFilled /></el-icon>
                  <span>{{ role.label }}</span>
                </el-menu-item>
              </el-menu>
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="16">
            <el-card>
              <template #header>
                <div class="permission-header">
                  <span>{{ currentRole?.label }} - 权限配置</span>
                  <el-button type="primary" size="small">保存配置</el-button>
                </div>
              </template>
              <el-checkbox-group v-model="selectedPermissions" class="permission-group">
                <div class="permission-category" v-for="category in permissionCategories" :key="category.key">
                  <h4>{{ category.label }}</h4>
                  <el-checkbox v-for="perm in category.permissions" :key="perm.value" :label="perm.value">{{ perm.label }}</el-checkbox>
                </div>
              </el-checkbox-group>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <el-tab-pane label="操作日志" name="logs">
        <SearchFilter :model="logFilter" @search="searchLogs" @reset="resetLogFilter">
          <el-form-item label="操作人">
            <el-input v-model="logFilter.operator" placeholder="搜索操作人" clearable style="width: 160px" />
          </el-form-item>
          <el-form-item label="日期范围">
            <el-date-picker v-model="logFilter.dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width: 260px" />
          </el-form-item>
        </SearchFilter>

        <el-timeline class="log-timeline">
          <el-timeline-item v-for="log in logList" :key="log.id" :timestamp="log.time" :type="getLogType(log.action)">
            <el-card class="log-card">
              <div class="log-content">
                <div class="log-operator">
                  <el-avatar :size="32">{{ log.operator.charAt(0) }}</el-avatar>
                  <span class="operator-name">{{ log.operator }}</span>
                </div>
                <div class="log-action">
                  <span class="action-text">{{ log.action }}</span>
                  <el-tag size="small" type="info">{{ log.target }}</el-tag>
                  <span class="target-id">{{ log.targetId }}</span>
                </div>
                <div class="log-ip">IP: {{ log.ip }}</div>
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </el-tab-pane>
    </el-tabs>

    <FormDialog v-model="accountDialogVisible" :title="isEdit ? '编辑子账号' : '添加子账号'" :model="accountForm" :rules="accountRules" :loading="saving" @confirm="saveAccount">
      <el-form-item label="账号" prop="username">
        <el-input v-model="accountForm.username" placeholder="请输入登录账号" :disabled="isEdit" />
      </el-form-item>
      <el-form-item label="姓名" prop="name">
        <el-input v-model="accountForm.name" placeholder="请输入姓名" />
      </el-form-item>
      <el-form-item label="角色" prop="role">
        <el-select v-model="accountForm.role" placeholder="请选择角色" style="width: 100%">
          <el-option v-for="role in roleList" :key="role.id" :label="role.label" :value="role.name" />
        </el-select>
      </el-form-item>
      <el-form-item label="初始密码" prop="password" v-if="!isEdit">
        <el-input v-model="accountForm.password" type="password" placeholder="请输入初始密码" show-password />
        <span class="form-tip">初始密码将发送给该员工</span>
      </el-form-item>
    </FormDialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { mockSubAccounts, mockRoles, mockLogs } from '@/utils/mockData'
import { ROLE_MAP, LOG_TYPE_MAP, getStatusInfo, PAGE_SIZE } from '@/utils/index'
import StatCard from '@/components/common/StatCard.vue'
import DataTable from '@/components/common/DataTable.vue'
import SearchFilter from '@/components/common/SearchFilter.vue'
import FormDialog from '@/components/common/FormDialog.vue'

const loading = ref(false)
const saving = ref(false)
const activeTab = ref('accounts')
const accountDialogVisible = ref(false)
const isEdit = ref(false)
const formDialogRef = ref(null)

const stats = reactive({ total: 0, active: 0, inactive: 0 })
const pagination = reactive({ page: 1, pageSize: PAGE_SIZE, total: 0 })
const accountList = ref([])
const roleList = ref([])
const logList = ref([])
const selectedRole = ref('admin')
const selectedPermissions = ref([])
const logFilter = reactive({ operator: '', dateRange: [] })
const accountForm = reactive({ id: null, username: '', name: '', role: '', password: '' })
const accountRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  password: [{ required: true, message: '请输入初始密码', trigger: 'blur' }]
}

const permissionCategories = [
  { key: 'companion', label: '搭子管理', permissions: [{ value: 'companion:view', label: '查看搭子' }, { value: 'companion:audit', label: '审核入驻' }, { value: 'companion:edit', label: '编辑搭子' }] },
  { key: 'order', label: '订单管理', permissions: [{ value: 'order:view', label: '查看订单' }, { value: 'order:handle', label: '处理投诉' }] },
  { key: 'settlement', label: '结算中心', permissions: [{ value: 'settlement:view', label: '查看结算' }, { value: 'settlement:withdraw', label: '申请提现' }] },
  { key: 'team', label: '团队管理', permissions: [{ value: 'team:view', label: '查看子账号' }, { value: 'team:manage', label: '管理子账号' }, { value: 'team:log', label: '查看日志' }] }
]

const currentRole = computed(() => roleList.value.find(r => r.name === selectedRole.value))

const getRoleType = (role) => getStatusInfo(ROLE_MAP, role).type
const getRoleLabel = (role) => getStatusInfo(ROLE_MAP, role).text
const formatDate = (date) => dayjs(date).format('YYYY-MM-DD')
const getLogType = (action) => LOG_TYPE_MAP[action]?.type || ''

const loadData = async () => {
  loading.value = true
  try {
    accountList.value = mockSubAccounts
    roleList.value = mockRoles
    logList.value = mockLogs
    stats.total = mockSubAccounts.length
    stats.active = mockSubAccounts.filter(a => a.status === 'active').length
    stats.inactive = mockSubAccounts.filter(a => a.status === 'inactive').length
    pagination.total = mockSubAccounts.length
    if (currentRole.value) selectedPermissions.value = currentRole.value.permissions
  } catch (error) {
    ElMessage.error('加载数据失败')
    console.error('loadData error:', error)
  } finally {
    loading.value = false
  }
}

const handleStatusChange = (row, val) => ElMessage.success(`${row.name} 的账号已${val === 'active' ? '启用' : '禁用'}`)
const editAccount = (row) => { isEdit.value = true; Object.assign(accountForm, row); accountDialogVisible.value = true }
const showAddAccountDialog = () => {
  isEdit.value = false
  accountForm.id = null
  accountForm.username = ''
  accountForm.name = ''
  accountForm.role = ''
  accountForm.password = ''
  accountDialogVisible.value = true
}
const saveAccount = () => { ElMessage.success(isEdit.value ? '账号更新成功' : '账号创建成功'); accountDialogVisible.value = false; loadData() }
const resetPassword = (row) => ElMessageBox.confirm(`确定要重置 ${row.name} 的密码吗？`, '提示', { type: 'warning' }).then(() => ElMessage.success('密码已重置，新密码将通过短信发送'))
const deleteAccount = (row) => { ElMessage.success(`${row.name} 的账号已删除`); loadData() }
const handleRoleSelect = (roleName) => { selectedRole.value = roleName; const role = roleList.value.find(r => r.name === roleName); if (role) selectedPermissions.value = role.permissions }
const searchLogs = () => ElMessage.success('日志搜索完成')
const resetLogFilter = () => { logFilter.operator = ''; logFilter.dateRange = [] }

onMounted(loadData)
</script>

<style scoped lang="scss">
.team-page {
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    h2 { font-size: 24px; font-weight: 500; color: #303133; margin: 0; }
  }
}
.stat-row { margin-bottom: 20px; }
.team-tabs { .pagination-wrapper { margin-top: 20px; display: flex; justify-content: flex-end; } }
.role-menu { border-right: none; }
.permission-header { display: flex; justify-content: space-between; align-items: center; font-weight: 500; }
.permission-group { .permission-category { margin-bottom: 24px; h4 { font-size: 14px; font-weight: 500; color: #303133; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #ebeef5; } .el-checkbox { display: block; margin-bottom: 8px; margin-right: 0; } } }
.log-filter { margin-bottom: 20px; }
.log-timeline { padding: 20px; .log-card { .log-content { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; .log-operator { display: flex; align-items: center; gap: 8px; .operator-name { font-weight: 500; } } .log-action { display: flex; align-items: center; gap: 8px; flex: 1; .action-text { color: #7d67ea; } .target-id { color: #909399; font-size: 12px; } } .log-ip { color: #909399; font-size: 12px; } } } }
.form-tip { font-size: 12px; color: #909399; margin-top: 4px; display: block; }
</style>
