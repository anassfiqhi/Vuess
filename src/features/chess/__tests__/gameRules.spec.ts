import { describe, expect, it } from 'vitest'
import { STARTING_FEN, buildPosition } from '../services/chessRules'
import { RULES_CHOICES, RULE_PRESETS, isRules, isRulesChoice, matchPreset, ruleOutcome, rulesLabel } from '../services/gameRules'
import { mv } from './helpers'

describe('rule presets', () => {
  it('recognises presets and reports custom combinations', () => {
    expect(matchPreset(RULE_PRESETS.strict.rules)).toBe('strict')
    const custom = { ...RULE_PRESETS.casual.rules, rotateBoard: true }
    expect(matchPreset(custom)).toBeNull()
    expect(rulesLabel('custom')).toBe('Customized rules')
    expect(rulesLabel('beginner')).toBe('Beginner')
    expect(rulesLabel('chesscom')).toBe('Chess.com style')
    expect(matchPreset({ ...RULE_PRESETS.casual.rules, enPassant: false })).toBeNull()
  })

  it('lists the presets first, then Customized rules as its own choice', () => {
    expect(RULES_CHOICES).toEqual(['chesscom', 'beginner', 'casual', 'strict', 'custom'])
    expect(isRulesChoice('custom')).toBe(true)
    expect(isRulesChoice('tournament')).toBe(false)
  })

  it('validates rule objects', () => {
    expect(isRules(RULE_PRESETS.casual.rules)).toBe(true)
    expect(isRules({ ...RULE_PRESETS.casual.rules, takebacks: 'yes' })).toBe(false)
    expect(isRules(null)).toBe(false)
  })

  it('applies the draw policy separately from the position facts', () => {
    const moves = Array.from({ length: 2 }, () => ['g1f3', 'g8f6', 'f3g1', 'f6g8']).flat().map(mv)
    const built = buildPosition(STARTING_FEN, moves)
    if (!built.ok) throw new Error(built.error)
    expect(ruleOutcome(built.value, { drawClaims: 'automatic' })?.reason).toBe('threefold-repetition')
    expect(ruleOutcome(built.value, { drawClaims: 'claim' })).toBeNull()
  })
})
