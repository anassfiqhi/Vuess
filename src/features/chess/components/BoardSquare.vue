<script setup lang="ts">
import ChessPiece from './ChessPiece.vue'
import type { Piece, Square } from '../types'

defineProps<{
  square: Square
  piece: Piece | undefined
  light: boolean
  label: string
  focusable: boolean
  selected: boolean
  target: 'move' | 'capture' | null
  lastMove: boolean
  check: boolean
  dragOrigin: boolean
  draggable: boolean
  fileLabel: string | null
  rankLabel: string | null
  slideFrom: { x: number; y: number; id: number } | null
  /** Piece removed from this square by the last move without a piece landing here (en passant). */
  removedPiece: Piece | null
}>()
</script>

<template>
  <div
    role="gridcell"
    class="square"
    :class="{
      'square--light': light,
      'square--dark': !light,
      'square--selected': selected,
      'square--last': lastMove,
      'square--check': check,
      'square--draggable': draggable,
      [`square--${target}`]: target,
    }"
    :data-square="square"
    :tabindex="focusable ? 0 : -1"
    :aria-label="label"
    :aria-selected="selected"
  >
    <span v-if="rankLabel" class="coord coord--rank" aria-hidden="true">{{ rankLabel }}</span>
    <span v-if="fileLabel" class="coord coord--file" aria-hidden="true">{{ fileLabel }}</span>
    <ChessPiece
      v-if="piece"
      :key="slideFrom?.id ?? 'static'"
      class="square__piece" :class="{ 'square__piece--ghost': dragOrigin }" :piece="piece" :slide-from="slideFrom" />
    <template v-if="removedPiece && !piece">
      <ChessPiece class="square__piece square__piece--removed" :piece="removedPiece" />
      <span class="removed-mark" aria-hidden="true" />
    </template>
    <span v-if="target" class="marker" aria-hidden="true" />
  </div>
</template>

<style scoped>
.square {
  position: relative;
  background: var(--sq);
  outline: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.square--light {
  --sq: var(--board-light);
  --coord: var(--board-dark);
}
.square--dark {
  --sq: var(--board-dark);
  --coord: var(--board-light);
}
/* Squares with pieces own their touch gestures so dragging never scrolls the page. */
.square--draggable {
  touch-action: none;
  cursor: grab;
}
.square__piece {
  position: absolute;
  inset: 4%;
  width: 92%;
  height: 92%;
  z-index: 1;
}
.square__piece--ghost {
  opacity: 0.35;
}
.square__piece--removed {
  opacity: 0.3;
  animation: removed-fade var(--motion-move, 160ms) ease-out;
}
@keyframes removed-fade {
  from {
    opacity: 1;
  }
}
/* A cross over the faded piece shows it was captured, without relying on colour. */
.removed-mark {
  position: absolute;
  inset: 22%;
  z-index: 2;
  pointer-events: none;
  background:
    linear-gradient(45deg, transparent 44%, var(--board-check-ring) 44% 56%, transparent 56%),
    linear-gradient(-45deg, transparent 44%, var(--board-check-ring) 44% 56%, transparent 56%);
}
.square--last {
  background-image: linear-gradient(var(--board-last), var(--board-last));
}
/* Corner notch marks the last move without relying on colour alone. */
.square--last::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  border-style: solid;
  border-width: 0 0.6rem 0.6rem 0;
  border-color: transparent var(--board-last-mark) transparent transparent;
}
.square--selected {
  background-image: linear-gradient(var(--board-selected), var(--board-selected));
  box-shadow: inset 0 0 0 0.22rem var(--board-selected-ring);
}
.square--check {
  background-image: radial-gradient(circle, var(--board-check) 0%, var(--board-check) 35%, transparent 72%);
  box-shadow: inset 0 0 0 0.2rem var(--board-check-ring);
}
.square:focus-visible {
  box-shadow: inset 0 0 0 0.25rem var(--focus-ring);
  z-index: 2;
}
.marker {
  position: absolute;
  pointer-events: none;
  z-index: 2;
}
.square--move .marker {
  inset: 37%;
  border-radius: 50%;
  background: var(--board-target);
}
.square--capture .marker {
  inset: 4%;
  border-radius: 50%;
  border: 0.3rem solid var(--board-target);
}
.coord {
  position: absolute;
  font-size: clamp(0.55rem, 1.6vw, 0.75rem);
  font-weight: 600;
  line-height: 1;
  color: var(--coord);
  pointer-events: none;
}
.coord--rank {
  top: 0.2rem;
  left: 0.25rem;
}
.coord--file {
  right: 0.25rem;
  bottom: 0.2rem;
}
</style>
