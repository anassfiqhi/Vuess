<script setup lang="ts">
import { computed } from 'vue'
import { formatClock } from '../services/clock'

const props = defineProps<{ ms: number; running: boolean; label: string }>()

const LOW_TIME_MS = 20_000
const text = computed(() => formatClock(props.ms))
const low = computed(() => props.ms <= LOW_TIME_MS)
const spoken = computed(() => {
  const s = Math.max(0, Math.ceil(props.ms / 1000))
  return `${props.label}: ${Math.floor(s / 60)} minutes ${s % 60} seconds${props.running ? ', running' : ''}`
})
</script>

<template>
  <div class="clock" :class="{ 'clock--running': running, 'clock--low': low }" role="timer" :aria-label="spoken">
    <span v-if="running" class="clock__indicator" aria-hidden="true" />
    <span aria-hidden="true">{{ text }}</span>
  </div>
</template>

<style scoped>
.clock {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 5.5rem;
  justify-content: flex-end;
  padding: 0.3rem 0.6rem;
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  color: var(--text-muted);
  font: 600 1.15rem/1.2 var(--mono);
  font-variant-numeric: tabular-nums;
}
.clock--running {
  background: var(--text-strong);
  color: var(--surface);
}
.clock--low.clock--running {
  background: var(--danger);
  color: #fff;
}
.clock--low:not(.clock--running) {
  color: var(--danger);
}
.clock__indicator {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: currentColor;
  animation: blink 1s steps(2, start) infinite;
}
@keyframes blink {
  to {
    visibility: hidden;
  }
}
</style>
