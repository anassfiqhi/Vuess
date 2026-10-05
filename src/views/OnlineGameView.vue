<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useGameLayout } from '@/composables/useGameLayout'
import ChessBoard from '@/features/chess/components/ChessBoard.vue'
import GameResultDialog from '@/features/chess/components/GameResultDialog.vue'
import MoveHistory from '@/features/chess/components/MoveHistory.vue'
import PlayerPanel from '@/features/chess/components/PlayerPanel.vue'
import PromotionDialog from '@/features/chess/components/PromotionDialog.vue'
import OnlineNotices from '@/features/online/components/OnlineNotices.vue'
import { useBoardInteraction } from '@/features/chess/composables/useBoardInteraction'
import { useMotionEnabled } from '@/features/chess/composables/useReducedMotion'
import { useSound } from '@/features/chess/composables/useSound'
import { describeTimeControl } from '@/features/chess/services/clock'
import { colorName, describeOutcome } from '@/features/chess/services/outcomeText'
import type { PieceColor, PieceType, Position, RecordedMove } from '@/features/chess/types'
import { inviteLink } from '@/features/online/services/gameLink'
import { ONLINE_RULES, useOnlineStore } from '@/features/online/stores/online'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const router = useRouter()
const online = useOnlineStore()
const { connection, game, error, busy, position, moves, myColor, isSpectator, isOver, canMove, clocks, captured } =
  storeToRefs(online)
const { settings } = storeToRefs(useSettingsStore())

const isCompact = useGameLayout()
const motionEnabled = useMotionEnabled(computed(() => settings.value.animations))
const sound = useSound(computed(() => settings.value.soundEnabled))

// ---- Opening the game ----------------------------------------------------------

const routeGameId = computed(() => String(route.params.gameId ?? ''))
/** Players who arrive by link without a saved name are asked for one first. */
const needsName = ref(false)
const nameDraft = ref(online.playerName)

async function open(): Promise<void> {
  const id = routeGameId.value
  if (!id) return
  if (!online.playerName && !online.hasSeat(id)) {
    needsName.value = true
    return
  }
  needsName.value = false
  await online.openGame(id)
}
watch(routeGameId, () => void open(), { immediate: true })

function submitName(): void {
  online.setName(nameDraft.value || 'Guest')
  void open()
}

// ---- Board, history and moves --------------------------------------------------

const flipped = ref(false)
const orientation = computed<PieceColor>(() => {
  const base: PieceColor = myColor.value ?? 'w'
  return flipped.value ? (base === 'w' ? 'b' : 'w') : base
})

const viewPly = ref<number | null>(null)
watch(
  () => game.value?.revision,
  () => (viewPly.value = null),
)
const viewingHistory = computed(() => viewPly.value !== null)
const shownPly = computed(() => viewPly.value ?? moves.value.length)
const displayedPosition = computed<Position>(() =>
  viewPly.value === null ? position.value : (online.positionAt(viewPly.value) ?? position.value),
)
function selectPly(ply: number): void {
  const clamped = Math.max(0, Math.min(ply, moves.value.length))
  viewPly.value = clamped === moves.value.length ? null : clamped
}

const announcement = ref('')
const animatedMove = ref<{ move: RecordedMove; id: number } | null>(null)
let animationId = 0

const interaction = useBoardInteraction({
  position,
  canInteract: computed(() => canMove.value && !viewingHistory.value),
  submitMove: (input) => online.move(input),
  onMoveRejected: () => sound.play('error'),
})
const { selected, pendingPromotion, targets } = interaction
const movableColor = computed<PieceColor | null>(() =>
  canMove.value && !viewingHistory.value && !pendingPromotion.value ? myColor.value : null,
)

/** Every new move (yours as soon as it is played, the opponent's when it arrives) animates and sounds. */
watch(
  () => moves.value.length,
  (count, previous) => {
    if (previous === undefined || count <= previous) return
    const move = moves.value[count - 1]!
    animatedMove.value = { move, id: ++animationId }
    const check = position.value.inCheck
    announcement.value = `${colorName(move.color)} played ${move.san}.${check ? ' Check.' : ''}`
    if (!isOver.value) sound.play(check ? 'check' : move.captured ? 'capture' : 'move')
  },
)

