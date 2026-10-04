<script setup lang="ts">
import BaseDialog from '@/components/BaseDialog.vue'
import ChessPiece from './ChessPiece.vue'
import { PIECE_NAMES } from '../assets/pieces'
import type { PieceColor, PromotionPiece } from '../types'

defineProps<{ open: boolean; color: PieceColor }>()
const emit = defineEmits<{ choose: [piece: PromotionPiece]; cancel: [] }>()

const CHOICES: PromotionPiece[] = ['q', 'r', 'b', 'n']
</script>

<template>
  <BaseDialog :open="open" title="Promote pawn" size="sm" @cancel="emit('cancel')">
    <p class="muted">Choose a piece. Press Escape to cancel; the pawn stays where it is.</p>
    <div class="choices">
      <button
        v-for="(piece, i) in CHOICES"
        :key="piece"
        type="button"
        class="choice"
        :data-autofocus="i === 0 ? '' : undefined"
        :data-testid="`promote-${piece}`"
        @click="emit('choose', piece)"
      >
        <ChessPiece class="choice__piece" :piece="{ color, type: piece }" />
        <span>{{ PIECE_NAMES[piece] }}</span>
      </button>
    </div>
  </BaseDialog>
</template>

<style scoped>
.choices {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}
.choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.25rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
  color: var(--text);
  font-size: 0.8rem;
  text-transform: capitalize;
  cursor: pointer;
}
.choice:hover {
  border-color: var(--accent);
}
.choice__piece {
  width: 3rem;
  height: 3rem;
}
</style>
