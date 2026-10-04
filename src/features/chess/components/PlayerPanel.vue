<script setup lang="ts">
import { computed } from 'vue'
import ChessClock from './ChessClock.vue'
import ChessPiece from './ChessPiece.vue'
import { colorName } from '../services/outcomeText'
import type { PieceColor, PieceType } from '../types'

const props = withDefaults(defineProps<{
  color: PieceColor
  name: string
  /** Opponent pieces this player has captured. */
  captured: PieceType[]
  materialLead: number
  clockMs: number | null
  clockRunning: boolean
  toMove: boolean
  showMaterial?: boolean
  compact?: boolean
}>(), { showMaterial: true, compact: false })

const ORDER: PieceType[] = ['q', 'r', 'b', 'n', 'p']
const sortedCaptures = computed(() =>
  [...props.captured].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)),
)
const opponent = computed<PieceColor>(() => (props.color === 'w' ? 'b' : 'w'))
const displayName = computed(() => props.name || colorName(props.color))
</script>

<template>
  <section class="player" :class="{ 'player--to-move': toMove, 'player--compact': compact }" :aria-label="`${colorName(color)} player`">
    <span class="player__swatch" :class="`player__swatch--${color}`" aria-hidden="true" />
    <div class="player__info">
      <p class="player__name">
        {{ displayName }}
        <span v-if="toMove" class="badge">To move</span>
      </p>
      <p v-if="showMaterial" class="player__captures" :aria-label="`Captured: ${captured.length ? captured.length + ' pieces' : 'none'}`">
        <ChessPiece
          v-for="(type, i) in sortedCaptures"
          :key="i"
          class="player__capture"
          :piece="{ color: opponent, type }"
        />
        <span v-if="materialLead > 0" class="player__lead">+{{ materialLead }}</span>
      </p>
    </div>
    <ChessClock v-if="clockMs !== null" :ms="clockMs" :running="clockRunning" :label="`${colorName(color)} clock`" />
  </section>
</template>

<style scoped>
.player {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 3.25rem;
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border);
}
/* Phones: a flat bar like the Chess.com app; the side to move is marked by the badge and clock. */
.player--compact {
  min-height: 2.75rem;
  padding: 0.25rem 0.75rem;
  border: none;
  border-radius: 0;
  background: transparent;
}
.player--compact .player__captures {
  min-height: 0;
}
.player--compact.player--to-move {
  box-shadow: inset 3px 0 0 var(--accent);
}
.player--to-move {
  border-color: var(--accent);
}
.player__swatch {
  flex: none;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  border: 2px solid rgb(128 128 128 / 0.9);
}
.player__swatch--w {
  background: var(--piece-white-fill);
}
.player__swatch--b {
  background: var(--piece-black-fill);
}
.player__info {
  flex: 1;
  min-width: 0;
}
.player__name {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-weight: 600;
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.player__captures {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-height: 1.1rem;
  margin: 0;
}
.player__capture {
  width: 1.1rem;
  height: 1.1rem;
  margin-right: -0.3rem;
}
.player__lead {
  margin-left: 0.55rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.badge {
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 0.7rem;
  font-weight: 600;
}
</style>
