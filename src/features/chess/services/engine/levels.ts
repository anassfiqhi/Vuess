import type { EngineLevel } from '../../types'

export interface EngineLevelSettings {
  level: EngineLevel
  label: string
  /** Stockfish "Skill Level" (0-20); lower levels also play deliberate inaccuracies. */
  skill: number
  /** Search depth limit in plies. */
  depth: number
  /** Upper bound on thinking time so low levels still answer quickly. */
  movetimeMs: number
}

export const ENGINE_LEVELS: readonly EngineLevelSettings[] = [
  { level: 1, label: 'Newcomer', skill: 0, depth: 1, movetimeMs: 100 },
  { level: 2, label: 'Novice', skill: 3, depth: 2, movetimeMs: 150 },
  { level: 3, label: 'Easy', skill: 6, depth: 4, movetimeMs: 250 },
  { level: 4, label: 'Intermediate', skill: 9, depth: 6, movetimeMs: 400 },
  { level: 5, label: 'Club', skill: 12, depth: 8, movetimeMs: 600 },
  { level: 6, label: 'Advanced', skill: 15, depth: 11, movetimeMs: 900 },
  { level: 7, label: 'Expert', skill: 18, depth: 14, movetimeMs: 1300 },
  { level: 8, label: 'Master', skill: 20, depth: 18, movetimeMs: 2000 },
]

export const DEFAULT_ENGINE_LEVEL: EngineLevel = 3

export function engineLevel(level: EngineLevel): EngineLevelSettings {
  return ENGINE_LEVELS[level - 1]!
}

export const COMPUTER_NAME = 'Stockfish'

export function computerPlayerName(level: EngineLevel): string {
  return `${COMPUTER_NAME} · Level ${level}`
}
