<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ChessBoard from '@/features/chess/components/ChessBoard.vue'
import GameControls from '@/features/chess/components/GameControls.vue'
import GameResultDialog from '@/features/chess/components/GameResultDialog.vue'
import GameSetupDialog from '@/features/chess/components/GameSetupDialog.vue'
import MoveHistory from '@/features/chess/components/MoveHistory.vue'
import PgnDialog from '@/features/chess/components/PgnDialog.vue'
import PlayerPanel from '@/features/chess/components/PlayerPanel.vue'
import PromotionDialog from '@/features/chess/components/PromotionDialog.vue'
import RulesList from '@/features/chess/components/RulesList.vue'
import { useBoardInteraction } from '@/features/chess/composables/useBoardInteraction'
import { useMotionEnabled } from '@/features/chess/composables/useReducedMotion'
import { useSound } from '@/features/chess/composables/useSound'
import { describeTimeControl } from '@/features/chess/services/clock'
import { rulesLabel } from '@/features/chess/services/gameRules'
import { colorName, describeOutcome } from '@/features/chess/services/outcomeText'
import { useGameStore, type GameSetup } from '@/features/chess/stores/game'
import type { PieceColor, PieceType, Position, RecordedMove } from '@/features/chess/types'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { useSettingsStore } from '@/stores/settings'

const game = useGameStore()

const {
  record,
  rules,
  rulesChoice,
  position,
  appliedMoves,
  outcome,
  isOver,
  isTimed,
  isPaused,
  isClockRunning,
  canUndo,
  canRedo,
  canClaimDraw,
  canMove,
  clocks,
  captured,
  restoreNotice,
  storageWarning,
} = storeToRefs(game)
const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

/**
 * Phones and portrait tablets get a full-screen layout like the Chess.com app:
 * no page scroll, actions in a bottom bar. Keep this query in sync with the
 * "compact layout" media queries in style.css and BaseDialog.vue.
 */
const isCompact = useMediaQuery('(max-width: 759px), (max-aspect-ratio: 1/1)')
const moreOpen = ref(false)

/*
 * The full-screen layout has nothing to scroll, so lock the page: no scrollbar
 * from sub-pixel rounding, and swipes on the board cannot move the page,
 * collapse the address bar or trigger overscroll effects.
 */
watch(
  isCompact,
  (compact) => document.documentElement.classList.toggle('page-locked', compact),
  { immediate: true },
)
onBeforeUnmount(() => document.documentElement.classList.remove('page-locked'))

const motionEnabled = useMotionEnabled(computed(() => settings.value.animations))
const sound = useSound(computed(() => settings.value.soundEnabled))

/** With "rotate board" the side to move is always at the bottom; otherwise the saved preference. */
const orientation = computed<PieceColor>(() => (rules.value.rotateBoard ? position.value.turn : settings.value.orientation))

// ---- History browsing (view state only, never persisted) -------------------

/** Ply shown on the board; null means the live position. */
const viewPly = ref<number | null>(null)
watch(
  () => record.value.revision,
  () => (viewPly.value = null),
)
const viewingHistory = computed(() => viewPly.value !== null)
const shownPly = computed(() => viewPly.value ?? record.value.cursor)
const displayedPosition = computed<Position>(() =>
  viewPly.value === null ? position.value : (game.positionAt(viewPly.value) ?? position.value),
)
function selectPly(ply: number): void {
  const clamped = Math.max(0, Math.min(ply, record.value.cursor))
  viewPly.value = clamped === record.value.cursor ? null : clamped
}

// ---- Move pipeline ---------------------------------------------------------

const announcement = ref('')
const moveError = ref<string | null>(null)
const animatedMove = ref<{ move: RecordedMove; id: number } | null>(null)
let animationId = 0

