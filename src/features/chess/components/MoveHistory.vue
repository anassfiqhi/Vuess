<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import type { PieceColor, RecordedMove } from '../types'

const props = defineProps<{
  moves: RecordedMove[]
  /** Ply currently shown on the board (0 = initial position). */
  viewPly: number
  startColor: PieceColor
  startMoveNumber: number
  /** "strip" is a single horizontally scrolling row for small screens. */
  variant?: 'list' | 'strip'
}>()
const emit = defineEmits<{ select: [ply: number] }>()

interface Row {
  number: number
  white: { san: string; ply: number; enPassant: boolean } | null
  black: { san: string; ply: number; enPassant: boolean } | null
}

const rows = computed<Row[]>(() => {
  const result: Row[] = []
  let row: Row | null = null
  let number = props.startMoveNumber
  props.moves.forEach((move, index) => {
    const entry = { san: move.san, ply: index + 1, enPassant: !!move.enPassant }
    if (move.color === 'w' || !row) {
      row = { number, white: null, black: null }
      result.push(row)
    }
    if (move.color === 'w') row.white = entry
    else {
      row.black = entry
      row = null
      number++
    }
  })
  return result
})

const live = computed(() => props.moves.length)
const listEl = useTemplateRef<HTMLElement>('list')

/**
 * Keeps the current move visible by scrolling the list's own box only.
 * scrollIntoView() would also scroll the page (and any other scrollable
 * ancestor), making the screen jump to the move list after every move.
 */
function revealCurrentMove(): void {
  const list = listEl.value
  const item = list?.querySelector<HTMLElement>('[aria-current="true"]')
  if (!list || !item) return
  const listBox = list.getBoundingClientRect()
  const itemBox = item.getBoundingClientRect()
  if (props.variant === 'strip') {
    // Centre the move horizontally in the strip.
    list.scrollLeft += itemBox.left + itemBox.width / 2 - (listBox.left + listBox.width / 2)
  } else if (itemBox.top < listBox.top) {
    list.scrollTop -= listBox.top - itemBox.top
  } else if (itemBox.bottom > listBox.bottom) {
    list.scrollTop += itemBox.bottom - listBox.bottom
  }
}

watch(
  () => [props.viewPly, props.moves.length],
  async () => {
    await nextTick()
    revealCurrentMove()
  },
)
</script>

<template>
  <nav v-if="variant === 'strip'" class="strip" aria-label="Moves">
    <p v-if="moves.length === 0" class="strip__empty muted">No moves yet</p>
    <ol v-else ref="list" class="strip__list">
      <li v-for="row in rows" :key="row.number" class="strip__row">
        <span class="strip__number">{{ row.number }}.</span>
        <template v-for="side in (['white', 'black'] as const)" :key="side">
          <button
            v-if="row[side]"
            type="button"
            class="strip__move"
            :aria-current="row[side]!.ply === viewPly"
            :aria-label="`Move ${row.number}, ${side}: ${row[side]!.san}${row[side]!.enPassant ? ', en passant' : ''}`"
            @click="emit('select', row[side]!.ply)"
          >
            {{ row[side]!.san }}<abbr v-if="row[side]!.enPassant" class="history__ep" title="en passant">e.p.</abbr>
          </button>
          <span v-else-if="side === 'white'" class="strip__move strip__move--empty" aria-hidden="true">…</span>
        </template>
      </li>
    </ol>
  </nav>
  <section v-else class="history" aria-labelledby="history-heading">
    <div class="history__header">
      <h2 id="history-heading" class="history__title">Moves</h2>
      <div class="history__nav" role="group" aria-label="Browse positions">
        <button type="button" class="icon-button" aria-label="First position" :disabled="viewPly === 0" @click="emit('select', 0)">
          <AppIcon name="first" />
        </button>
        <button type="button" class="icon-button" aria-label="Previous move" :disabled="viewPly === 0" @click="emit('select', viewPly - 1)">
          <AppIcon name="prev" />
        </button>
        <button type="button" class="icon-button" aria-label="Next move" :disabled="viewPly >= live" @click="emit('select', viewPly + 1)">
          <AppIcon name="next" />
        </button>
        <button type="button" class="icon-button" aria-label="Latest position" :disabled="viewPly >= live" @click="emit('select', live)">
          <AppIcon name="last" />
        </button>
      </div>
    </div>
    <p v-if="moves.length === 0" class="history__empty muted">No moves yet. {{ startColor === 'w' ? 'White' : 'Black' }} to move.</p>
    <ol v-else ref="list" class="history__list">
      <li v-for="row in rows" :key="row.number" class="history__row">
        <span class="history__number">{{ row.number }}.</span>
        <template v-for="side in (['white', 'black'] as const)" :key="side">
          <button
            v-if="row[side]"
            type="button"
            class="history__move"
            :aria-current="row[side]!.ply === viewPly"
            :aria-label="`Move ${row.number}, ${side}: ${row[side]!.san}${row[side]!.enPassant ? ', en passant' : ''}`"
            @click="emit('select', row[side]!.ply)"
          >
            {{ row[side]!.san }}<abbr v-if="row[side]!.enPassant" class="history__ep" title="en passant">e.p.</abbr>
          </button>
          <span v-else class="history__move history__move--empty" aria-hidden="true">…</span>
        </template>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.history__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.4rem 0.35rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.history__title {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-strong);
}
.history__nav {
  display: flex;
}
.history__empty {
  margin: 0;
  padding: 0.75rem;
  font-size: 0.9rem;
}
.history__list {
  flex: 1;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  overflow-y: auto;
  max-height: 18rem;
}
.history__row {
  display: grid;
  grid-template-columns: 2.75rem 1fr 1fr;
  align-items: center;
  padding: 0 0.4rem;
}
.history__row:nth-child(odd) {
  background: var(--surface-sunken);
}
.history__number {
  padding-left: 0.35rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}
.history__move {
  justify-self: start;
  padding: 0.2rem 0.45rem;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text);
  font: 500 0.9rem/1.4 var(--mono);
  cursor: pointer;
}
.history__move:hover {
  background: var(--accent-soft);
}
.history__move[aria-current='true'] {
  background: var(--accent);
  color: var(--on-accent);
}
.history__ep {
  margin-left: 0.3em;
  font-size: 0.75em;
  text-decoration: none;
  opacity: 0.75;
}
.strip {
  min-width: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.strip__empty {
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
}
.strip__list {
  display: flex;
  gap: 0.15rem;
  margin: 0;
  padding: 0.3rem 0.5rem;
  list-style: none;
  overflow-x: auto;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}
.strip__list::-webkit-scrollbar {
  display: none;
}
.strip__row {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.1rem;
}
.strip__number {
  padding-left: 0.3rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}
.strip__move {
  padding: 0.2rem 0.4rem;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text);
  font: 500 0.85rem/1.4 var(--mono);
  white-space: nowrap;
  cursor: pointer;
}
.strip__move[aria-current='true'] {
  background: var(--accent);
  color: var(--on-accent);
}
.strip__move--empty {
  cursor: default;
  color: var(--text-muted);
}
.history__move--empty {
  cursor: default;
  color: var(--text-muted);
}
@media (min-width: 760px) {
  .history__list {
    max-height: none;
  }
}
</style>
