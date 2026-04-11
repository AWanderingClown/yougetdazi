<template>
  <el-dialog
    v-model="visible"
    :title="title"
    :width="width"
    @closed="handleClosed"
  >
    <el-form
      :model="model"
      :rules="rules"
      :label-width="labelWidth"
      ref="formRef"
      v-bind="$attrs"
    >
      <slot />
    </el-form>
    <template #footer v-if="showFooter">
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleConfirm" :loading="loading">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  title: { type: String, default: '' },
  width: { type: String, default: '500px' },
  labelWidth: { type: String, default: '100px' },
  rules: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  showFooter: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue', 'confirm', 'closed'])
const formRef = ref(null)

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const handleConfirm = async () => {
  const valid = await (formRef.value ? formRef.value.validate().catch(() => false) : false)
  if (valid) {
    emit('confirm')
  }
}

const handleClosed = () => {
  formRef.value?.resetFields()
  emit('closed')
}

defineExpose({ formRef })
</script>