const interaction = useBoardInteraction({
  position,
  canInteract: computed(() => canMove.value && !viewingHistory.value),
  autoQueen: computed(() => rules.value.autoQueen),
  submitMove: (input) => game.tryMove(input),
  onMoveAccepted(move) {
    moveError.value = null
    animatedMove.value = { move, id: ++animationId }
    const pos = position.value
    const suffix = outcome.value ? '' : pos.inCheck ? ' Check.' : ''
    const verb = move.enPassant ? 'captured en passant,' : 'played'
    announcement.value = `${colorName(move.color)} ${verb} ${move.san}.${suffix}`
    // Screen readers always hear "Check" (the king glow stays visible too); the rule only controls the warning text and sound.
    const warnCheck = pos.inCheck && rules.value.checkWarning
    if (!outcome.value) sound.play(warnCheck ? 'check' : move.captured ? 'capture' : 'move')
  },
  onMoveRejected(error) {
    moveError.value = error
    sound.play('error')
  },
})
const { selected, pendingPromotion, targets } = interaction

const movableColor = computed<PieceColor | null>(() =>
  canMove.value && !viewingHistory.value && !pendingPromotion.value ? position.value.turn : null,
)

// ---- Players, captures, clocks --------------------------------------------

const VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const materialOf = (pieces: PieceType[]) => pieces.reduce((sum, p) => sum + VALUES[p], 0)
function panelFor(color: PieceColor) {
  const lead = materialOf(captured.value[color]) - materialOf(captured.value[color === 'w' ? 'b' : 'w'])
  return {
    color,
    name: record.value.players[color].name,
    captured: captured.value[color],
    materialLead: Math.max(0, lead),
    clockMs: clocks.value ? clocks.value[color] : null,
    clockRunning: isClockRunning.value && position.value.turn === color,
    toMove: !isOver.value && position.value.turn === color,
    showMaterial: rules.value.showMaterial,
  }
}
const topPanel = computed(() => panelFor(orientation.value === 'w' ? 'b' : 'w'))
const bottomPanel = computed(() => panelFor(orientation.value))

const startColor = computed<PieceColor>(() => (record.value.initialFen.split(' ')[1] === 'b' ? 'b' : 'w'))
const startMoveNumber = computed(() => Number(record.value.initialFen.split(' ')[5]) || 1)

const status = computed(() => {
  if (outcome.value) {
    const text = describeOutcome(outcome.value, record.value.players)
    return `${text.headline} — ${text.detail}`
  }
  if (isPaused.value) return 'Game paused'
  const turn = `${colorName(position.value.turn)} to move`
  return position.value.inCheck && rules.value.checkWarning ? `${turn} — check!` : turn
})

// ---- Dialogs ----------------------------------------------------------------

const setupOpen = ref(false)
const resultOpen = ref(false)
const pgnOpen = ref(false)
const resignOpen = ref(false)
const drawOpen = ref(false)

const setupDefaults = computed<GameSetup>(() => ({
  whiteName: record.value.players.w.name,
  blackName: record.value.players.b.name,
  timeControl: record.value.timeControl,
  rulesChoice: record.value.rulesChoice,
  rules: record.value.rules,
}))
const gameInProgress = computed(() => !isOver.value && record.value.moves.length > 0)

watch(outcome, (next, previous) => {
  if (next && !previous) {
    interaction.clear()
    resultOpen.value = true
    announcement.value = `Game over. ${describeOutcome(next, record.value.players).headline}.`
    sound.play('end')
  }
})

function startGame(setup: GameSetup): void {
  if (setup.rulesChoice === 'custom') settingsStore.saveCustomRules(setup.rules)
  game.startGame(setup)
  setupOpen.value = false
  resultOpen.value = false
  moveError.value = null
  announcement.value = `New game started. ${describeTimeControl(setup.timeControl)}.`
}

function openNewGame(): void {
  resultOpen.value = false
  setupOpen.value = true
}

function resign(color: PieceColor): void {
  game.resign(color)
  resignOpen.value = false
}

/** Runs an action chosen from the "More" sheet and closes the sheet. */
function fromSheet(action: () => void): void {
  moreOpen.value = false
  action()
}

