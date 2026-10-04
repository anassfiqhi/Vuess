/**
 * Application-owned rules adapter. This is the only module that imports
 * chess.js; the rest of the app works with the plain types in `../types`.
 */
import { Chess, DEFAULT_POSITION, validateFen, type Move } from 'chess.js'
import {
  fail,
  ok,
  type GameResult,
  type MoveInput,
  type Outcome,
  type Piece,
  type PieceColor,
  type PlayerInfo,
  type Position,
  type PromotionPiece,
  type RecordedMove,
  type Result,
  type Square,
} from '../types'

export const STARTING_FEN = DEFAULT_POSITION

export function checkFen(fen: string): Result<string> {
  const check = validateFen(fen)
  return check.ok ? ok(fen) : fail(`Invalid starting position: ${check.error ?? 'unknown error'}`)
}

function toRecorded(move: Move): RecordedMove {
  const recorded: RecordedMove = {
    from: move.from,
    to: move.to,
    san: move.san,
    color: move.color,
    piece: move.piece,
  }
  if (move.promotion) recorded.promotion = move.promotion as PromotionPiece
  if (move.captured) recorded.captured = move.captured
  if (move.isKingsideCastle()) recorded.castle = 'kingside'
  if (move.isQueensideCastle()) recorded.castle = 'queenside'
  if (move.isEnPassant()) recorded.enPassant = true
  return recorded
}

/** Rule variations that change which moves are legal. */
export interface MoveRules {
  enPassant: boolean
}

export const STANDARD_MOVE_RULES: Readonly<MoveRules> = { enPassant: true }

const allowed = (move: Move, rules: MoveRules) => rules.enPassant || !move.isEnPassant()

/** chess.js move generation filtered by the game's move rules. */
function legalMovesOf(chess: Chess, rules: MoveRules, square?: Square): Move[] {
  const moves = square ? chess.moves({ square, verbose: true }) : chess.moves({ verbose: true })
  return moves.filter((m) => allowed(m, rules))
}

/**
 * Position identity for repetition: placement, side to move, castling rights
 * and en passant square. chess.js only writes the en passant square when a
 * capture is possible; with en passant disabled it never matters, so it is dropped.
 */
function repetitionKey(chess: Chess, rules: MoveRules): string {
  const fields = chess.fen().split(' ').slice(0, 4)
  if (!rules.enPassant) fields[3] = '-'
  return fields.join(' ')
}

/**
 * Replays moves from the initial position and counts how often the final
 * position has occurred. Replaying (rather than loading the last FEN) keeps
 * the history that repetition rules need.
 */
function replay(
  initialFen: string,
  moves: readonly MoveInput[],
  rules: MoveRules,
): Result<{ chess: Chess; repetitions: number }> {
  const fenCheck = checkFen(initialFen)
  if (!fenCheck.ok) return fail(fenCheck.error)
  const chess = new Chess(initialFen)
  const seen = new Map<string, number>([[repetitionKey(chess, rules), 1]])
  for (const [index, input] of moves.entries()) {
    const legal = findLegal(chess, input, rules)
    if (!legal) return fail(`Move ${index + 1} (${input.from}-${input.to}) is not legal in this game.`)
    chess.move({ from: legal.from, to: legal.to, promotion: legal.promotion })
    const key = repetitionKey(chess, rules)
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return ok({ chess, repetitions: seen.get(repetitionKey(chess, rules)) ?? 1 })
}

function findLegal(chess: Chess, input: MoveInput, rules: MoveRules): Move | undefined {
  return legalMovesOf(chess, rules, input.from).find(
    (m) => m.to === input.to && (m.promotion ?? undefined) === (input.promotion ?? undefined),
  )
}

/**
 * Checkmate and stalemate are decided from the filtered move list, so a
 * position whose only legal reply is a disabled en passant capture ends here.
 */
function terminalOutcome(chess: Chess, legalMoveCount: number): Outcome | null {
  if (legalMoveCount === 0) {
    if (chess.inCheck()) {
      const winner: PieceColor = chess.turn() === 'w' ? 'b' : 'w'
      return { result: winner === 'w' ? '1-0' : '0-1', winner, reason: 'checkmate' }
    }
    return { result: '1/2-1/2', winner: null, reason: 'stalemate' }
  }
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', winner: null, reason: 'insufficient-material' }
  return null
}

const halfmoveClock = (chess: Chess) => Number(chess.fen().split(' ')[4]) || 0

function readPosition(chess: Chess, repetitions: number, rules: MoveRules): Position {
  const pieces: Partial<Record<Square, Piece>> = {}
  let checkedKing: Square | null = null
  const inCheck = chess.inCheck()
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue
      pieces[cell.square] = { color: cell.color, type: cell.type }
      if (inCheck && cell.type === 'k' && cell.color === chess.turn()) checkedKing = cell.square
    }
  }
  const history = chess.history({ verbose: true })
  const last = history[history.length - 1]
  const legalMoves = legalMovesOf(chess, rules).map(toRecorded)
  return {
    fen: chess.fen(),
    turn: chess.turn(),
    pieces,
    inCheck,
    checkedKing,
    legalMoves,
    lastMove: last ? toRecorded(last) : null,
    terminal: terminalOutcome(chess, legalMoves.length),
    drawClaim: repetitions >= 3 ? 'threefold-repetition' : chess.isDrawByFiftyMoves() ? 'fifty-move-rule' : null,
    forcedDraw: repetitions >= 5 ? 'fivefold-repetition' : halfmoveClock(chess) >= 150 ? 'seventy-five-move-rule' : null,
  }
}

