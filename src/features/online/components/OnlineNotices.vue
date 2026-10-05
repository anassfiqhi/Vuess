<script setup lang="ts">
/** Online messages: errors, connection loss and draw offers. */
defineProps<{
  error: string | null
  reconnecting: boolean
  incomingDrawOffer: boolean
  outgoingDrawOffer: boolean
}>()
const emit = defineEmits<{ dismiss: []; respond: [accept: boolean] }>()
</script>

<template>
  <div v-if="error" class="notice notice--error" role="alert">
    <p>{{ error }}</p>
    <button type="button" class="button button--small" @click="emit('dismiss')">Dismiss</button>
  </div>
  <p v-if="reconnecting" class="notice notice--warning" role="status">Connection lost. Reconnecting…</p>
  <div v-if="incomingDrawOffer" class="notice notice--info" role="alert">
    <p>Your opponent offers a draw.</p>
    <span class="actions">
      <button type="button" class="button button--small" @click="emit('respond', false)">Decline</button>
      <button type="button" class="button button--small button--primary" @click="emit('respond', true)">Accept</button>
    </span>
  </div>
  <p v-if="outgoingDrawOffer" class="notice notice--info" role="status">Draw offered. Waiting for your opponent.</p>
</template>

<style scoped>
.actions {
  display: inline-flex;
  gap: 0.4rem;
}
</style>
