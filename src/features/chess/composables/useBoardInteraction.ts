import { computed, ref, watch, type Ref } from 'vue'
import type { LegalMove, MoveInput, Position, PromotionPiece, RecordedMove, Result, Square } from '../types'

export interface BoardInteractionOptions {
  position: Ref<Position>
  /** False when the game is over, paused, or a historical position is shown. */
  canInteract: Ref<boolean>
  /** Promote straight to a queen instead of asking. */
  autoQueen?: Ref<boolean>
  /** Online games answer asynchronously, once the server has decided. */
  submitMove: (input: MoveInput) => Result<RecordedMove> | Promise<Result<RecordedMove>>
  onMoveAccepted?: (move: RecordedMove) => void
  onMoveRejected?: (error: string) => void
}

/**
 * The single move pipeline shared by click/tap, drag and keyboard input:
 * select → show targets → request destination → (promotion) → submit.
 * Holds only transient UI state; nothing here is persisted.
 */
export function useBoardInteraction(options: BoardInteractionOptions) {
  const { position, canInteract } = options
  const selected = ref<Square | null>(null)
  const pendingPromotion = ref<{ from: Square; to: Square } | null>(null)

  const targets = computed<LegalMove[]>(() =>
    selected.value ? position.value.legalMoves.filter((m) => m.from === selected.value) : [],
  )
  const targetSquares = computed(() => new Set(targets.value.map((m) => m.to)))

  function isOwnPiece(square: Square): boolean {
    const piece = position.value.pieces[square]
    return !!piece && piece.color === position.value.turn
  }

  function clear(): void {
    selected.value = null
    pendingPromotion.value = null
  }

  // Any change to the position or interactivity invalidates the current selection.
  watch([() => position.value.fen, canInteract], clear)

  function select(square: Square): boolean {
    if (!canInteract.value || pendingPromotion.value || !isOwnPiece(square)) return false
    selected.value = square
    return true
  }

  function submit(input: MoveInput): void {
    const outcome = options.submitMove(input)
    clear()
    const handle = (result: Result<RecordedMove>) => {
      if (result.ok) options.onMoveAccepted?.(result.value)
      else options.onMoveRejected?.(result.error)
    }
    if (outcome instanceof Promise) void outcome.then(handle)
    else handle(outcome)
  }

  /** Request a move; opens the promotion step instead of committing a partial move. */
  function requestMove(from: Square, to: Square): void {
    if (!canInteract.value) return
    const candidates = position.value.legalMoves.filter((m) => m.from === from && m.to === to)
    if (candidates.length === 0) {
      clear()
      return
    }
    if (candidates.some((m) => m.promotion)) {
      if (options.autoQueen?.value) {
        submit({ from, to, promotion: 'q' })
        return
      }
      selected.value = from
      pendingPromotion.value = { from, to }
      return
    }
    submit({ from, to })
  }

  /** Click, tap, Enter or Space on a square. */
  function activate(square: Square): void {
    if (!canInteract.value || pendingPromotion.value) return
    if (selected.value === square) {
      clear()
    } else if (selected.value && targetSquares.value.has(square)) {
      requestMove(selected.value, square)
    } else if (isOwnPiece(square)) {
      selected.value = square
    } else {
      clear()
    }
  }

  function dragStart(square: Square): boolean {
    return select(square)
  }

  /** Drop handler; `to` is null when released outside the board. */
  function drop(from: Square, to: Square | null): void {
    if (!to || to === from) return // keep the selection so the drop acts like a tap
    if (targetSquares.value.has(to)) requestMove(from, to)
    else clear()
  }

  function choosePromotion(piece: PromotionPiece): void {
    const pending = pendingPromotion.value
    if (!pending) return
    submit({ ...pending, promotion: piece })
  }

  /** Cancelling promotion leaves the position untouched and clears the selection. */
  function cancelPromotion(): void {
    clear()
  }

  return {
    selected,
    pendingPromotion,
    targets,
    targetSquares,
    activate,
    dragStart,
    drop,
    choosePromotion,
    cancelPromotion,
    clear,
  }
}
