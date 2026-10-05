<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'

defineProps<{
  /** Whether this game's rules allow undo/redo; when off the buttons are not shown. */
  takebacks: boolean
  canUndo: boolean
  canRedo: boolean
  canClaimDraw: boolean
  /** False when the board rotates automatically each turn. */
  canFlip: boolean
  isOver: boolean
  /** Hidden against the computer, which never agrees to a draw. */
  canAgreeDraw?: boolean
  isTimed: boolean
  isPaused: boolean
  isClockRunning: boolean
}>()

const emit = defineEmits<{
  'new-game': []
  undo: []
  redo: []
  flip: []
  resign: []
  draw: []
  'claim-draw': []
  pause: []
  resume: []
  pgn: []
}>()
</script>

<template>
  <div class="controls" role="toolbar" aria-label="Game controls">
    <button type="button" class="button" @click="emit('new-game')"><AppIcon name="plus" />New game</button>
    <template v-if="takebacks">
      <button type="button" class="button" :disabled="!canUndo" aria-keyshortcuts="Control+Z" @click="emit('undo')">
        <AppIcon name="undo" />Undo
      </button>
      <button type="button" class="button" :disabled="!canRedo" aria-keyshortcuts="Control+Y" @click="emit('redo')">
        <AppIcon name="redo" />Redo
      </button>
    </template>
    <button v-if="canFlip" type="button" class="button" aria-keyshortcuts="F" @click="emit('flip')"><AppIcon name="flip" />Flip</button>
    <button v-if="isTimed && isClockRunning" type="button" class="button" @click="emit('pause')">
      <AppIcon name="pause" />Pause
    </button>
    <button v-else-if="isTimed && isPaused" type="button" class="button button--primary" @click="emit('resume')">
      <AppIcon name="play" />Resume
    </button>
    <button v-if="canClaimDraw" type="button" class="button button--primary" @click="emit('claim-draw')">
      <AppIcon name="handshake" />Claim draw
    </button>
    <button v-if="canAgreeDraw !== false" type="button" class="button" :disabled="isOver" @click="emit('draw')">
      <AppIcon name="handshake" />Draw
    </button>
    <button type="button" class="button" :disabled="isOver" @click="emit('resign')"><AppIcon name="flag" />Resign</button>
    <button type="button" class="button" @click="emit('pgn')"><AppIcon name="file" />PGN</button>
  </div>
</template>

<style scoped>
.controls {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
  gap: 0.4rem;
}
</style>
