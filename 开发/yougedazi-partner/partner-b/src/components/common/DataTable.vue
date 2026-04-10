<template>
  <div class="data-table">
    <el-table :data="data" v-loading="loading" stripe v-bind="$attrs">
      <slot />
    </el-table>
    <div class="pagination-wrapper" v-if="showPagination">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
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
  showPagination: { type: Boolean, default: true }
})

const emit = defineEmits(['update:page', 'update:pageSize', 'size-change', 'page-change'])

const currentPage = computed({
  get: () => props.page,
  set: (val) => emit('update:page', val)
})
</script>

<style scoped>
.data-table {
  .pagination-wrapper {
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