// ---- Players and clocks --------------------------------------------------------

const VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const materialOf = (pieces: PieceType[]) => pieces.reduce((sum, p) => sum + VALUES[p], 0)
function panelFor(color: PieceColor) {
  const player = game.value?.players[color]
  const lead = materialOf(captured.value[color]) - materialOf(captured.value[color === 'w' ? 'b' : 'w'])
  const you = myColor.value === color
  return {
    color,
    name: player?.joined ? `${player.name}${you ? ' (you)' : ''}` : 'Waiting for opponent…',
    captured: captured.value[color],
    materialLead: Math.max(0, lead),
    clockMs: clocks.value ? clocks.value[color] : null,
    clockRunning: !isOver.value && game.value?.clock?.running === color,
    toMove: game.value?.status === 'active' && position.value.turn === color,
    showMaterial: ONLINE_RULES.showMaterial,
    offline: !!player?.joined && !player.connected && !isOver.value,
  }
}
const topPanel = computed(() => panelFor(orientation.value === 'w' ? 'b' : 'w'))
const bottomPanel = computed(() => panelFor(orientation.value))

let ticker: ReturnType<typeof setInterval> | undefined
watch(
  () => !!game.value?.clock?.running && !isOver.value,
  (running) => {
    clearInterval(ticker)
    if (running) ticker = setInterval(() => online.tick(), 100)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(ticker))

// ---- Status ----------------------------------------------------------------------

const opponentColor = computed<PieceColor | null>(() => (myColor.value ? (myColor.value === 'w' ? 'b' : 'w') : null))
const status = computed(() => {
  const state = game.value
  if (!state) return busy.value ? 'Connecting…' : 'Loading game…'
  if (state.outcome) {
    const text = describeOutcome(state.outcome, { w: state.players.w, b: state.players.b })
    return `${text.headline} — ${text.detail}`
  }
  if (state.status === 'waiting') return 'Waiting for an opponent to join'
  if (connection.value === 'reconnecting') return 'Reconnecting…'
  const turn = position.value.turn
  if (isSpectator.value) return `${colorName(turn)} to move`
  return turn === myColor.value ? 'Your move' : 'Opponent to move'
})
const meta = computed(() => `Online · Chess.com style · ${describeTimeControl(game.value?.timeControl ?? null)}`)

const incomingDrawOffer = computed(
  () => !!game.value && !isOver.value && !!opponentColor.value && game.value.drawOffer === opponentColor.value,
)
const outgoingDrawOffer = computed(() => !!game.value && !isOver.value && !!myColor.value && game.value.drawOffer === myColor.value)
const canAct = computed(() => game.value?.status === 'active' && !!myColor.value)

// ---- Invite link -------------------------------------------------------------------

const link = computed(() => (game.value ? inviteLink(game.value.id) : ''))
const copyStatus = ref('')
async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(link.value)
    copyStatus.value = 'Link copied.'
  } catch {
    copyStatus.value = 'Copy failed; select the link and copy it.'
  }
}
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
function shareLink(): void {
  void navigator.share({ title: 'Play chess on Vuess', url: link.value }).catch(() => undefined)
}

// ---- Dialogs and actions -------------------------------------------------------

const moreOpen = ref(false)
const resignOpen = ref(false)
const drawOpen = ref(false)
const resultOpen = ref(false)

watch(
  () => game.value?.outcome ?? null,
  (next, previous) => {
    if (next && !previous && game.value) {
      interaction.clear()
      resultOpen.value = true
      announcement.value = `Game over. ${describeOutcome(next, game.value.players).headline}.`
      sound.play('end')
    }
  },
)

