import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { STARTING_FEN, buildPosition, exportPgn as rulesExportPgn, lacksMatingMaterial, parsePgn } from '../services/chessRules'
import { checkpointAfterMove, elapsedInTurn, initialCheckpoint, remainingAt } from '../services/clock'
import { DEFAULT_PRESET, DEFAULT_RULES, claimedDrawOutcome, isRuleOutcome, ruleOutcome } from '../services/gameRules'
import { backupUnreadableGame, loadGame, saveGame, validateRecord } from '../services/persistence'
import { now as timeNow } from '../services/timeSource'
import {
  GAME_RECORD_VERSION,
  fail,
  ok,
  type ClockCheckpoint,
  type GameRecord,
  type GameRules,
  type Opponent,
  type RulesChoice,
  type MoveInput,
  type Outcome,
  type PieceColor,
  type PieceType,
  type Position,
  type RecordedMove,
  type Result,
  type Square,
  type TimeControl,
} from '../types'

export interface GameSetup {
  whiteName: string
  blackName: string
  timeControl: TimeControl | null
  rulesChoice: RulesChoice
  rules: GameRules
  opponent: Opponent
}

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const other = (c: PieceColor): PieceColor => (c === 'w' ? 'b' : 'w')

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `game-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createRecord(setup: GameSetup, initialFen = STARTING_FEN): GameRecord {
  return {
    version: GAME_RECORD_VERSION,
    id: newId(),
    createdAt: new Date().toISOString(),
    revision: 0,
    source: 'local',
    initialFen,
    moves: [],
    cursor: 0,
    players: { w: { name: setup.whiteName.trim() }, b: { name: setup.blackName.trim() } },
    timeControl: setup.timeControl,
    rulesChoice: setup.rulesChoice,
    rules: { ...setup.rules },
    opponent: { ...setup.opponent },
    clocks: [initialCheckpoint(setup.timeControl)],
    turnElapsedMs: 0,
    finalClock: null,
    outcome: null,
  }
}

const DEFAULT_SETUP: GameSetup = {
  whiteName: '',
  blackName: '',
  timeControl: null,
  rulesChoice: DEFAULT_PRESET,
  rules: DEFAULT_RULES,
  opponent: { kind: 'person' },
}

export { isRuleOutcome }

export const useGameStore = defineStore('game', () => {
  const record = ref<GameRecord>(createRecord(DEFAULT_SETUP))
  /** Monotonic timestamp when the side to move's clock last started; null when not running. */
  const runningSince = ref<number | null>(null)
  /** Display clock refreshed by the ticker; never used to decide elapsed time on its own. */
  const clockNow = ref(timeNow())
  const restoreNotice = ref<string | null>(null)
  const storageWarning = ref<string | null>(null)

  // ---- Derived state -------------------------------------------------------

  const appliedMoves = computed<RecordedMove[]>(() => record.value.moves.slice(0, record.value.cursor))

  const position = computed<Position>(() => {
    const built = buildPosition(record.value.initialFen, appliedMoves.value, record.value.rules)
    if (built.ok) return built.value
    // Records are validated before they are committed, so this indicates a bug.
    console.error('Game record could not be replayed:', built.error)
    return (buildPosition(STARTING_FEN, []) as { ok: true; value: Position }).value
  })

  const outcome = computed(() => record.value.outcome)
  const isOver = computed(() => record.value.outcome !== null)
  const isTimed = computed(() => record.value.timeControl !== null)
  /** Clock policy: clocks start once the first move has been played. */
  const clockStarted = computed(() => isTimed.value && record.value.cursor >= 1)
  const isClockRunning = computed(() => runningSince.value !== null)
  const isPaused = computed(() => clockStarted.value && !isOver.value && runningSince.value === null)
  const rules = computed(() => record.value.rules)
  const rulesChoice = computed(() => record.value.rulesChoice)
  const canUndo = computed(
    () =>
      rules.value.takebacks &&
      record.value.cursor > 0 &&
      !isPaused.value &&
      (!isOver.value || isRuleOutcome(record.value.outcome)),
  )
  const canRedo = computed(
    () => rules.value.takebacks && record.value.cursor < record.value.moves.length && !isOver.value && !isPaused.value,
  )
  /** A repetition or fifty-move draw the side to move may claim (only under claim rules). */
  const canClaimDraw = computed(
    () => !isOver.value && rules.value.drawClaims === 'claim' && position.value.drawClaim !== null,
  )
  const canMove = computed(() => !isOver.value && !isPaused.value)
  const opponent = computed(() => record.value.opponent)
  /** The colour the computer plays, or null in a game played in person. */
  const computerColor = computed(() => (opponent.value.kind === 'computer' ? opponent.value.color : null))
  /** True when the live position is waiting for the computer to move. */
  const isComputerTurn = computed(
    () => computerColor.value !== null && canMove.value && position.value.turn === computerColor.value,
  )

  const clocks = computed<ClockCheckpoint | null>(() => {
    const r = record.value
    if (!r.timeControl) return null
    if (r.finalClock) return r.finalClock
    const checkpoint = r.clocks[r.cursor]!
    const elapsed = elapsedInTurn(r.turnElapsedMs, runningSince.value, clockNow.value)
    return remainingAt(checkpoint, position.value.turn, elapsed)
  })

  /** Pieces each side has captured, derived from the applied move list. */
  const captured = computed<Record<PieceColor, PieceType[]>>(() => {
    const result: Record<PieceColor, PieceType[]> = { w: [], b: [] }
    for (const move of appliedMoves.value) if (move.captured) result[move.color].push(move.captured)
    return result
  })

  // ---- Internal helpers ----------------------------------------------------

  /** Records are plain JSON data; a JSON copy also strips any nested reactive proxies. */
  function cloneRecord(): GameRecord {
    return plain(record.value)
  }

  /** Swap in a fully prepared record in one assignment so the change is atomic. */
  function commit(next: GameRecord): void {
    next.revision = record.value.revision + 1
    record.value = next
    persist()
  }

  function liveElapsed(t: number): number {
    return elapsedInTurn(record.value.turnElapsedMs, runningSince.value, t)
  }

  function liveClocks(t: number): ClockCheckpoint | null {
    const r = record.value
    if (!r.timeControl) return null
    if (r.finalClock) return r.finalClock
    return remainingAt(r.clocks[r.cursor]!, position.value.turn, liveElapsed(t))
  }

  /** Ends the game, freezing clocks at their values at time `t`. */
  function finish(outcomeValue: Outcome, t: number, clockOverride?: ClockCheckpoint): void {
    const next = cloneRecord()
    next.outcome = outcomeValue
    const frozen = clockOverride ?? liveClocks(t)
    next.finalClock = frozen ? { w: Math.max(0, frozen.w), b: Math.max(0, frozen.b) } : null
    next.turnElapsedMs = 0
    runningSince.value = null
    commit(next)
  }

  /** Flags the side to move if its time is gone. Returns true when the game ended on time. */
  function checkTimeout(t: number): boolean {
    if (isOver.value || runningSince.value === null) return false
    const current = liveClocks(t)
    if (!current) return false
    const turn = position.value.turn
    if (current[turn] > 0) return false
    // Timeout policy: the opponent wins unless they lack mating material (simplified check).
    const opponent = other(turn)
    const drawn = lacksMatingMaterial(position.value.pieces, opponent)
    finish(
      drawn
        ? { result: '1/2-1/2', winner: null, reason: 'timeout-vs-insufficient-material' }
        : { result: opponent === 'w' ? '1-0' : '0-1', winner: opponent, reason: 'timeout' },
      t,
      { ...current, [turn]: 0 },
    )
    return true
  }

  // ---- Persistence ---------------------------------------------------------

  /** The record with the in-progress turn time folded in, suitable for saving. */
  function snapshot(): GameRecord {
    const copy = cloneRecord()
    if (runningSince.value !== null) copy.turnElapsedMs = liveElapsed(timeNow())
    return copy
  }

  function persist(): void {
    const saved = saveGame(snapshot())
    storageWarning.value = saved.ok ? null : saved.error
  }

  /** Called at lifecycle checkpoints (tab hidden, page hide) rather than every frame. */
  function saveCheckpoint(): void {
    persist()
  }

  function hydrate(): void {
    const loaded = loadGame()
    if (loaded.kind === 'loaded') {
      adopt(loaded.record)
    } else if (loaded.kind === 'error') {
      backupUnreadableGame()
      restoreNotice.value = `${loaded.message} A new game was started; the unreadable data was kept as a backup.`
      record.value = createRecord(DEFAULT_SETUP)
      runningSince.value = null
    }
  }

  /** Installs a validated record. Clock policy: restored timed games start paused. */
  function adopt(next: GameRecord): void {
    record.value = next
    runningSince.value = null
    clockNow.value = timeNow()
  }

  // ---- Public actions ------------------------------------------------------

  function startGame(setup: GameSetup): void {
    runningSince.value = null
    restoreNotice.value = null
    record.value = createRecord(setup)
    clockNow.value = timeNow()
    persist()
  }

  function getLegalMoves(square: Square) {
    return position.value.legalMoves.filter((m) => m.from === square)
  }

  function needsPromotion(input: Pick<MoveInput, 'from' | 'to'>): boolean {
    return position.value.legalMoves.some((m) => m.from === input.from && m.to === input.to && m.promotion)
  }

  function tryMove(input: MoveInput): Result<RecordedMove> {
    if (isOver.value) return fail('The game is over.')
    if (isPaused.value) return fail('The game is paused. Resume to continue.')
    const t = timeNow()
    if (checkTimeout(t)) return fail('Time ran out before that move.')

    const candidates = position.value.legalMoves.filter((m) => m.from === input.from && m.to === input.to)
    if (candidates.length === 0) return fail('That move is not legal.')
    const legal = candidates.find((m) => m.promotion === input.promotion)
    if (!legal) return fail(input.promotion ? 'That promotion is not legal.' : 'Choose a piece to promote to.')

    const r = record.value
    const next = cloneRecord()
    next.moves = [...next.moves.slice(0, r.cursor), plain(legal)]
    next.cursor = r.cursor + 1
    next.turnElapsedMs = 0
    const checkpoint = r.timeControl
      ? checkpointAfterMove(r.clocks[r.cursor]!, legal.color, liveElapsed(t), r.timeControl, clockStarted.value)
      : initialCheckpoint(null)
    next.clocks = [...next.clocks.slice(0, r.cursor + 1), checkpoint]

    const after = buildPosition(next.initialFen, next.moves, next.rules)
    if (!after.ok) return fail(after.error)
    next.outcome = ruleOutcome(after.value, r.rules)
    next.finalClock = next.outcome && r.timeControl ? checkpoint : null
    runningSince.value = r.timeControl && !next.outcome ? t : null
    clockNow.value = t
    commit(next)
    return ok(legal)
  }

  function moveCursor(target: number): void {
    const r = record.value
    const t = timeNow()
    const next = cloneRecord()
    next.cursor = target
    next.turnElapsedMs = 0
    const after = buildPosition(next.initialFen, next.moves.slice(0, target), next.rules)
    next.outcome = after.ok ? ruleOutcome(after.value, r.rules) : null
    next.finalClock = next.outcome && r.timeControl ? next.clocks[target]! : null
    runningSince.value = r.timeControl && target >= 1 && !next.outcome ? t : null
    clockNow.value = t
    commit(next)
  }

  /** Undo restores the clock checkpoint from before the undone move. */
  function undoMove(): Result<true> {
    if (!rules.value.takebacks) return fail('Takebacks are off in this game.')
    if (!canUndo.value) return fail('Nothing to undo.')
    // Against the computer, take back to the player's turn: the computer's
    // reply and the player's move go together.
    let target = record.value.cursor - 1
    while (target > 0 && record.value.moves[target]!.color === computerColor.value) target--
    moveCursor(target)
    return ok(true)
  }

  function redoMove(): Result<true> {
    if (!rules.value.takebacks) return fail('Takebacks are off in this game.')
    if (!canRedo.value) return fail('Nothing to redo.')
    // Against the computer, redo the player's move and the computer's reply together.
    let target = record.value.cursor + 1
    const moves = record.value.moves
    while (target < moves.length && moves[target]!.color === computerColor.value) target++
    moveCursor(target)
    return ok(true)
  }

  function resign(color: PieceColor): Result<true> {
    if (isOver.value) return fail('The game is already over.')
    const winner = other(color)
    finish({ result: winner === 'w' ? '1-0' : '0-1', winner, reason: 'resignation' }, timeNow())
    return ok(true)
  }

  /** Claim a threefold-repetition or fifty-move draw. Like other explicit results, it is final. */
  function claimDraw(): Result<true> {
    if (!canClaimDraw.value) return fail('There is no draw to claim in this position.')
    const claimed = claimedDrawOutcome(position.value)
    if (!claimed) return fail('There is no draw to claim in this position.')
    finish(claimed, timeNow())
    return ok(true)
  }

  function agreeDraw(): Result<true> {
    if (isOver.value) return fail('The game is already over.')
    finish({ result: '1/2-1/2', winner: null, reason: 'agreement' }, timeNow())
    return ok(true)
  }

  function pause(): void {
    if (runningSince.value === null || isOver.value) return
    const t = timeNow()
    if (checkTimeout(t)) return
    const next = cloneRecord()
    next.turnElapsedMs = liveElapsed(t)
    runningSince.value = null
    clockNow.value = t
    commit(next)
  }

  function resume(): void {
    if (!isPaused.value) return
    const t = timeNow()
    runningSince.value = t
    clockNow.value = t
  }

  /** Refreshes the display time and enforces expiry. Safe to call at any rate. */
  function tick(): void {
    const t = timeNow()
    clockNow.value = t
    checkTimeout(t)
  }

  /** Replaces the current game with an untrusted record only if it validates. */
  function restoreGame(candidate: unknown): Result<true> {
    const validated = validateRecord(candidate)
    if (!validated.ok) return fail(validated.error)
    adopt(plain(validated.value))
    persist()
    return ok(true)
  }

  function positionAt(ply: number): Position | null {
    const built = buildPosition(record.value.initialFen, record.value.moves.slice(0, ply), record.value.rules)
    return built.ok ? built.value : null
  }

  function exportPgn(): Result<string> {
    const r = record.value
    return rulesExportPgn({
      initialFen: r.initialFen,
      moves: appliedMoves.value,
      players: r.players,
      outcome: r.outcome,
      date: new Date(r.createdAt),
      timeControl: r.timeControl,
      moveRules: r.rules,
    })
  }

  /**
   * Import policy: imported games are untimed. Unfinished PGNs ("*") stay
   * playable; a PGN with a final result loads as a finished game for review.
   */
  function importPgn(text: string): Result<true> {
    const parsed = parsePgn(text)
    if (!parsed.ok) return fail(parsed.error)
    const { initialFen, moves, players, recordedResult } = parsed.value
    const next = createRecord(
      {
        whiteName: players.w.name,
        blackName: players.b.name,
        timeControl: null,
        rulesChoice: DEFAULT_PRESET,
        rules: DEFAULT_RULES,
        opponent: { kind: 'person' },
      },
      initialFen,
    )
    next.source = 'pgn-import'
    next.moves = moves
    next.cursor = moves.length
    next.clocks = moves.map(() => initialCheckpoint(null)).concat(next.clocks)
    const after = buildPosition(initialFen, moves)
    if (!after.ok) return fail(after.error)
    let finalOutcome = ruleOutcome(after.value, next.rules)
    if (!finalOutcome && recordedResult) {
      const winner = recordedResult === '1-0' ? 'w' : recordedResult === '0-1' ? 'b' : null
      finalOutcome = { result: recordedResult, winner, reason: 'recorded-result' }
    }
    next.outcome = finalOutcome
    const validated = validateRecord(next)
    if (!validated.ok) return fail(validated.error)
    adopt(next)
    persist()
    return ok(true)
  }

  function dismissRestoreNotice(): void {
    restoreNotice.value = null
  }

  return {
    record,
    restoreNotice,
    storageWarning,
    opponent,
    computerColor,
    isComputerTurn,
    position,
    appliedMoves,
    outcome,
    isOver,
    isTimed,
    isClockRunning,
    isPaused,
    canUndo,
    canRedo,
    canClaimDraw,
    rules,
    rulesChoice,
    canMove,
    clocks,
    captured,
    hydrate,
    snapshot,
    saveCheckpoint,
    startGame,
    getLegalMoves,
    needsPromotion,
    tryMove,
    undoMove,
    redoMove,
    resign,
    agreeDraw,
    claimDraw,
    pause,
    resume,
    tick,
    restoreGame,
    positionAt,
    exportPgn,
    importPgn,
    dismissRestoreNotice,
  }
})
