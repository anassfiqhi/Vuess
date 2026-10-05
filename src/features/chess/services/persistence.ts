import { buildPosition, validateLine } from './chessRules'
import {
  CLAIM_REASONS,
  RULE_PRESETS,
  RULE_REASONS,
  claimedDrawOutcome,
  isRules,
  isRulesChoice,
  matchPreset,
  ruleOutcome,
} from './gameRules'
import { isSquare } from './squares'
import { readRaw, removeRaw, writeRaw } from './storage'
import {
  GAME_RECORD_VERSION,
  fail,
  ok,
  type ClockCheckpoint,
  type GameRecord,
  type Opponent,
  type Outcome,
  type RecordedMove,
  type Result,
} from '../types'

export const GAME_STORAGE_KEY = 'vuess.game'
export const CORRUPT_BACKUP_KEY = 'vuess.game.unreadable'

interface SavedGameEnvelope {
  version: typeof GAME_RECORD_VERSION
  savedAt: string
  game: GameRecord
}

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'loaded'; record: GameRecord }
  | { kind: 'error'; message: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isNonNegativeInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isColor = (v: unknown) => v === 'w' || v === 'b'

const PIECE_TYPES = ['p', 'n', 'b', 'r', 'q', 'k']
const PROMOTIONS = ['q', 'r', 'b', 'n']
const RESULTS = ['1-0', '0-1', '1/2-1/2']
const REASONS: readonly string[] = [
  ...RULE_REASONS,
  ...CLAIM_REASONS,
  'resignation',
  'agreement',
  'timeout',
  'timeout-vs-insufficient-material',
  'recorded-result',
]

function isOpponent(v: unknown): v is Opponent {
  if (!isObject(v)) return false
  if (v.kind === 'person') return true
  return v.kind === 'computer' && isColor(v.color) && Number.isInteger(v.level) && (v.level as number) >= 1 && (v.level as number) <= 8
}

function isMove(v: unknown): v is RecordedMove {
  return (
    isObject(v) &&
    isSquare(v.from) &&
    isSquare(v.to) &&
    typeof v.san === 'string' &&
    isColor(v.color) &&
    PIECE_TYPES.includes(v.piece as string) &&
    (v.promotion === undefined || PROMOTIONS.includes(v.promotion as string)) &&
    (v.captured === undefined || PIECE_TYPES.includes(v.captured as string))
  )
}

function isCheckpoint(v: unknown): v is ClockCheckpoint {
  return isObject(v) && isFiniteNumber(v.w) && isFiniteNumber(v.b)
}

function isOutcome(v: unknown): v is Outcome {
  return (
    isObject(v) &&
    RESULTS.includes(v.result as string) &&
    (v.winner === null || isColor(v.winner)) &&
    REASONS.includes(v.reason as string)
  )
}

/** Structural and chess validation for a record from storage or another untrusted source. */
export function validateRecord(value: unknown): Result<GameRecord> {
  if (!isObject(value)) return fail('The saved game is not in a readable format.')
  if (value.version !== GAME_RECORD_VERSION) {
    return fail(`The saved game uses an unsupported format (version ${String(value.version)}).`)
  }
  const r = value as Partial<GameRecord>
  const tc = r.timeControl
  const shapeOk =
    typeof r.id === 'string' &&
    typeof r.createdAt === 'string' &&
    isNonNegativeInt(r.revision) &&
    (r.source === 'local' || r.source === 'pgn-import') &&
    typeof r.initialFen === 'string' &&
    Array.isArray(r.moves) &&
    r.moves.every(isMove) &&
    isNonNegativeInt(r.cursor) &&
    r.cursor <= r.moves.length &&
    isObject(r.players) &&
    isObject(r.players.w) &&
    typeof r.players.w.name === 'string' &&
    isObject(r.players.b) &&
    typeof r.players.b.name === 'string' &&
    (tc === null ||
      (isObject(tc) && isFiniteNumber(tc.initialMs) && tc.initialMs > 0 && isFiniteNumber(tc.incrementMs) && tc.incrementMs >= 0)) &&
    Array.isArray(r.clocks) &&
    r.clocks.length === r.moves.length + 1 &&
    r.clocks.every(isCheckpoint) &&
    isFiniteNumber(r.turnElapsedMs) &&
    r.turnElapsedMs >= 0 &&
    isRules(r.rules) &&
    isRulesChoice(r.rulesChoice) &&
    isOpponent(r.opponent) &&
    (r.finalClock === null || isCheckpoint(r.finalClock)) &&
    (r.outcome === null || isOutcome(r.outcome))
  if (!shapeOk) return fail('The saved game is missing information or contains invalid values.')
  const record = r as GameRecord

  const line = validateLine(record.initialFen, record.moves, record.rules)
  if (!line.ok) return fail(`The saved moves are not valid: ${line.error}`)

  const position = buildPosition(record.initialFen, record.moves.slice(0, record.cursor), record.rules)
  if (!position.ok) return fail(position.error)
  const derived = ruleOutcome(position.value, record.rules)
  const outcome = record.outcome
  if (outcome && RULE_REASONS.includes(outcome.reason)) {
    if (derived?.reason !== outcome.reason || derived.result !== outcome.result) {
      return fail('The saved result does not match the saved position.')
    }
  } else if (outcome && CLAIM_REASONS.includes(outcome.reason)) {
    if (claimedDrawOutcome(position.value)?.reason !== outcome.reason) {
      return fail('The saved draw claim is not valid in the saved position.')
    }
  } else if (!outcome && derived) {
    return fail('The saved game should have ended but has no result.')
  }
  return ok(record)
}

export function saveGame(record: GameRecord): Result<true> {
  const envelope: SavedGameEnvelope = {
    version: GAME_RECORD_VERSION,
    savedAt: new Date().toISOString(),
    game: record,
  }
  return writeRaw(GAME_STORAGE_KEY, JSON.stringify(envelope))
}

export function loadGame(): LoadResult {
  const raw = readRaw(GAME_STORAGE_KEY)
  if (!raw.ok) return { kind: 'error', message: raw.error }
  if (raw.value === null) return { kind: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.value)
  } catch {
    return { kind: 'error', message: 'The saved game data is damaged and could not be read.' }
  }
  if (!isObject(parsed) || !(typeof parsed.version === 'number' && parsed.version >= 1 && parsed.version <= GAME_RECORD_VERSION)) {
    const version = isObject(parsed) ? String(parsed.version) : 'unknown'
    return { kind: 'error', message: `The saved game uses an unsupported format (version ${version}).` }
  }
  const record = validateRecord(migrate(parsed.game))
  return record.ok ? { kind: 'loaded', record: record.value } : { kind: 'error', message: record.error }
}

