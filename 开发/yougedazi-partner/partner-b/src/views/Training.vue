<template>
  <div class="training-page">
    <div class="page-header">
      <h2>培训资料</h2>
      <div class="read-progress">
        <span class="progress-label">阅读进度：</span>
        <el-progress :percentage="readProgress" :color="progressColors" style="width: 200px" />
        <span class="progress-text">{{ readCount }}/{{ totalCount }}</span>
      </div>
    </div>

    <el-card class="filter-card">
      <div class="category-tabs">
        <div v-for="cat in categories" :key="cat.value" class="category-tab" :class="{ active: currentCategory === cat.value }" @click="currentCategory = cat.value">
          <el-icon :size="18"><component :is="cat.icon" /></el-icon>
          <span>{{ cat.label }}</span>
          <el-tag v-if="cat.unread > 0" type="danger" size="small" class="unread-tag">{{ cat.unread }}</el-tag>
        </div>
      </div>
    </el-card>

    <div class="materials-list">
      <el-row :gutter="20">
        <MaterialCard v-for="item in filteredMaterials" :key="item.id" :item="item" @view="viewMaterial" />
      </el-row>
    </div>

    <el-dialog v-model="detailDialogVisible" :title="currentMaterial?.title" width="800px" class="material-dialog">
      <div v-if="currentMaterial" class="material-content">
        <div class="content-meta">
          <el-tag :type="getTypeTagType(currentMaterial.type)">{{ getTypeLabel(currentMaterial.type) }}</el-tag>
          <span class="meta-item"><el-icon><View /></el-icon>{{ currentMaterial.readCount }} 次阅读</span>
          <span class="meta-item"><el-icon><Clock /></el-icon>{{ currentMaterial.updateTime }} 更新</span>
        </div>
        <div class="content-body">
          <div v-if="currentMaterial.type === 'rule'" class="doc-content">
            <h3>平台服务规范</h3>
            <h4>一、服务准则</h4><p>1. 搭子需保持良好的服务态度，尊重每一位用户。</p><p>2. 严禁在服务过程中出现违规、违法行为。</p><p>3. 保证服务质量，按约定时间提供服务。</p>
            <h4>二、行为规范</h4><p>1. 不得泄露用户隐私信息。</p><p>2. 不得诱导用户进行平台外交易。</p><p>3. 不得发布违法违规内容。</p>
            <h4>三、违规处理</h4><p>违反上述规定的，平台将根据情节轻重给予警告、暂停服务、永久封号等处理。</p>
          </div>
          <div v-else-if="currentMaterial.type === 'standard'" class="doc-content">
            <h3>服务标准流程</h3>
            <h4>接单流程</h4><p>1. 收到订单推送后，需在5分钟内确认接单。</p><p>2. 接单后主动联系用户，确认服务细节。</p><p>3. 按约定时间准时开始服务。</p>
            <h4>服务过程</h4><p>1. 保持良好的沟通态度。</p><p>2. 严格按照用户需求提供服务。</p><p>3. 遇到问题及时与平台客服沟通。</p>
            <h4>服务结束</h4><p>1. 确认服务完成并提醒用户评价。</p><p>2. 感谢用户的信任与支持。</p>
          </div>
          <div v-else-if="currentMaterial.type === 'guide'" class="doc-content">
            <h3>新手指南</h3><p>欢迎使用有个搭子B端合作商后台！本指南将帮助您快速上手平台操作。</p>
            <h4>第一步：熟悉后台功能</h4><p>登录后，您可以查看公会看板、管理搭子、查看订单和进行结算操作。</p>
            <h4>第二步：添加搭子</h4><p>在"搭子管理"页面，您可以邀请新搭子加入公会，并审核入驻申请。</p>
            <h4>第三步：日常运营</h4><p>关注搭子的在线状态和服务质量，及时处理用户投诉。</p>
          </div>
          <div v-else class="doc-content"><h3>资料内容</h3><p>这里是 {{ currentMaterial.title }} 的详细内容...</p></div>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="markAsRead" v-if="currentMaterial && !currentMaterial.isRead">标记为已读</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { mockTrainingMaterials } from '@/utils/mockData'
