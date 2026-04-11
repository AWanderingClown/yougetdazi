<template>
  <div class="data-table">
    <div v-if="error" class="error-state">
      <el-empty :description="error">
        <slot name="error">
          <el-button type="primary" @click="$emit('retry')">重新加载</el-button>
        </slot>
      </el-empty>
    </div>

    <div v-else-if="!data || data.length === 0" class="empty-state">
      <el-empty :description="emptyText">
        <slot name="empty" />
      </el-empty>
    </div>

    <el-table v-else :data="data" v-loading="loading" stripe v-bind="$attrs">
      <slot />
    </el-table>

    <div class="pagination-wrapper" v-if="showPagination && data && data.length > 0">
      <el-pagination
        :current-page="currentPage"
        :page-size="pageSize"
        :page-sizes="PAGE_SIZES"
        :total="total"
        layout="total, sizes, prev, pager, next"
        @size-change="$emit('size-change', $event)"
        @current-change="$emit('page-change', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { PAGE_SIZE, PAGE_SIZES } from '@/utils/index'

const props = defineProps({
  data: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  total: { type: Number, default: 0 },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: PAGE_SIZE },
  showPagination: { type: Boolean, default: true },
  error: { type: String, default: null },
  emptyText: { type: String, default: '暂无数据' }
})

const emit = defineEmits(['update:page', 'update:pageSize', 'size-change', 'page-change', 'retry'])

const currentPage = computed({
  get: () => props.page,
  set: (val) => emit('update:page', val)
})
</script>

<style scoped>
.data-table {
  .error-state,
  .empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 300px;
    background: #fff;
    border-radius: 4px;
  }

  .pagination-wrapper {
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
