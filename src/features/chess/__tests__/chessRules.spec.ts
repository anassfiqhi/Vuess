import { describe, expect, it } from 'vitest'
import { STARTING_FEN, buildPosition, exportPgn, lacksMatingMaterial, parsePgn, validateLine } from '../services/chessRules'
import { mv } from './helpers'

const build = (fen: string, moves: string[]) => {
  const result = buildPosition(fen, moves.map(mv))
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('chessRules adapter', () => {
  it('derives the starting position', () => {
    const p = build(STARTING_FEN, [])
    expect(p.turn).toBe('w')
    expect(p.pieces.e1).toEqual({ color: 'w', type: 'k' })
    expect(p.legalMoves).toHaveLength(20)
    expect(p.terminal).toBeNull()
    expect(p.drawClaim).toBeNull()
    expect(p.forcedDraw).toBeNull()
  })

  it('rejects a replay containing an illegal move', () => {
    const result = buildPosition(STARTING_FEN, [mv('e2e4'), mv('e2e5')])
    expect(result.ok).toBe(false)
  })

  it('records castling metadata and moves the rook', () => {
    const p = build('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['e1g1', 'e8c8'])
    expect(p.pieces.g1?.type).toBe('k')
    expect(p.pieces.f1).toEqual({ color: 'w', type: 'r' })
    expect(p.pieces.h1).toBeUndefined()
    expect(p.pieces.d8).toEqual({ color: 'b', type: 'r' })
    expect(p.pieces.a8).toBeUndefined()
    expect(p.lastMove?.castle).toBe('queenside')
  })

  it('removes the captured pawn on en passant', () => {
    const p = build(STARTING_FEN, ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6'])
    expect(p.pieces.d5).toBeUndefined()
    expect(p.pieces.d6).toEqual({ color: 'w', type: 'p' })
    expect(p.lastMove).toMatchObject({ enPassant: true, captured: 'p', san: 'exd6' })
  })

  it('detects checkmate with the correct winner', () => {
    const p = build(STARTING_FEN, ['f2f3', 'e7e5', 'g2g4', 'd8h4'])
    expect(p.inCheck).toBe(true)
    expect(p.checkedKing).toBe('e1')
    expect(p.terminal).toEqual({ result: '0-1', winner: 'b', reason: 'checkmate' })
  })

  it('detects stalemate and insufficient material as terminal draws', () => {
    expect(build('k7/8/1Q6/8/8/8/8/7K w - - 0 1', ['b6c7']).terminal?.reason).toBe('stalemate')
    expect(build('k7/8/8/8/8/8/1q6/K7 w - - 0 1', ['a1b2']).terminal?.reason).toBe('insufficient-material')
  })

  const shuffle = (times: number) =>
    Array.from({ length: times }, () => ['g1f3', 'g8f6', 'f3g1', 'f6g8']).flat()

  it('reports threefold repetition as claimable and fivefold as forced', () => {
    const threefold = build(STARTING_FEN, shuffle(2))
    expect(threefold.drawClaim).toBe('threefold-repetition')
    expect(threefold.forcedDraw).toBeNull()
    expect(build(STARTING_FEN, shuffle(4)).forcedDraw).toBe('fivefold-repetition')
  })

  it('reports the fifty-move rule as claimable and the 75-move rule as forced', () => {
    expect(build('k7/8/8/8/8/8/8/K6R w - - 99 80', ['h1h2']).drawClaim).toBe('fifty-move-rule')
    expect(build('k7/8/8/8/8/8/8/K6R w - - 149 100', ['h1h2']).forcedDraw).toBe('seventy-five-move-rule')
  })

  describe('with en passant disabled', () => {
    const noEp = { enPassant: false }
    const line = ['e2e4', 'a7a6', 'e4e5', 'd7d5']

    it('removes en passant from the legal moves and rejects it in a replay', () => {
      const p = buildPosition(STARTING_FEN, line.map(mv), noEp)
      expect(p.ok && p.value.legalMoves.some((m) => m.enPassant)).toBe(false)
      expect(build(STARTING_FEN, line).legalMoves.some((m) => m.enPassant)).toBe(true)
      expect(buildPosition(STARTING_FEN, [...line, 'e5d6'].map(mv), noEp).ok).toBe(false)
    })

    it('ends in stalemate when en passant would have been the only move', () => {
      const fen = '8/3p4/4n3/4P3/8/1b6/2k5/K7 b - - 0 1'
      expect(build(fen, ['d7d5']).terminal).toBeNull()
      const p = buildPosition(fen, [mv('d7d5')], noEp)
      expect(p.ok && p.value.terminal?.reason).toBe('stalemate')
    })

    it('marks exported PGN as a variant', () => {
      const pgn = exportPgn({
        initialFen: STARTING_FEN,
        moves: [mv('e2e4')],
        players: { w: { name: '' }, b: { name: '' } },
        outcome: null,
        date: new Date(2026, 0, 5),
        timeControl: null,
        moveRules: noEp,
      })
      expect(pgn.ok && pgn.value).toContain('[Variant "No en passant"]')
    })
  })

  it('validates stored lines including cached SAN', () => {
    const p = build(STARTING_FEN, [])
    const e4 = p.legalMoves.find((m) => m.to === 'e4')!
    expect(validateLine(STARTING_FEN, [e4]).ok).toBe(true)
    expect(validateLine(STARTING_FEN, [{ ...e4, san: 'e5' }]).ok).toBe(false)
  })

  it('treats lone kings and single minor pieces as lacking mating material', () => {
    expect(lacksMatingMaterial({ a1: { color: 'w', type: 'k' } }, 'w')).toBe(true)
    expect(lacksMatingMaterial({ a1: { color: 'w', type: 'k' }, b1: { color: 'w', type: 'n' } }, 'w')).toBe(true)
    expect(lacksMatingMaterial({ a1: { color: 'w', type: 'k' }, b1: { color: 'w', type: 'p' } }, 'w')).toBe(false)
  })

  it('round-trips PGN with headers, custom FEN and result', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'
    const pgn = exportPgn({
      initialFen: fen,
      moves: [mv('e1g1')],
      players: { w: { name: 'Ada' }, b: { name: 'Grace' } },
      outcome: { result: '1-0', winner: 'w', reason: 'resignation' },
      date: new Date(2026, 0, 5),
      timeControl: { initialMs: 300_000, incrementMs: 3_000 },
    })
    expect(pgn.ok).toBe(true)
    if (!pgn.ok) return
    expect(pgn.value).toContain('[White "Ada"]')
    expect(pgn.value).toContain('[Result "1-0"]')
    expect(pgn.value).toContain('[TimeControl "300+3"]')
    expect(pgn.value).toContain('[Termination "Resignation"]')
    const parsed = parsePgn(pgn.value)
    expect(parsed.ok && parsed.value.initialFen).toBe(fen)
    expect(parsed.ok && parsed.value.moves.map((m) => m.san)).toEqual(['O-O'])
    expect(parsed.ok && parsed.value.recordedResult).toBe('1-0')
  })

  it('reports unreadable PGN without throwing', () => {
    expect(parsePgn('').ok).toBe(false)
    expect(parsePgn('1. e4 e5 2. Ke3').ok).toBe(false)
    expect(parsePgn('not chess at all').ok).toBe(false)
  })
})
