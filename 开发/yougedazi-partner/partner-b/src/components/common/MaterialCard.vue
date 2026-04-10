<template>
  <el-col :xs="24" :sm="12" :lg="8" class="material-col">
    <el-card class="material-card" :class="{ unread: !item.isRead }">
      <div class="material-header">
        <div class="material-icon" :class="typeClass"><el-icon :size="28"><component :is="typeIcon" /></el-icon></div>
        <div class="material-info">
          <h4 class="material-title">{{ item.title }}</h4>
          <div class="material-meta">
            <el-tag :type="typeTag" size="small">{{ typeLabel }}</el-tag>
            <span class="update-time">{{ item.updateTime }} 更新</span>
          </div>
        </div>
      </div>
      <div class="material-stats">
        <span class="read-count"><el-icon><View /></el-icon>{{ item.readCount }} 人已读</span>
        <el-tag v-if="!item.isRead" type="danger" size="small" effect="dark">未读</el-tag>
        <el-tag v-else type="success" size="small" effect="plain">已读</el-tag>
      </div>
      <div class="material-actions"><el-button type="primary" @click="$emit('view', item)">{{ item.isRead ? '重新阅读' : '立即阅读' }}</el-button></div>
    </el-card>
  </el-col>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ item: { type: Object, required: true } })
defineEmits(['view'])

const typeMap = { rule: { cls: 'type-rule', icon: 'Warning', tag: 'danger', label: '平台规则' }, standard: { cls: 'type-standard', icon: 'Notebook', tag: 'warning', label: '服务标准' }, guide: { cls: 'type-guide', icon: 'QuestionFilled', tag: 'success', label: '操作指南' } }
const typeInfo = computed(() => typeMap[props.item.type] || { cls: 'type-other', icon: 'Document', tag: 'info', label: '其他' })
const typeClass = computed(() => typeInfo.value.cls)
const typeIcon = computed(() => typeInfo.value.icon)
const typeTag = computed(() => typeInfo.value.tag)
const typeLabel = computed(() => typeInfo.value.label)
</script>

<style scoped lang="scss">
.material-card { height: 100%; transition: all 0.3s; &:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1); } &.unread { border: 1px solid #fde2e2; background: linear-gradient(135deg, #fff 0%, #fef0f0 100%); } .material-header { display: flex; gap: 16px; margin-bottom: 16px; .material-icon { width: 56px; height: 56px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; .el-icon { color: #fff; } &.type-rule { background: linear-gradient(135deg, var(--color-danger), #f89898); }
    &.type-standard { background: linear-gradient(135deg, var(--color-warning), #eebe77); }
    &.type-guide { background: linear-gradient(135deg, var(--color-success), #95d475); }
    &.type-other { background: linear-gradient(135deg, var(--color-info), #b1b3b8); } } .material-info { flex: 1; min-width: 0; .material-title { font-size: 16px; font-weight: 500; color: #303133; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .material-meta { display: flex; align-items: center; gap: 8px; .update-time { font-size: 12px; color: #909399; } } } } .material-stats { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding: 12px 0; border-top: 1px solid #ebeef5; border-bottom: 1px solid #ebeef5; .read-count { display: flex; align-items: center; gap: 4px; font-size: 13px; color: #606266; .el-icon { color: #909399; } } } .material-actions { .el-button { width: 100%; } } }
</style>
