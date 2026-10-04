<script setup lang="ts">
import { computed } from 'vue'
import { PIECE_SHAPES, PIECE_VIEWBOX } from '../assets/pieces'
import type { Piece } from '../types'

const props = defineProps<{
  piece: Piece
  /** Offset in square units to slide in from, for the last-move animation. */
  slideFrom?: { x: number; y: number } | null
}>()

const shape = computed(() => PIECE_SHAPES[props.piece.type])
const style = computed(() =>
  props.slideFrom ? { '--slide-x': `${props.slideFrom.x * 100}%`, '--slide-y': `${props.slideFrom.y * 100}%` } : undefined,
)
</script>

<template>
  <svg
    class="piece"
    :class="[`piece--${piece.color}`, { 'piece--sliding': slideFrom }]"
    :style="style"
    :viewBox="PIECE_VIEWBOX"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(layer, i) in shape.halo" :key="`h${i}`" class="piece__halo" :d="layer.d" :fill-rule="layer.evenOdd ? 'evenodd' : undefined" />
    <path v-for="(layer, i) in shape.body" :key="`b${i}`" class="piece__body" :d="layer.d" :fill-rule="layer.evenOdd ? 'evenodd' : undefined" />
    <path v-for="(layer, i) in shape.detail ?? []" :key="`d${i}`" class="piece__halo" :d="layer.d" />
  </svg>
</template>

<style scoped>
.piece {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.piece--w {
  --body: var(--piece-white-fill);
  --halo: var(--piece-white-outline);
}
.piece--b {
  --body: var(--piece-black-fill);
  --halo: var(--piece-black-outline);
}
.piece__halo {
  fill: var(--halo);
}
.piece__body {
  fill: var(--body);
}
.piece--sliding {
  animation: piece-slide var(--motion-move, 160ms) ease-out;
}
@keyframes piece-slide {
  from {
    transform: translate(var(--slide-x), var(--slide-y));
  }
}
</style>
