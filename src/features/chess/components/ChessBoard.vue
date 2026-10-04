<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import BoardSquare from './BoardSquare.vue'
import ChessPiece from './ChessPiece.vue'
import { PIECE_NAMES } from '../assets/pieces'
import { displaySquares, displayToSquare, isLightSquare, squareToDisplay } from '../services/squares'
import type { LegalMove, PieceColor, Position, RecordedMove, Square } from '../types'

const props = withDefaults(
  defineProps<{
    position: Position
    orientation: PieceColor
    selected?: Square | null
    targets?: LegalMove[]
    /** Colour whose pieces may be dragged; null disables dragging. */
    movableColor?: PieceColor | null
    showCoordinates?: boolean
    showTargets?: boolean
    showLastMove?: boolean
    /** Move to animate; `id` changes for every new animation. */
    animatedMove?: { move: RecordedMove; id: number } | null
    label?: string
  }>(),
  {
    selected: null,
    targets: () => [],
    movableColor: null,
    showCoordinates: true,
    showTargets: true,
    showLastMove: true,
    animatedMove: null,
    label: 'Chess board',
  },
)

const emit = defineEmits<{
  activate: [square: Square]
  'drag-start': [square: Square]
  drop: [from: Square, to: Square | null]
  cancel: []
}>()

const boardEl = useTemplateRef<HTMLDivElement>('board')

const squares = computed(() => displaySquares(props.orientation))
const rows = computed(() => [0, 1, 2, 3, 4, 5, 6, 7].map((r) => squares.value.slice(r * 8, r * 8 + 8)))
const targetMap = computed(() => {
  const map = new Map<Square, 'move' | 'capture'>()
  for (const m of props.targets) map.set(m.to, m.captured ? 'capture' : 'move')
  return map
})

// ---- Keyboard focus (roving tabindex) -------------------------------------

const focusSquare = ref<Square>(props.orientation === 'w' ? 'e2' : 'e7')

function focusOn(square: Square): void {
  focusSquare.value = square
  // preventScroll: moving focus between squares must never scroll the page.
  boardEl.value?.querySelector<HTMLElement>(`[data-square="${square}"]`)?.focus({ preventScroll: true })
}

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

function onKeydown(event: KeyboardEvent): void {
  const square = (event.target as HTMLElement).closest<HTMLElement>('[data-square]')?.dataset.square as
    | Square
    | undefined
  if (!square) return
  const delta = ARROWS[event.key]
  if (delta) {
    event.preventDefault()
    const { row, col } = squareToDisplay(square, props.orientation)
    const next = displayToSquare(row + delta[0], col + delta[1], props.orientation)
    if (next) focusOn(next)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('activate', square)
  } else if (event.key === 'Escape') {
    if (drag.value) cancelDrag()
    emit('cancel')
  }
}

function onFocusIn(event: FocusEvent): void {
  const square = (event.target as HTMLElement).dataset?.square as Square | undefined
  if (square) focusSquare.value = square
}

// ---- Pointer input: tap and drag share one handler ------------------------

interface DragState {
  from: Square
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
}

const DRAG_THRESHOLD_PX = 5
const drag = ref<DragState | null>(null)
const pressed = ref<{ square: Square; pointerId: number } | null>(null)
const droppedOn = ref<Square | null>(null)

function squareFromPoint(x: number, y: number): Square | null {
  const rect = boardEl.value?.getBoundingClientRect()
  if (!rect || rect.width === 0) return null
  const col = Math.floor(((x - rect.left) / rect.width) * 8)
  const row = Math.floor(((y - rect.top) / rect.height) * 8)
  return displayToSquare(row, col, props.orientation)
}

function squareFromEvent(event: Event): Square | null {
  return ((event.target as HTMLElement).closest<HTMLElement>('[data-square]')?.dataset.square as Square) ?? null
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || drag.value) return
  const square = squareFromEvent(event)
  if (!square) return
  const piece = props.position.pieces[square]
  if (piece && piece.color === props.movableColor) {
    event.preventDefault() // stop text selection / native image drag
    boardEl.value?.setPointerCapture?.(event.pointerId)
    focusSquare.value = square
    drag.value = {
      from: square,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
    }
  } else {
    pressed.value = { square, pointerId: event.pointerId }
  }
}

function onPointerMove(event: PointerEvent): void {
  const d = drag.value
  if (!d || d.pointerId !== event.pointerId) return
  d.x = event.clientX
  d.y = event.clientY
  if (!d.active && Math.hypot(d.x - d.startX, d.y - d.startY) > DRAG_THRESHOLD_PX) {
    d.active = true
    emit('drag-start', d.from)
  }
}

function onPointerUp(event: PointerEvent): void {
  const d = drag.value
  if (d && d.pointerId === event.pointerId) {
    drag.value = null
    if (d.active) {
      const to = squareFromPoint(event.clientX, event.clientY)
      droppedOn.value = to
      emit('drop', d.from, to)
    } else {
      emit('activate', d.from)
    }
    return
  }
  const p = pressed.value
  pressed.value = null
  if (p && p.pointerId === event.pointerId && squareFromEvent(event) === p.square) {
    focusSquare.value = p.square
    emit('activate', p.square)
  }
}