let errorTimer: ReturnType<typeof setTimeout> | undefined
watch(moveError, (message) => {
  clearTimeout(errorTimer)
  if (message) errorTimer = setTimeout(() => (moveError.value = null), 5000)
})
onBeforeUnmount(() => clearTimeout(errorTimer))

function claimDraw(): void {
  const result = game.claimDraw()
  if (!result.ok) moveError.value = result.error
}

function agreeDraw(): void {
  game.agreeDraw()
  drawOpen.value = false
}

function undo(): void {
  const result = game.undoMove()
  if (result.ok) announcement.value = 'Move undone.'
}
function redo(): void {
  const result = game.redoMove()
  if (result.ok) announcement.value = 'Move redone.'
}
function flip(): void {
  if (!rules.value.rotateBoard) settingsStore.flipBoard()
}

const pgnExport = computed(() => (pgnOpen.value ? game.exportPgn() : { ok: false as const, error: '' }))
const pgnFileName = computed(() => `vuess-${record.value.createdAt.slice(0, 10)}.pgn`)
function onImported(): void {
  pgnOpen.value = false
  resultOpen.value = false
  announcement.value = 'Game imported.'
}

// ---- Keyboard shortcuts -----------------------------------------------------

const anyDialogOpen = computed(
  () =>
    setupOpen.value ||
    resultOpen.value ||
    pgnOpen.value ||
    resignOpen.value ||
    drawOpen.value ||
    moreOpen.value ||
    !!pendingPromotion.value,
)
function onShortcut(event: KeyboardEvent): void {
  if (anyDialogOpen.value || event.altKey) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (mod && key === 'z' && !event.shiftKey) {
    event.preventDefault()
    undo()
  } else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
    event.preventDefault()
    redo()
  } else if (!mod && key === 'f') {
    flip()
  }
}
window.addEventListener('keydown', onShortcut)
onBeforeUnmount(() => window.removeEventListener('keydown', onShortcut))
</script>

