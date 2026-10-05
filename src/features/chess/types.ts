export type File = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'
export type Rank = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'
export type Square = `${File}${Rank}`

export type PieceColor = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

export interface Piece {
  color: PieceColor
  type: PieceType
}

/** A request to move; may be illegal until validated by the rules adapter. */
export interface MoveInput {
  from: Square
  to: Square
  promotion?: PromotionPiece
}

/** A validated move, stored as plain data in the game record. */
export interface RecordedMove {
  from: Square
  to: Square
  promotion?: PromotionPiece
  san: string
  color: PieceColor
  piece: PieceType
  captured?: PieceType
  castle?: 'kingside' | 'queenside'
  enPassant?: true
}

export type LegalMove = RecordedMove

export type GameResult = '1-0' | '0-1' | '1/2-1/2'

/** Draws a player may claim; whether they end the game automatically depends on the game's rules. */
export type ClaimableDraw = 'threefold-repetition' | 'fifty-move-rule'
/** Draws that always end the game, whatever the rules. */
export type ForcedDraw = 'fivefold-repetition' | 'seventy-five-move-rule'

/** Endings derived from the position (they are recomputed, and undone with the move). */
export type RuleOutcomeReason = 'checkmate' | 'stalemate' | 'insufficient-material' | ClaimableDraw | ForcedDraw

export type ExplicitOutcomeReason =
  | 'resignation'
  | 'agreement'
  | 'timeout'
  | 'timeout-vs-insufficient-material'
  | 'recorded-result'
  | 'claimed-threefold-repetition'
  | 'claimed-fifty-move-rule'

export type OutcomeReason = RuleOutcomeReason | ExplicitOutcomeReason

export interface Outcome {
  result: GameResult
  winner: PieceColor | null
  reason: OutcomeReason
}

export interface PlayerInfo {
  name: string
}

export interface TimeControl {
  initialMs: number
  incrementMs: number
}

/** Remaining time for both sides at a checkpoint. */
export interface ClockCheckpoint {
  w: number
  b: number
}

export type GameSource = 'local' | 'pgn-import'

export type RulesPreset = 'beginner' | 'casual' | 'chesscom' | 'strict'
/** The rule set a player picked: a preset, or their own customized rules. */
export type RulesChoice = RulesPreset | 'custom'

/** Per-game rules and assists. Fixed when the game starts and saved with it. */
export interface GameRules {
  /** Chess rule: whether en passant captures are legal. */
  enPassant: boolean
  takebacks: boolean
  showLegalMoves: boolean
  highlightLastMove: boolean
  checkWarning: boolean
  showMaterial: boolean
  drawClaims: 'automatic' | 'claim'
  autoQueen: boolean
  rotateBoard: boolean
}

/** Engine strength from 1 (weakest) to 8 (strongest). */
export type EngineLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/** Who plays the other side of a local game. */
export type Opponent = { kind: 'person' } | { kind: 'computer'; color: PieceColor; level: EngineLevel }

export const GAME_RECORD_VERSION = 5

/**
 * The authoritative, serializable game. Everything visible on the board is
 * derived by replaying `moves.slice(0, cursor)` from `initialFen`.
 */
export interface GameRecord {
  version: typeof GAME_RECORD_VERSION
  id: string
  createdAt: string
  /** Bumped on every accepted change; lets async work (AI, network) detect staleness. */
  revision: number
  source: GameSource
  initialFen: string
  /** Full line including any undone moves that can still be redone. */
  moves: RecordedMove[]
  /** Number of moves currently applied. Moves after the cursor form the redo stack. */
  cursor: number
  players: Record<PieceColor, PlayerInfo>
  timeControl: TimeControl | null
  /** Which rule set was chosen; shown as the game's rules name. */
  rulesChoice: RulesChoice
  rules: GameRules
  opponent: Opponent
  /** `clocks[i]` is the remaining time after `i` moves; length is `moves.length + 1`. */
  clocks: ClockCheckpoint[]
  /**
   * Time already spent by the side to move in the current turn when the clock
   * was last paused or snapshotted. Only meaningful for timed games.
   */
  turnElapsedMs: number
  /** Frozen remaining time once a timed game has ended. */
  finalClock: ClockCheckpoint | null
  outcome: Outcome | null
}

export interface Position {
  fen: string
  turn: PieceColor
  pieces: Partial<Record<Square, Piece>>
  inCheck: boolean
  checkedKing: Square | null
  legalMoves: LegalMove[]
  lastMove: RecordedMove | null
  /** Checkmate, stalemate or insufficient material. */
  terminal: Outcome | null
  /** A draw that is available to claim in this position. */
  drawClaim: ClaimableDraw | null
  /** A draw that ends the game regardless of rules. */
  forcedDraw: ForcedDraw | null
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const fail = <T = never>(error: string): Result<T> => ({ ok: false, error })