function cancelDrag(): void {
  const d = drag.value
  if (!d) return
  drag.value = null
  if (d.active) emit('drop', d.from, null)
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && drag.value) cancelDrag()
}
window.addEventListener('keydown', onWindowKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))

const ghostStyle = computed(() => {
  const d = drag.value
  const rect = boardEl.value?.getBoundingClientRect()
  if (!d?.active || !rect) return null
  const size = rect.width / 8
  return {
    width: `${size}px`,
    height: `${size}px`,
    transform: `translate(${d.x - rect.left - size / 2}px, ${d.y - rect.top - size / 2}px)`,
  }
})
const ghostPiece = computed(() => (drag.value?.active ? props.position.pieces[drag.value.from] : undefined))

// ---- Move animation --------------------------------------------------------

const slide = ref<{ square: Square; x: number; y: number; id: number } | null>(null)

watch(
  () => props.animatedMove?.id,
  () => {
    const animated = props.animatedMove
    const dropped = droppedOn.value
    droppedOn.value = null
    // A dragged piece is already where the user released it.
    if (!animated || dropped === animated.move.to) {
      slide.value = null
      return
    }
    const from = squareToDisplay(animated.move.from, props.orientation)
    const to = squareToDisplay(animated.move.to, props.orientation)
    slide.value = { square: animated.move.to, x: from.col - to.col, y: from.row - to.row, id: animated.id }
  },
)

// ---- En passant -----------------------------------------------------------

/** The pawn removed by an en passant capture stands beside the landing square, not on it. */
const enPassantRemoval = computed(() => {
  const last = props.position.lastMove
  if (!props.showLastMove || !last?.enPassant) return null
  const square = `${last.to[0]}${last.from[1]}` as Square
  return { square, piece: { color: (last.color === 'w' ? 'b' : 'w') as PieceColor, type: 'p' as const } }
})

// ---- Labels -----------------------------------------------------------------

const COLOR_NAMES: Record<PieceColor, string> = { w: 'white', b: 'black' }

function squareLabel(square: Square): string {
  const piece = props.position.pieces[square]
  const parts: string[] = [square]
  parts.push(piece ? `${COLOR_NAMES[piece.color]} ${PIECE_NAMES[piece.type]}` : 'empty')
  if (props.selected === square) parts.push('selected')
  // Hints stay hidden from screen readers too when the rules turn them off.
  const target = props.showTargets ? targetMap.value.get(square) : undefined
  if (target === 'capture') parts.push('capture available')
  else if (target === 'move') parts.push('legal move')
  if (props.position.checkedKing === square) parts.push('in check')
  if (isLastMoveSquare(square)) parts.push('last move')
  if (enPassantRemoval.value?.square === square) parts.push('pawn captured en passant')
  return parts.join(', ')
}

function isLastMoveSquare(square: Square): boolean {
  const last = props.position.lastMove
  return props.showLastMove && !!last && (last.from === square || last.to === square)
}

function isFocusable(square: Square): boolean {
  return square === focusSquare.value
}
</script>

<template>
  <div
    ref="board"
    class="board"
    role="grid"
    :aria-label="label"
    @keydown="onKeydown"
    @focusin="onFocusIn"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="cancelDrag"
    @lostpointercapture="cancelDrag"
    @contextmenu.prevent
  >
    <div v-for="(row, r) in rows" :key="r" role="row" class="board__row">
      <BoardSquare
        v-for="(square, c) in row"
        :key="square"
        :square="square"
        :piece="position.pieces[square]"
        :light="isLightSquare(square)"
        :label="squareLabel(square)"
        :focusable="isFocusable(square)"
        :selected="selected === square"
        :target="showTargets ? (targetMap.get(square) ?? null) : null"
        :last-move="isLastMoveSquare(square)"
        :check="position.checkedKing === square"
        :drag-origin="!!drag?.active && drag.from === square"
        :draggable="!!position.pieces[square]"
        :file-label="showCoordinates && r === 7 ? square[0]! : null"
        :rank-label="showCoordinates && c === 0 ? square[1]! : null"
        :slide-from="slide?.square === square ? slide : null"
        :removed-piece="enPassantRemoval?.square === square ? enPassantRemoval.piece : null"
      />
    </div>
    <div v-if="ghostPiece && ghostStyle" class="board__ghost" :style="ghostStyle" aria-hidden="true">
      <ChessPiece :piece="ghostPiece" />
    </div>
  </div>
</template>

<style scoped>
.board {
  position: relative;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  aspect-ratio: 1;
  width: 100%;
  border-radius: var(--radius-sm);
  overflow: hidden;
  box-shadow: var(--shadow-board);
  container-type: inline-size;
}
.board__row {
  display: contents;
}
.board__ghost {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  pointer-events: none;
  filter: drop-shadow(0 6px 6px rgb(0 0 0 / 0.3));
  cursor: grabbing;
}
</style>