<template>
  <div
    class="game"
    :class="[`board-theme--${settings.boardTheme}`, { 'motion-off': !motionEnabled, 'game--compact': isCompact }]"
  >
    <div class="game__notices">
      <div v-if="restoreNotice" class="notice notice--warning" role="alert">
        <p>{{ restoreNotice }}</p>
        <button type="button" class="button button--small" @click="game.dismissRestoreNotice()">Dismiss</button>
      </div>
      <div v-if="storageWarning" class="notice notice--warning" role="status">
        <p>{{ storageWarning }}</p>
      </div>
      <p v-if="isCompact && moveError" class="notice notice--error" role="alert">{{ moveError }}</p>
    </div>

    <MoveHistory
      v-if="isCompact"
      variant="strip"
      :moves="appliedMoves"
      :view-ply="shownPly"
      :start-color="startColor"
      :start-move-number="startMoveNumber"
      @select="selectPly"
    />

    <div class="game__board-column">
      <PlayerPanel v-bind="topPanel" :compact="isCompact" />
      <div class="game__board-area">
        <div class="game__board-box">
          <ChessBoard
            :position="displayedPosition"
            :orientation="orientation"
            :selected="viewingHistory ? null : selected"
            :targets="viewingHistory ? [] : targets"
            :movable-color="movableColor"
            :show-coordinates="settings.showCoordinates"
            :show-targets="rules.showLegalMoves"
            :show-last-move="rules.highlightLastMove"
            :animated-move="motionEnabled && !viewingHistory ? animatedMove : null"
            :label="viewingHistory ? `Chess board, showing position after move ${shownPly}` : 'Chess board'"
            @activate="interaction.activate"
            @drag-start="interaction.dragStart"
            @drop="interaction.drop"
            @cancel="interaction.clear"
          />
          <div v-if="isPaused && !viewingHistory" class="board-overlay">
            <p>Game paused</p>
            <button type="button" class="button button--primary" data-testid="resume" @click="game.resume()">Resume</button>
          </div>
        </div>
      </div>
      <PlayerPanel v-bind="bottomPanel" :compact="isCompact" />
    </div>

    <template v-if="isCompact">
      <div class="status-line" :class="{ 'status-line--over': isOver }">
        <template v-if="viewingHistory">
          <p class="status-line__text">Viewing move {{ shownPly }} of {{ record.cursor }}</p>
          <button
            type="button"
            class="button button--primary status-line__live"
            aria-label="Back to live game"
            @click="viewPly = null"
          >
            Live
          </button>
        </template>
        <template v-else>
          <p class="status-line__text" data-testid="status">{{ status }}</p>
          <p class="status-line__meta" data-testid="rules-meta">
            {{ rulesLabel(rulesChoice) }} · {{ describeTimeControl(record.timeControl) }}
          </p>
        </template>
      </div>

      <nav class="toolbar" aria-label="Game actions">
        <button type="button" class="toolbar__button" aria-label="New game" @click="openNewGame">
          <AppIcon name="plus" /><span aria-hidden="true">New</span>
        </button>
        <button v-if="rules.takebacks" type="button" class="toolbar__button" :disabled="!canUndo" @click="undo">
          <AppIcon name="undo" /><span>Undo</span>
        </button>
        <button
          type="button"
          class="toolbar__button"
          aria-label="Previous move"
          :disabled="shownPly === 0"
          @click="selectPly(shownPly - 1)"
        >
          <AppIcon name="prev" /><span aria-hidden="true">Back</span>
        </button>
        <button
          type="button"
          class="toolbar__button"
          aria-label="Next move"
          :disabled="shownPly >= record.cursor"
          @click="selectPly(shownPly + 1)"
        >
          <AppIcon name="next" /><span aria-hidden="true">Forward</span>
        </button>
        <button v-if="canClaimDraw" type="button" class="toolbar__button toolbar__button--accent" @click="claimDraw">
          <AppIcon name="handshake" /><span>Claim draw</span>
        </button>
        <button type="button" class="toolbar__button" aria-label="More options" @click="moreOpen = true">
          <AppIcon name="more" /><span aria-hidden="true">More</span>
        </button>
      </nav>

      <BaseDialog :open="moreOpen" title="Game" sheet @cancel="moreOpen = false">
        <p class="muted small">
          {{ rulesLabel(rulesChoice) }} · {{ describeTimeControl(record.timeControl)
          }}<template v-if="record.source === 'pgn-import'"> · imported</template>
        </p>
        <GameControls
          :takebacks="rules.takebacks"
          :can-undo="canUndo"
          :can-claim-draw="canClaimDraw"
          :can-flip="!rules.rotateBoard"
          :can-redo="canRedo"
          :is-over="isOver"
          :is-timed="isTimed"
          :is-paused="isPaused"
          :is-clock-running="isClockRunning"
          @new-game="fromSheet(openNewGame)"
          @undo="fromSheet(undo)"
          @redo="fromSheet(redo)"
          @flip="fromSheet(flip)"
          @resign="fromSheet(() => (resignOpen = true))"
          @draw="fromSheet(() => (drawOpen = true))"
          @claim-draw="fromSheet(claimDraw)"
          @pause="fromSheet(game.pause)"
          @resume="fromSheet(game.resume)"
          @pgn="fromSheet(() => (pgnOpen = true))"
        />
        <details class="rules-summary">
          <summary>Rules for this game</summary>
          <RulesList class="rules-summary__list" :rules="rules" />
        </details>
      </BaseDialog>
    </template>

    <aside v-else class="game__side">
      <div class="status-bar" :class="{ 'status-bar--over': isOver }">
        <p class="status-bar__text" data-testid="status">{{ status }}</p>
        <p class="status-bar__meta muted small" data-testid="rules-meta">
          {{ rulesLabel(rulesChoice) }} · {{ describeTimeControl(record.timeControl)
          }}<template v-if="record.source === 'pgn-import'"> · imported</template>
        </p>
        <details class="rules-summary">
          <summary>Rules for this game</summary>
          <RulesList class="rules-summary__list" :rules="rules" />
        </details>
      </div>

      <div v-if="viewingHistory" class="notice notice--info">
        <p>Viewing move {{ shownPly }} of {{ record.cursor }}. Moves are disabled{{ isClockRunning ? '; the clock is still running' : '' }}.</p>
        <button type="button" class="button button--small button--primary" @click="viewPly = null">Back to live game</button>
      </div>
      <p v-if="moveError" class="notice notice--error" role="alert">{{ moveError }}</p>

      <GameControls
        :takebacks="rules.takebacks"
        :can-undo="canUndo"
        :can-claim-draw="canClaimDraw"
        :can-flip="!rules.rotateBoard"
        :can-redo="canRedo"
        :is-over="isOver"
        :is-timed="isTimed"
        :is-paused="isPaused"
        :is-clock-running="isClockRunning"
        @new-game="openNewGame"
        @undo="undo"
        @redo="redo"
        @flip="flip"
        @resign="resignOpen = true"
        @draw="drawOpen = true"
        @claim-draw="claimDraw"
        @pause="game.pause()"
        @resume="game.resume()"
        @pgn="pgnOpen = true"
      />

      <MoveHistory
        class="game__history"
        :moves="appliedMoves"
        :view-ply="shownPly"
        :start-color="startColor"
        :start-move-number="startMoveNumber"
        @select="selectPly"
      />
    </aside>

    <p class="visually-hidden" aria-live="polite" aria-atomic="true">{{ announcement }}</p>

    <PromotionDialog
      :open="!!pendingPromotion"
      :color="position.turn"
      @choose="interaction.choosePromotion"
      @cancel="interaction.cancelPromotion"
    />
    <GameSetupDialog
      :open="setupOpen"
      :defaults="setupDefaults"
      :custom-rules="settings.customRules"
      :replacing="gameInProgress"
      @start="startGame"
      @cancel="setupOpen = false"
    />
    <GameResultDialog
      :open="resultOpen"
      :outcome="outcome"
      :players="record.players"
      @new-game="openNewGame"
      @close="resultOpen = false"
    />
    <PgnDialog
      :open="pgnOpen"
      :export-text="pgnExport"
      :file-name="pgnFileName"
      :import-pgn="game.importPgn"
      @close="pgnOpen = false"
      @imported="onImported"
    />
    <BaseDialog :open="resignOpen" title="Resign" size="sm" @cancel="resignOpen = false">
      <p class="muted">Which player is resigning? This ends the game and cannot be undone.</p>
      <template #actions>
        <button type="button" class="button" data-autofocus @click="resignOpen = false">Cancel</button>
        <button type="button" class="button button--danger" @click="resign('w')">{{ colorName('w') }} resigns</button>
        <button type="button" class="button button--danger" @click="resign('b')">{{ colorName('b') }} resigns</button>
      </template>
    </BaseDialog>
    <ConfirmDialog
      :open="drawOpen"
      title="Agree to a draw?"
      message="Both players agree to end the game as a draw."
      confirm-label="Agree draw"
      @confirm="agreeDraw"
      @cancel="drawOpen = false"
    />
  </div>
