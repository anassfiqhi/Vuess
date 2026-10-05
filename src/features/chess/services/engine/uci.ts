/** Pure helpers for talking UCI (the standard chess engine protocol). */
import { isSquare } from '../squares'
import type { MoveInput, PromotionPiece } from '../../types'
import type { EngineLevelSettings } from './levels'

export function toUci(move: MoveInput): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

export function positionCommand(initialFen: string, moves: readonly MoveInput[]): string {
  const list = moves.map(toUci).join(' ')
  return list ? `position fen ${initialFen} moves ${list}` : `position fen ${initialFen}`
}

export function searchCommands(settings: EngineLevelSettings): string[] {
  return [
    `setoption name Skill Level value ${settings.skill}`,
    `go depth ${settings.depth} movetime ${settings.movetimeMs}`,
  ]
}

/** Parses "bestmove e7e8q ponder ..." into a move, or null for "bestmove (none)" and other lines. */
export function parseBestMove(line: string): MoveInput | null {
  const match = /^bestmove\s+([a-h][1-8])([a-h][1-8])([qrbn])?/.exec(line.trim())
  if (!match) return null
  const [, from, to, promotion] = match
  if (!isSquare(from) || !isSquare(to)) return null
  const move: MoveInput = { from, to }
  if (promotion) move.promotion = promotion as PromotionPiece
  return move
}

export const isBestMoveLine = (line: string) => line.startsWith('bestmove')
