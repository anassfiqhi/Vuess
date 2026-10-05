import { defineStore } from 'pinia'
import { computed, markRaw, ref, shallowRef } from 'vue'
import { STARTING_FEN, buildPosition } from '@/features/chess/services/chessRules'
import { RULE_PRESETS } from '@/features/chess/services/gameRules'
import { readRaw, writeRaw } from '@/features/chess/services/storage'
import type { MoveInput, PieceColor, PieceType, Position, RecordedMove, Result, TimeControl } from '@/features/chess/types'
import { openSocket, request, type GameSocket } from '../services/connection'
import type { GameState, Seat } from '../protocol'

/** Online games use the server's rules: Chess.com style (no takebacks, automatic draws). */
export const ONLINE_RULES = RULE_PRESETS.chesscom.rules

const SEATS_KEY = 'vuess.online.seats'
const NAME_KEY = 'vuess.online.name'

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting'

let socketFactory: () => GameSocket = () => openSocket()
/** Test seam: replace how the socket is created. */
export function setSocketFactory(factory: () => GameSocket): void {
  socketFactory = factory
}

/** Seats are kept per game so a reload or reconnect returns to the same side. */
function loadSeats(): Record<string, Seat> {
  const raw = readRaw(SEATS_KEY)
  if (!raw.ok || !raw.value) return {}
  try {
    const parsed = JSON.parse(raw.value) as Record<string, Seat>
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function saveSeat(gameId: string, seat: Seat): void {
  const seats = loadSeats()
  seats[gameId] = seat
  // Keep the most recent games only.
  const recent = Object.fromEntries(Object.entries(seats).slice(-20))
  writeRaw(SEATS_KEY, JSON.stringify(recent))
}

const newMoveId = () => globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const useOnlineStore = defineStore('online', () => {
  const socket = shallowRef<GameSocket | null>(null)
  const connection = ref<ConnectionStatus>('idle')
  const gameId = ref<string | null>(null)
  const game = ref<GameState | null>(null)
  /** performance.now() when `game` arrived; clocks count down from there. */
  const receivedAt = ref(0)
  const now = ref(performance.now())
  const seat = ref<Seat | null>(null)
  /** A move shown immediately while the server confirms it. */
  const pendingMove = ref<RecordedMove | null>(null)
  const error = ref<string | null>(null)
  const busy = ref(false)
  const savedName = readRaw(NAME_KEY)
  const playerName = ref(savedName.ok ? (savedName.value ?? '') : '')

  // ---- Derived ---------------------------------------------------------------

  const moves = computed<RecordedMove[]>(() => {
    const list = game.value?.moves ?? []
    return pendingMove.value ? [...list, pendingMove.value] : list
  })

  const position = computed<Position>(() => {
    const built = buildPosition(game.value?.initialFen ?? STARTING_FEN, moves.value, ONLINE_RULES)
    if (built.ok) return built.value
    // The server only sends legal games; fall back to its confirmed moves.
    const confirmed = buildPosition(game.value?.initialFen ?? STARTING_FEN, game.value?.moves ?? [], ONLINE_RULES)
    return (confirmed as { ok: true; value: Position }).value
  })

  const myColor = computed<PieceColor | null>(() => seat.value?.color ?? null)
  const isSpectator = computed(() => !!game.value && !seat.value)
  const isOver = computed(() => game.value?.status === 'ended')
  const canMove = computed(
    () =>
      game.value?.status === 'active' &&
      connection.value === 'connected' &&
      !pendingMove.value &&
      myColor.value !== null &&
      position.value.turn === myColor.value,
  )

  /** Remaining time: the server's value minus the time since it arrived, for the running side. */
  const clocks = computed<Record<PieceColor, number> | null>(() => {
    const clock = game.value?.clock
    if (!clock) return null
    const left = { ...clock.remainingMs }
    if (clock.running && !isOver.value) left[clock.running] = Math.max(0, left[clock.running] - (now.value - receivedAt.value))
    return left
  })

  const captured = computed<Record<PieceColor, PieceType[]>>(() => {
    const result: Record<PieceColor, PieceType[]> = { w: [], b: [] }
    for (const move of moves.value) if (move.captured) result[move.color].push(move.captured)
    return result
  })

  // ---- Server state ----------------------------------------------------------

  function apply(state: GameState | undefined): void {
    if (!state || state.id !== gameId.value) return
    if (game.value && state.revision < game.value.revision) return
    game.value = state
    receivedAt.value = performance.now()
    now.value = receivedAt.value
  }

  function ensureSocket(): GameSocket {
    if (socket.value) return socket.value
    const s = markRaw(socketFactory())
    connection.value = 'connecting'
    let connectedBefore = false
    s.on('connect', () => {
      connection.value = 'connected'
      // After a reconnect (not the first connect, which openGame handles), rejoin so the
      // server knows we are back and sends the latest state.
      if (connectedBefore && gameId.value) void rejoin()
      connectedBefore = true
    })
    s.on('disconnect', () => {
      connection.value = 'reconnecting'
    })
    s.on('game:state', (state) => apply(state))
    socket.value = s
    return s
  }

  /** Joins run one at a time: two parallel joins could otherwise race for the same free seat. */
  let joining: Promise<void> = Promise.resolve()
  function rejoin(): Promise<void> {
    joining = joining.then(joinOnce, joinOnce)
    return joining
  }

  async function joinOnce(): Promise<void> {
    const id = gameId.value
    if (!id || !socket.value) return
    const token = loadSeats()[id]?.token
    const reply = await request(socket.value, 'game:join', { gameId: id, name: playerName.value, token })
    if (id !== gameId.value) return
    if (reply.ok) {
      seat.value = reply.seat
      if (reply.seat) saveSeat(id, reply.seat)
      pendingMove.value = null
      apply(reply.state)
    } else {
      error.value = reply.error
    }
  }

  // ---- Actions ---------------------------------------------------------------

  function setName(name: string): void {
    playerName.value = name.trim().slice(0, 40)
    writeRaw(NAME_KEY, playerName.value)
  }

  async function createGame(options: {
    name: string
    color: PieceColor | 'random'
    timeControl: TimeControl | null
  }): Promise<Result<string>> {
    setName(options.name)
    busy.value = true
    error.value = null
    try {
      const reply = await request(ensureSocket(), 'game:create', { ...options, name: playerName.value })
      if (!reply.ok) return { ok: false, error: reply.error }
      saveSeat(reply.state.id, reply.seat)
      gameId.value = reply.state.id
      seat.value = reply.seat
      game.value = null
      pendingMove.value = null
      apply(reply.state)
      return { ok: true, value: reply.state.id }
    } finally {
      busy.value = false
    }
  }

  /** Opens a game: reconnects to a saved seat, takes the free seat, or watches. */
  async function openGame(id: string): Promise<Result<true>> {
    if (gameId.value !== id) {
      gameId.value = id
      game.value = null
      seat.value = null
      pendingMove.value = null
    }
    error.value = null
    busy.value = true
    try {
      ensureSocket()
      await rejoin()
      return error.value ? { ok: false, error: error.value } : { ok: true, value: true }
    } finally {
      busy.value = false
    }
  }

  async function move(input: MoveInput): Promise<Result<RecordedMove>> {
    const state = game.value
    if (!state || !seat.value || !socket.value) return { ok: false, error: 'You are not playing in this game.' }
    if (!canMove.value) return { ok: false, error: 'It is not your turn.' }
    const legal = position.value.legalMoves.find(
      (m) => m.from === input.from && m.to === input.to && m.promotion === input.promotion,
    )
    if (!legal) return { ok: false, error: 'That move is not legal.' }
    pendingMove.value = legal
    const reply = await request(socket.value, 'game:move', {
      gameId: state.id,
      token: seat.value.token,
      moveId: newMoveId(),
      expectedRevision: state.revision,
      from: input.from,
      to: input.to,
      promotion: input.promotion,
    })
    pendingMove.value = null
    if (reply.ok) {
      apply(reply.state)
      return { ok: true, value: legal }
    }
    apply(reply.state)
    error.value = reply.error
    return { ok: false, error: reply.error }
  }

  async function seatAction(event: 'game:resign' | 'game:draw-offer'): Promise<Result<true>> {
    if (!game.value || !seat.value || !socket.value) return { ok: false, error: 'You are not playing in this game.' }
    const reply = await request(socket.value, event, { gameId: game.value.id, token: seat.value.token })
    apply(reply.state)
    if (!reply.ok) error.value = reply.error
    return reply.ok ? { ok: true, value: true } : { ok: false, error: reply.error }
  }

  const resign = () => seatAction('game:resign')
  /** Offers a draw, or accepts the opponent's pending offer. */
  const offerDraw = () => seatAction('game:draw-offer')

  async function respondToDraw(accept: boolean): Promise<Result<true>> {
    if (!game.value || !seat.value || !socket.value) return { ok: false, error: 'You are not playing in this game.' }
    const reply = await request(socket.value, 'game:draw-respond', {
      gameId: game.value.id,
      token: seat.value.token,
      accept,
    })
    apply(reply.state)
    if (!reply.ok) error.value = reply.error
    return reply.ok ? { ok: true, value: true } : { ok: false, error: reply.error }
  }

  function positionAt(ply: number): Position | null {
    const built = buildPosition(game.value?.initialFen ?? STARTING_FEN, moves.value.slice(0, ply), ONLINE_RULES)
    return built.ok ? built.value : null
  }

  /** Refreshes the clock display; the server decides when time runs out. */
  function tick(): void {
    now.value = performance.now()
  }

  function leave(): void {
    gameId.value = null
    game.value = null
    seat.value = null
    pendingMove.value = null
    error.value = null
  }

  function disconnect(): void {
    socket.value?.disconnect()
    socket.value = null
    connection.value = 'idle'
  }

  /** True when this browser holds a seat in the game (so it can rejoin without asking). */
  function hasSeat(id: string): boolean {
    return !!loadSeats()[id]
  }

  function dismissError(): void {
    error.value = null
  }

  return {
    connection,
    gameId,
    game,
    seat,
    pendingMove,
    error,
    busy,
    playerName,
    moves,
    position,
    myColor,
    isSpectator,
    isOver,
    canMove,
    clocks,
    captured,
    setName,
    createGame,
    openGame,
    move,
    resign,
    offerDraw,
    respondToDraw,
    positionAt,
    tick,
    leave,
    disconnect,
    dismissError,
    hasSeat,
  }
})