import { TRAINING_TYPE, TRAINING_TYPE_MAP, getStatusInfo, MOCK_DELAY } from '@/utils/index'
import MaterialCard from '@/components/common/MaterialCard.vue'

const categories = reactive([
  { value: 'all', label: '全部资料', icon: 'Document', unread: 0 },
  { value: TRAINING_TYPE.RULE, label: '平台规则', icon: 'Warning', unread: 0 },
  { value: TRAINING_TYPE.STANDARD, label: '服务标准', icon: 'Notebook', unread: 0 },
  { value: TRAINING_TYPE.GUIDE, label: '操作指南', icon: 'QuestionFilled', unread: 0 }
])

const currentCategory = ref('all')
const materials = ref([])
const detailDialogVisible = ref(false)
const currentMaterial = ref(null)
const progressColors = [{ color: '#f56c6c', percentage: 20 }, { color: '#e6a23c', percentage: 40 }, { color: '#5cb87a', percentage: 60 }, { color: '#1989fa', percentage: 80 }, { color: '#6f7ad3', percentage: 100 }]

const filteredMaterials = computed(() => currentCategory.value === 'all' ? materials.value : materials.value.filter(m => m.type === currentCategory.value))
const totalCount = computed(() => materials.value.length)
const readCount = computed(() => materials.value.filter(m => m.isRead).length)
const readProgress = computed(() => totalCount.value === 0 ? 0 : Math.round((readCount.value / totalCount.value) * 100))
const getTypeTagType = (type) => getStatusInfo(TRAINING_TYPE_MAP, type).type
const getTypeLabel = (type) => getStatusInfo(TRAINING_TYPE_MAP, type).text

const loadData = async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY.SHORT))
    materials.value = mockTrainingMaterials
    categories.forEach(cat => {
      if (cat.value !== 'all') cat.unread = materials.value.filter(m => m.type === cat.value && !m.isRead).length
    })
  } catch (error) {
    ElMessage.error('加载数据失败')
    console.error('loadData error:', error)
  }
}
const viewMaterial = (item) => { currentMaterial.value = item; detailDialogVisible.value = true }
const markAsRead = () => { if (currentMaterial.value) { currentMaterial.value.isRead = true; ElMessage.success('已标记为已读'); detailDialogVisible.value = false; loadData() } }

onMounted(loadData)
</script>

<style scoped lang="scss">
.training-page { .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; h2 { font-size: 24px; font-weight: 500; color: #303133; margin: 0; } .read-progress { display: flex; align-items: center; gap: 12px; .progress-label { font-size: 14px; color: #606266; } .progress-text { font-size: 14px; color: #909399; } } } }
.filter-card { margin-bottom: 20px; .category-tabs { display: flex; flex-wrap: wrap; gap: 12px; .category-tab { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 8px; cursor: pointer; transition: all 0.3s; background: #f5f7fa; &:hover { background: #e4e7ed; } &.active { background: #7d67ea; color: #fff; .unread-tag { background: #fff; color: #f56c6c; } } span { font-size: 14px; font-weight: 500; } .unread-tag { margin-left: 4px; } } } }
.materials-list { .material-col { margin-bottom: 20px; } }
.material-content { .content-meta { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #ebeef5; .meta-item { display: flex; align-items: center; gap: 4px; font-size: 13px; color: #909399; } } .content-body { .doc-content { line-height: 1.8; color: #303133; h3 { font-size: 20px; font-weight: 600; margin-bottom: 20px; color: #303133; } h4 { font-size: 16px; font-weight: 500; margin: 24px 0 12px 0; color: #606266; } p { margin-bottom: 12px; text-indent: 2em; } } } }
</style>