function fromSheet(action: () => void): void {
  moreOpen.value = false
  action()
}
async function resign(): Promise<void> {
  resignOpen.value = false
  await online.resign()
}
async function offerDraw(): Promise<void> {
  drawOpen.value = false
  await online.offerDraw()
  if (!error.value) announcement.value = 'Draw offered.'
}
function newGame(): void {
  resultOpen.value = false
  void router.push('/online')
}
</script>

<template>
  <div
    class="game"
    :class="[`board-theme--${settings.boardTheme}`, { 'motion-off': !motionEnabled, 'game--compact': isCompact }]"
  >
    <div v-if="isCompact" class="game__notices">
      <OnlineNotices
        :error="error"
        :reconnecting="connection === 'reconnecting'"
        :incoming-draw-offer="incomingDrawOffer"
        :outgoing-draw-offer="outgoingDrawOffer"
        @dismiss="online.dismissError()"
        @respond="online.respondToDraw"
      />
    </div>

    <MoveHistory
      v-if="isCompact"
      variant="strip"
      :moves="moves"
      :view-ply="shownPly"
      start-color="w"
      :start-move-number="1"
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
            :show-targets="ONLINE_RULES.showLegalMoves"
            :show-last-move="ONLINE_RULES.highlightLastMove"
            :animated-move="motionEnabled && !viewingHistory ? animatedMove : null"
            label="Chess board"
            @activate="interaction.activate"
            @drag-start="interaction.dragStart"
            @drop="interaction.drop"
            @cancel="interaction.clear"
          />
          <div v-if="needsName" class="board-overlay">
            <form class="overlay-form" @submit.prevent="submitName">
              <p>Join this game</p>
              <label class="field">
                <span class="visually-hidden">Your name</span>
                <input v-model="nameDraft" name="online-name" maxlength="40" placeholder="Your name" autocomplete="nickname">
              </label>
              <button type="submit" class="button button--primary">Join</button>
            </form>
          </div>
          <div v-else-if="game?.status === 'waiting' && !isSpectator" class="board-overlay" data-testid="invite">
            <p>Waiting for an opponent</p>
            <p class="overlay-hint">Send this link to the person you want to play:</p>
            <input class="overlay-link" :value="link" readonly aria-label="Invite link" @focus="($event.target as HTMLInputElement).select()">
            <span class="overlay-actions">
              <button type="button" class="button button--primary" @click="copyLink"><AppIcon name="link" />Copy link</button>
              <button v-if="canShare" type="button" class="button" @click="shareLink">Share</button>
            </span>
            <span class="overlay-hint" role="status">{{ copyStatus }}</span>
          </div>
        </div>
      </div>
      <PlayerPanel v-bind="bottomPanel" :compact="isCompact" />
    </div>

    <template v-if="isCompact">
      <div class="status-line" :class="{ 'status-line--over': isOver }">
        <template v-if="viewingHistory">
          <p class="status-line__text">Viewing move {{ shownPly }} of {{ moves.length }}</p>
          <button type="button" class="button button--primary status-line__live" aria-label="Back to live game" @click="viewPly = null">
            Live
          </button>
        </template>
        <template v-else>
          <p class="status-line__text" data-testid="status">{{ status }}</p>
          <p class="status-line__meta">{{ describeTimeControl(game?.timeControl ?? null) }}</p>
        </template>
      </div>

      <nav class="toolbar" aria-label="Game actions">
        <button type="button" class="toolbar__button" aria-label="New online game" @click="newGame">
          <AppIcon name="plus" /><span aria-hidden="true">New</span>
        </button>
        <button type="button" class="toolbar__button" aria-label="Previous move" :disabled="shownPly === 0" @click="selectPly(shownPly - 1)">
          <AppIcon name="prev" /><span aria-hidden="true">Back</span>
        </button>
        <button
          type="button"
          class="toolbar__button"
          aria-label="Next move"
          :disabled="shownPly >= moves.length"
          @click="selectPly(shownPly + 1)"
        >
          <AppIcon name="next" /><span aria-hidden="true">Forward</span>
        </button>
        <button v-if="canAct && !outgoingDrawOffer" type="button" class="toolbar__button" @click="drawOpen = true">
          <AppIcon name="handshake" /><span>Draw</span>
        </button>
        <button type="button" class="toolbar__button" aria-label="More options" @click="moreOpen = true">
          <AppIcon name="more" /><span aria-hidden="true">More</span>
        </button>
      </nav>

      <BaseDialog :open="moreOpen" title="Game" sheet @cancel="moreOpen = false">
        <p class="muted small">{{ meta }}</p>
        <div class="controls">
          <button type="button" class="button" @click="fromSheet(newGame)"><AppIcon name="plus" />New game</button>
          <button type="button" class="button" @click="fromSheet(() => (flipped = !flipped))"><AppIcon name="flip" />Flip</button>
          <button type="button" class="button" @click="fromSheet(copyLink)"><AppIcon name="link" />Copy link</button>
          <button v-if="canAct" type="button" class="button" @click="fromSheet(() => (resignOpen = true))">
            <AppIcon name="flag" />Resign
          </button>
        </div>
      </BaseDialog>
    </template>

    <aside v-else class="game__side">
      <div class="status-bar" :class="{ 'status-bar--over': isOver }">
        <p class="status-bar__text" data-testid="status">{{ status }}</p>
        <p class="status-bar__meta muted small">{{ meta }}</p>
      </div>
      <OnlineNotices
        :error="error"
        :reconnecting="connection === 'reconnecting'"
        :incoming-draw-offer="incomingDrawOffer"
        :outgoing-draw-offer="outgoingDrawOffer"
        @dismiss="online.dismissError()"
        @respond="online.respondToDraw"
      />
      <div v-if="viewingHistory" class="notice notice--info">
        <p>Viewing move {{ shownPly }} of {{ moves.length }}. Moves are disabled.</p>
        <button type="button" class="button button--small button--primary" @click="viewPly = null">Back to live game</button>
      </div>
      <div class="controls">
        <button type="button" class="button" @click="newGame"><AppIcon name="plus" />New game</button>
        <button type="button" class="button" @click="flipped = !flipped"><AppIcon name="flip" />Flip</button>
        <button v-if="canAct && !outgoingDrawOffer" type="button" class="button" @click="drawOpen = true">
          <AppIcon name="handshake" />Offer draw
        </button>
        <button v-if="canAct" type="button" class="button" @click="resignOpen = true"><AppIcon name="flag" />Resign</button>
        <button type="button" class="button" @click="copyLink"><AppIcon name="link" />Copy link</button>
      </div>
      <MoveHistory
        class="game__history"
        :moves="moves"
        :view-ply="shownPly"
        start-color="w"
        :start-move-number="1"
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
    <GameResultDialog
      :open="resultOpen"
      :outcome="game?.outcome ?? null"
      :players="game?.players ?? { w: { name: '' }, b: { name: '' } }"
      @new-game="newGame"
      @close="resultOpen = false"
    />
    <ConfirmDialog
      :open="resignOpen"
      title="Resign?"
      message="This ends the game and your opponent wins."
      confirm-label="Resign"
      danger
      @confirm="resign"
      @cancel="resignOpen = false"
    />
    <ConfirmDialog
      :open="drawOpen"
      title="Offer a draw?"
      message="Your opponent can accept or decline. Making a move does not cancel your offer."
      confirm-label="Offer draw"
      @confirm="offerDraw"
      @cancel="drawOpen = false"
    />
  </div>
</template>

<style scoped>
.controls {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
  gap: 0.4rem;
}
.overlay-form {
  display: grid;
  gap: 0.6rem;
  justify-items: center;
  width: min(18rem, 85%);
}
.overlay-form .field {
  width: 100%;
}
.overlay-hint {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 400;
  opacity: 0.9;
}
.overlay-link {
  width: min(22rem, 85%);
  font: 0.85rem var(--mono);
  text-align: center;
}
.overlay-actions {
  display: flex;
  gap: 0.5rem;
}
</style>
