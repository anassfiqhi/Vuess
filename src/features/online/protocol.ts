/**
 * Types for the vuess-server Socket.IO protocol. Copied from
 * vuess-server/src/protocol.ts (types only; the server validates requests).
 * Keep the two in sync.
 */
import type { Outcome, PieceColor, PromotionPiece, RecordedMove, TimeControl } from '@/features/chess/types'

export type GameStatus = 'waiting' | 'active' | 'ended'

export interface PlayerState {
  name: string
  joined: boolean
  connected: boolean
}

export interface ClockState {
  remainingMs: Record<PieceColor, number>
  running: PieceColor | null
}

export interface GameState {
  id: string
  revision: number
  status: GameStatus
  initialFen: string
  moves: RecordedMove[]
  players: Record<PieceColor, PlayerState>
  timeControl: TimeControl | null
  clock: ClockState | null
  outcome: Outcome | null
  drawOffer: PieceColor | null
}

export type Ack<T> = ({ ok: true } & T) | { ok: false; error: string; state?: GameState }

export interface Seat {
  color: PieceColor
  token: string
}

export interface CreateRequest {
  name: string
  color: PieceColor | 'random'
  timeControl: TimeControl | null
}
export interface JoinRequest {
  gameId: string
  name: string
  token?: string
}
export interface SeatRequest {
  gameId: string
  token: string
}
export interface MoveRequest extends SeatRequest {
  moveId: string
  expectedRevision: number
  from: string
  to: string
  promotion?: PromotionPiece
}
export interface DrawResponseRequest extends SeatRequest {
  accept: boolean
}
export interface SyncRequest {
  gameId: string
}

type Reply<T = object> = (response: Ack<T>) => void
type StateReply = Reply<{ state: GameState }>

export interface ClientToServerEvents {
  'game:create': (request: CreateRequest, reply: Reply<{ seat: Seat; state: GameState }>) => void
  'game:join': (request: JoinRequest, reply: Reply<{ seat: Seat | null; state: GameState }>) => void
  'game:move': (request: MoveRequest, reply: StateReply) => void
  'game:resign': (request: SeatRequest, reply: StateReply) => void
  'game:draw-offer': (request: SeatRequest, reply: StateReply) => void
  'game:draw-respond': (request: DrawResponseRequest, reply: StateReply) => void
  'game:sync': (request: SyncRequest, reply: StateReply) => void
}

export interface ServerToClientEvents {
  'game:state': (state: GameState) => void
}