/**
 * Upgrades older saves step by step:
 * v1 → v2 added per-game rules (old games behaved like Casual);
 * v2 → v3 added the en passant rule (always allowed before);
 * v3 → v4 records which rule set was chosen (inferred from the rules);
 * v4 → v5 records the opponent (every earlier game was played in person).
 */
function migrate(game: unknown): unknown {
  if (!isObject(game)) return game
  let current: Record<string, unknown> = game
  if (current.version === 1) current = { ...current, version: 2, rules: { ...RULE_PRESETS.casual.rules } }
  if (current.version === 2 && isObject(current.rules)) {
    current = { ...current, version: 3, rules: { ...current.rules, enPassant: true } }
  }
  if (current.version === 3 && isRules(current.rules)) {
    current = { ...current, version: 4, rulesChoice: matchPreset(current.rules) ?? 'custom' }
  }
  if (current.version === 4) current = { ...current, version: 5, opponent: { kind: 'person' } }
  return current
}

/** Keeps a copy of unreadable data so a fresh start does not silently destroy it. */
export function backupUnreadableGame(): void {
  const raw = readRaw(GAME_STORAGE_KEY)
  if (raw.ok && raw.value !== null) writeRaw(CORRUPT_BACKUP_KEY, raw.value)
  removeRaw(GAME_STORAGE_KEY)
}