</template>

<style scoped>
.game {
  display: grid;
  gap: 1rem;
  width: 100%;
  max-width: 76rem;
  margin: 0 auto;
}
.game__notices {
  display: grid;
  gap: 0.5rem;
  grid-column: 1 / -1;
}
.game__notices:empty {
  display: none;
}
.game__board-column {
  display: grid;
  gap: 0.5rem;
  /* Keep the board inside the viewport height on short desktop screens. */
  width: min(100%, calc(100dvh - 14.5rem), 46rem);
  min-width: min(100%, 18rem);
  justify-self: center;
}
.game__board-box {
  position: relative;
}
.board-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.75rem;
  border-radius: var(--radius-sm);
  background: rgb(12 14 18 / 0.6);
  color: #fff;
  font-weight: 600;
  font-size: 1.1rem;
}
.board-overlay p {
  margin: 0;
}
.game__side {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}
.status-bar {
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border);
}
.status-bar--over {
  border-color: var(--accent);
}
.status-bar__text {
  margin: 0;
  font-weight: 600;
  color: var(--text-strong);
}
.rules-summary {
  margin-top: 0.4rem;
  font-size: 0.85rem;
}
.rules-summary summary {
  cursor: pointer;
  color: var(--text-muted);
}
.rules-summary__list {
  margin-top: 0.4rem;
}
.status-bar__meta {
  margin: 0.15rem 0 0;
}
.game__history {
  flex: 1;
  min-height: 10rem;
}
/* Side-by-side layout for everything that is not the compact (phone/portrait) layout. */
@media (min-width: 760px) {
  .game {
    /* Board track: as large as the viewport height allows, never below a usable size. */
    grid-template-columns: minmax(18rem, min(calc(100dvh - 14.5rem), 46rem)) 20rem;
    justify-content: center;
    align-items: start;
  }
  .game__board-column {
    width: 100%;
  }
  .game__side {
    position: sticky;
    top: 1rem;
    max-height: calc(100dvh - 6rem);
  }
}
/* ---- Phones: full-screen game, no page scroll ------------------------------ */
.game--compact {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  height: calc(100dvh - var(--header-total));
  overflow: hidden;
}
.game--compact .game__notices {
  position: absolute;
  inset: auto 0.75rem calc(4.25rem + env(safe-area-inset-bottom, 0px)) 0.75rem;
  z-index: 30;
  box-shadow: var(--shadow-dialog);
  border-radius: var(--radius-md);
}
/*
 * Player bars stay attached to the board, as in the Chess.com app: the board
 * is as large as the column allows after both bars, and any spare height is
 * shared above and below the whole group.
 */