export function buildPosition(
  initialFen: string,
  moves: readonly MoveInput[],
  rules: MoveRules = STANDARD_MOVE_RULES,
): Result<Position> {
  const replayed = replay(initialFen, moves, rules)
  return replayed.ok
    ? ok(readPosition(replayed.value.chess, replayed.value.repetitions, rules))
    : fail(replayed.error)
}

/**
 * Checks that every move in a stored line is legal under the game's rules and
 * that its cached SAN matches, so tampered or stale saves are rejected rather
 * than half-loaded.
 */
export function validateLine(
  initialFen: string,
  moves: readonly RecordedMove[],
  rules: MoveRules = STANDARD_MOVE_RULES,
): Result<true> {
  const replayed = replay(initialFen, [], rules)
  if (!replayed.ok) return fail(replayed.error)
  const chess = replayed.value.chess
  for (const [index, move] of moves.entries()) {
    const legal = findLegal(chess, move, rules)
    if (!legal || legal.san !== move.san) return fail(`Move ${index + 1} does not match the rules.`)
    chess.move({ from: legal.from, to: legal.to, promotion: legal.promotion })
  }
  return ok(true)
}

/** True when the side has only a king, or a king and one minor piece. */
export function lacksMatingMaterial(pieces: Position['pieces'], color: PieceColor): boolean {
  const own = Object.values(pieces).filter((p) => p.color === color && p.type !== 'k')
  if (own.length === 0) return true
  return own.length === 1 && (own[0]!.type === 'n' || own[0]!.type === 'b')
}

const TERMINATION: Record<Outcome['reason'], string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  'insufficient-material': 'Insufficient material',
  'threefold-repetition': 'Threefold repetition',
  'fifty-move-rule': 'Fifty-move rule',
  resignation: 'Resignation',
  agreement: 'Draw by agreement',
  timeout: 'Time forfeit',
  'timeout-vs-insufficient-material': 'Time forfeit (insufficient material)',
  'recorded-result': 'Recorded result',
  'fivefold-repetition': 'Fivefold repetition',
  'seventy-five-move-rule': '75-move rule',
  'claimed-threefold-repetition': 'Threefold repetition (claimed)',
  'claimed-fifty-move-rule': 'Fifty-move rule (claimed)',
}

export interface PgnExportInput {
  initialFen: string
  moves: readonly MoveInput[]
  players: Record<PieceColor, PlayerInfo>
  outcome: Outcome | null
  date: Date
  timeControl: { initialMs: number; incrementMs: number } | null
  moveRules?: MoveRules
}

const pad = (n: number) => String(n).padStart(2, '0')

export function exportPgn(input: PgnExportInput): Result<string> {
  const rules = input.moveRules ?? STANDARD_MOVE_RULES
  const replayed = replay(input.initialFen, input.moves, rules)
  if (!replayed.ok) return fail(replayed.error)
  const game = replayed.value.chess
  const d = input.date
  game.setHeader('Event', 'Casual game')
  game.setHeader('Site', 'Vuess')
  game.setHeader('Date', `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`)
  game.setHeader('White', input.players.w.name || 'White')
  game.setHeader('Black', input.players.b.name || 'Black')
  game.setHeader('Result', input.outcome?.result ?? '*')
  game.setHeader(
    'TimeControl',
    input.timeControl
      ? `${Math.round(input.timeControl.initialMs / 1000)}+${Math.round(input.timeControl.incrementMs / 1000)}`
      : '-',
  )
  if (input.outcome) game.setHeader('Termination', TERMINATION[input.outcome.reason])
  // Not a standard tag value, but tells readers the result followed a rule variation.
  if (!rules.enPassant) game.setHeader('Variant', 'No en passant')
  return ok(game.pgn())
}

export interface ParsedPgn {
  initialFen: string
  moves: RecordedMove[]
  players: Record<PieceColor, PlayerInfo>
  /** The PGN's Result tag when it records a finished game. */
  recordedResult: GameResult | null
}

const MAX_PGN_LENGTH = 200_000

export function parsePgn(text: string): Result<ParsedPgn> {
  const trimmed = text.trim()
  if (!trimmed) return fail('Paste or choose a PGN file first.')
  if (trimmed.length > MAX_PGN_LENGTH) return fail('That PGN is too large to import.')
  // Only the first game of a multi-game file is imported.
  const firstGame = trimmed.split(/\n\s*\n(?=\[Event )/)[0] ?? trimmed
  const chess = new Chess()
  try {
    chess.loadPgn(firstGame, { strict: false })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return fail(`This PGN could not be read: ${detail}`)
  }
  const headers = chess.getHeaders()
  const initialFen = headers.SetUp === '1' && headers.FEN ? headers.FEN : STARTING_FEN
  const fenCheck = checkFen(initialFen)
  if (!fenCheck.ok) return fail(fenCheck.error)
  const result = headers.Result
  const recordedResult: GameResult | null =
    result === '1-0' || result === '0-1' || result === '1/2-1/2' ? result : null
  const isTag = (v: string | undefined) => (v && v !== '?' ? v : '')
  return ok({
    initialFen,
    moves: chess.history({ verbose: true }).map(toRecorded),
    players: { w: { name: isTag(headers.White) }, b: { name: isTag(headers.Black) } },
    recordedResult,
  })
}
