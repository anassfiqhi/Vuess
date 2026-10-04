<script setup lang="ts">
import BaseDialog from './BaseDialog.vue'

withDefaults(
  defineProps<{ open: boolean; title: string; message: string; confirmLabel: string; danger?: boolean }>(),
  { danger: false },
)
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <BaseDialog :open="open" :title="title" size="sm" @cancel="emit('cancel')">
    <p class="muted">{{ message }}</p>
    <template #actions>
      <button type="button" class="button" data-autofocus @click="emit('cancel')">Cancel</button>
      <button type="button" class="button" :class="danger ? 'button--danger' : 'button--primary'" @click="emit('confirm')">
        {{ confirmLabel }}
      </button>
    </template>
  </BaseDialog>
</template>