.game--compact .game__board-column {
  --bar-h: 3rem;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  width: 100%;
  min-width: 0;
  min-height: 0;
  container-type: size;
}
.game--compact .game__board-column > :deep(.player) {
  flex: none;
  height: var(--bar-h);
  min-height: 0;
}
.game--compact .game__board-box {
  width: min(100cqw, 100cqh - 2 * var(--bar-h));
  margin: 0 auto;
}
.game--compact .game__board-box :deep(.board) {
  border-radius: 0;
  box-shadow: none;
  /* Every touch on the board belongs to the game, not to page scrolling. */
  touch-action: none;
}
.game--compact .board-overlay {
  border-radius: 0;
}
.status-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2rem;
  height: 2rem;
  padding: 0.2rem 0.75rem;
  border-top: 1px solid var(--border);
  background: var(--surface);
  font-size: 0.85rem;
}
.status-line--over .status-line__text {
  color: var(--accent-strong);
}
.status-line__text {
  margin: 0;
  overflow: hidden;
  font-weight: 600;
  color: var(--text-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Short enough to fit the status line, so the board does not shift when browsing history. */
.status-line__live {
  min-height: 1.5rem;
  padding: 0 0.7rem;
  font-size: 0.8rem;
  line-height: 1;
}
.status-line__meta {
  flex: none;
  margin: 0;
  color: var(--text-muted);
  font-size: 0.75rem;
  white-space: nowrap;
}
.toolbar {
  display: flex;
  justify-content: space-around;
  padding: 0.25rem 0.25rem calc(0.25rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.toolbar__button {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  min-width: 0;
  min-height: 3.25rem;
  padding: 0.35rem 0.25rem;
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 0.7rem;
  cursor: pointer;
}
.toolbar__button .icon {
  width: 1.35rem;
  height: 1.35rem;
}
.toolbar__button:active:not(:disabled) {
  background: var(--accent-soft);
}
.toolbar__button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.toolbar__button--accent {
  color: var(--accent-strong);
  font-weight: 600;
}
</style>
