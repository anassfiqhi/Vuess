/**
 * Outcome policy and rule presets. The rules adapter reports facts about a
 * position (checkmate, a claimable draw, a forced draw); this module decides
 * what those facts mean for a game played under a given set of rules.
 */
import type { ClaimableDraw, GameRules, Outcome, OutcomeReason, Position, RulesChoice, RulesPreset } from '../types'

export const RULE_PRESETS: Record<RulesPreset, { label: string; description: string; rules: GameRules }> = {
  chesscom: {
    label: 'Chess.com style',
    description: 'Like a Chess.com Live game: no takebacks, move hints on, draws by repetition or fifty moves are automatic.',
    rules: {
      enPassant: true,
      takebacks: false,
      showLegalMoves: true,
      highlightLastMove: true,
      checkWarning: true,
      showMaterial: true,
      drawClaims: 'automatic',
      autoQueen: false,
      rotateBoard: false,
    },
  },
  beginner: {
    label: 'Beginner',
    description: 'Every hint on, takebacks allowed, pawns promote to a queen automatically.',
    rules: {
      enPassant: true,
      takebacks: true,
      showLegalMoves: true,
      highlightLastMove: true,
      checkWarning: true,
      showMaterial: true,
      drawClaims: 'automatic',
      autoQueen: true,
      rotateBoard: false,
    },
  },
  casual: {
    label: 'Casual',
    description: 'Hints and takebacks on; repetition and fifty-move draws end the game automatically.',
    rules: {
      enPassant: true,
      takebacks: true,
      showLegalMoves: true,
      highlightLastMove: true,
      checkWarning: true,
      showMaterial: true,
      drawClaims: 'automatic',
      autoQueen: false,
      rotateBoard: false,
    },
  },
  strict: {
    label: 'Strict',
    description: 'No takebacks or move hints; repetition and fifty-move draws must be claimed.',
    rules: {
      enPassant: true,
      takebacks: false,
      showLegalMoves: false,
      highlightLastMove: true,
      checkWarning: false,
      showMaterial: true,
      drawClaims: 'claim',
      autoQueen: false,
      rotateBoard: false,
    },
  },
}

/** New games start with Chess.com-style rules; the others are listed for players who want them. */
export const DEFAULT_PRESET: RulesPreset = 'chesscom'
export const DEFAULT_RULES: Readonly<GameRules> = RULE_PRESETS[DEFAULT_PRESET].rules

export type RuleGroup = 'chess' | 'helper'

export const RULE_OPTIONS: {
  key: Exclude<keyof GameRules, 'drawClaims'>
  label: string
  hint: string
  group: RuleGroup
}[] = [
  {
    key: 'enPassant',
    label: 'En passant',
    hint: 'A pawn that moves two squares can be captured by an enemy pawn beside it',
    group: 'chess',
  },
  { key: 'takebacks', label: 'Allow takebacks', hint: 'Undo and redo moves', group: 'helper' },
  { key: 'showLegalMoves', label: 'Show legal moves', hint: 'Dots and rings on reachable squares', group: 'helper' },
  { key: 'highlightLastMove', label: 'Highlight last move', hint: 'Mark the squares of the previous move', group: 'helper' },
  { key: 'checkWarning', label: 'Warn about check', hint: 'Say “check!” in the status and play the check sound', group: 'helper' },
  { key: 'showMaterial', label: 'Show captured pieces', hint: 'Captured pieces and material lead next to each player', group: 'helper' },
  { key: 'autoQueen', label: 'Promote to queen automatically', hint: 'Skip the promotion choice (no underpromotion)', group: 'helper' },
  { key: 'rotateBoard', label: 'Rotate board each turn', hint: 'The side to move is always at the bottom', group: 'helper' },
]

/** The preset these rules match exactly, or null for a custom combination. */
export function matchPreset(rules: GameRules): RulesPreset | null {
  const keys = Object.keys(DEFAULT_RULES) as (keyof GameRules)[]
  for (const [id, preset] of Object.entries(RULE_PRESETS) as [RulesPreset, (typeof RULE_PRESETS)[RulesPreset]][]) {
    if (keys.every((k) => preset.rules[k] === rules[k])) return id
  }
  return null
}

export const CUSTOM_RULES_INFO = {
  label: 'Customized rules',
  description: 'Your own rule set: choose each option yourself. It is remembered for your next game.',
}

export const RULES_CHOICES: readonly RulesChoice[] = [...(Object.keys(RULE_PRESETS) as RulesPreset[]), 'custom']

export function isRulesChoice(value: unknown): value is RulesChoice {
  return RULES_CHOICES.includes(value as RulesChoice)
}

export function rulesLabel(choice: RulesChoice): string {
  return choice === 'custom' ? CUSTOM_RULES_INFO.label : RULE_PRESETS[choice].label
}

export function isRules(value: unknown): value is GameRules {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    RULE_OPTIONS.every((o) => typeof v[o.key] === 'boolean') && (v.drawClaims === 'automatic' || v.drawClaims === 'claim')
  )
}

const draw = (reason: OutcomeReason): Outcome => ({ result: '1/2-1/2', winner: null, reason })

/** Endings that follow from the position under these rules. */
export function ruleOutcome(position: Position, rules: Pick<GameRules, 'drawClaims'>): Outcome | null {
  if (position.terminal) return position.terminal
  if (position.forcedDraw) return draw(position.forcedDraw)
  if (rules.drawClaims === 'automatic' && position.drawClaim) return draw(position.drawClaim)
  return null
}

const CLAIM_REASON: Record<ClaimableDraw, OutcomeReason> = {
  'threefold-repetition': 'claimed-threefold-repetition',
  'fifty-move-rule': 'claimed-fifty-move-rule',
}

export function claimedDrawOutcome(position: Position): Outcome | null {
  return position.drawClaim ? draw(CLAIM_REASON[position.drawClaim]) : null
}

/** Outcomes derived from the position; they are cleared by undo and recomputed on redo. */
export const RULE_REASONS: readonly OutcomeReason[] = [
  'checkmate',
  'stalemate',
  'insufficient-material',
  'threefold-repetition',
  'fifty-move-rule',
  'fivefold-repetition',
  'seventy-five-move-rule',
]

export const CLAIM_REASONS: readonly OutcomeReason[] = Object.values(CLAIM_REASON)

export const isRuleOutcome = (o: Outcome | null) => o !== null && RULE_REASONS.includes(o.reason)
