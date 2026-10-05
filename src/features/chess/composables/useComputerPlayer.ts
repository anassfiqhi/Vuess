import { defineStore } from 'pinia'
import { onScopeDispose, ref, watch } from 'vue'
import { disposeEngine, getEngine, isAbortError } from '../services/engine/engine'
import { useGameStore } from '../stores/game'

/** What the screen shows about the computer opponent; never saved. */
export const useComputerStatus = defineStore('computerStatus', () => {
  const thinking = ref(false)
  const error = ref<string | null>(null)
  /** Bumped to ask the player to try again after an engine failure. */
  const retries = ref(0)
  function retry(): void {
    error.value = null
    retries.value++
  }
  return { thinking, error, retries, retry }
})

/** Short pause so the computer's reply is visible as a separate move, even at instant levels. */
export const MIN_REPLY_DELAY_MS = 350

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Plays the computer's moves. Whenever it is the computer's turn in the live
 * game, it asks the engine for a move tagged with the game's revision. If the
 * game changed meanwhile (undo, new game, pause, a restore), the request is
 * cancelled and any late answer is ignored. Mounted once in App.vue.
 */
export function useComputerPlayer() {
  const game = useGameStore()
  const status = useComputerStatus()
  let controller: AbortController | null = null

  function cancel(): void {
    controller?.abort()
    controller = null
    status.thinking = false
  }

  async function play(): Promise<void> {
    const opponent = game.record.opponent
    if (opponent.kind !== 'computer') return
    const revision = game.record.revision
    const request = { initialFen: game.record.initialFen, moves: game.appliedMoves.map((m) => ({ ...m })), level: opponent.level }
    const current = new AbortController()
    controller = current
    status.thinking = true
    status.error = null
    try {
      const engine = await getEngine()
      const [move] = await Promise.all([engine.bestMove(request, current.signal), delay(MIN_REPLY_DELAY_MS)])
      // Apply only if nothing changed while the engine was thinking.
      if (current.signal.aborted || game.record.revision !== revision || !game.isComputerTurn) return
      const result = game.tryMove(move)
      if (!result.ok && !game.isOver) status.error = `The computer's move was rejected: ${result.error}`
    } catch (error) {
      if (!isAbortError(error)) {
        status.error = 'The computer could not move. Start a new game or try again.'
        console.error(error)
      }
    } finally {
      if (controller === current) {
        controller = null
        status.thinking = false
      }
    }
  }

  watch(
    () => [game.isComputerTurn, game.record.revision, status.retries] as const,
    ([computerTurn]) => {
      cancel()
      if (computerTurn) void play()
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    cancel()
    disposeEngine()
  })
}
