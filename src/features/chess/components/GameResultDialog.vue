<script setup lang="ts">
import { computed } from 'vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { describeOutcome } from '../services/outcomeText'
import type { Outcome, PieceColor, PlayerInfo } from '../types'

const props = defineProps<{ open: boolean; outcome: Outcome | null; players: Record<PieceColor, PlayerInfo> }>()
const emit = defineEmits<{ 'new-game': []; close: [] }>()

const text = computed(() => (props.outcome ? describeOutcome(props.outcome, props.players) : null))
</script>

<template>
  <BaseDialog :open="open && !!text" title="Game over" size="sm" @cancel="emit('close')">
    <div v-if="text" class="result" role="status">
      <p class="result__headline">{{ text.headline }}</p>
      <p class="muted">{{ text.detail }}</p>
    </div>
    <template #actions>
      <button type="button" class="button" @click="emit('close')">Review board</button>
      <button type="button" class="button button--primary" data-autofocus @click="emit('new-game')">New game</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.result {
  text-align: center;
}
.result__headline {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-strong);
}
</style>
