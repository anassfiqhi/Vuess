import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_RULES, RULE_PRESETS } from '../services/gameRules'
import { CORRUPT_BACKUP_KEY, GAME_STORAGE_KEY } from '../services/persistence'
import { setTimeSource } from '../services/timeSource'
import { useGameStore, type GameSetup } from '../stores/game'
import { GAME_RECORD_VERSION } from '../types'
import { fakeClock, mv } from './helpers'

const PERSON = { kind: 'person' } as const

let clock: ReturnType<typeof fakeClock>
let restoreTime: () => void

beforeEach(() => {
  localStorage.clear()
  clock = fakeClock()
  restoreTime = setTimeSource(clock.now)
  setActivePinia(createPinia())
})
afterEach(() => restoreTime())

function play(store: ReturnType<typeof useGameStore>, ...moves: string[]) {
  for (const m of moves) {
    const result = store.tryMove(mv(m))
    if (!result.ok) throw new Error(`${m}: ${result.error}`)
  }
}

/** A store whose current game allows takebacks (the default Chess.com-style rules do not). */
function casualStore() {
  const store = useGameStore()
  store.startGame({ opponent: PERSON, whiteName: '', blackName: '', timeControl: null, rulesChoice: 'casual', rules: RULE_PRESETS.casual.rules })
  return store
}

function freshStore() {
  setActivePinia(createPinia())
  const store = useGameStore()
  store.hydrate()
  return store
}

describe('move pipeline', () => {
  it('accepts legal moves and enforces turn order', () => {
    const store = useGameStore()
    expect(store.tryMove(mv('e7e5')).ok).toBe(false)
    expect(store.tryMove(mv('e2e4')).ok).toBe(true)
    expect(store.position.turn).toBe('b')
    expect(store.tryMove(mv('d2d4')).ok).toBe(false)
  })

  it('leaves the game unchanged after an illegal move', () => {
    const store = useGameStore()
    play(store, 'e2e4')
    const before = JSON.stringify(store.record)
    const result = store.tryMove(mv('e1e3'))
    expect(result).toEqual({ ok: false, error: 'That move is not legal.' })
    expect(JSON.stringify(store.record)).toBe(before)
  })

  it('requires a promotion choice and supports underpromotion', () => {
    const store = useGameStore()
    store.importPgn('[SetUp "1"]\n[FEN "8/P7/8/8/8/8/8/k6K w - - 0 1"]\n\n*')
    expect(store.needsPromotion(mv('a7a8'))).toBe(true)
    const before = store.record.revision
    expect(store.tryMove(mv('a7a8'))).toEqual({ ok: false, error: 'Choose a piece to promote to.' })
    expect(store.record.revision).toBe(before)
    expect(store.tryMove(mv('a7a8n')).ok).toBe(true)
    expect(store.position.pieces.a8).toEqual({ color: 'w', type: 'n' })
    expect(store.appliedMoves.at(-1)?.san).toBe('a8=N')
  })

  it('ends the game on checkmate and rejects further moves', () => {
    const store = useGameStore()
    play(store, 'f2f3', 'e7e5', 'g2g4', 'd8h4')
    expect(store.outcome).toEqual({ result: '0-1', winner: 'b', reason: 'checkmate' })
    expect(store.tryMove(mv('a2a3'))).toEqual({ ok: false, error: 'The game is over.' })
  })

  it('records explicit resignation and draw by agreement', () => {
    const store = useGameStore()
    play(store, 'e2e4')
    store.resign('b')
    expect(store.outcome).toEqual({ result: '1-0', winner: 'w', reason: 'resignation' })
    expect(store.canUndo).toBe(false)
    store.startGame({ opponent: PERSON, whiteName: 'A', blackName: 'B', timeControl: null, rulesChoice: 'chesscom', rules: DEFAULT_RULES })
    store.agreeDraw()
    expect(store.outcome?.reason).toBe('agreement')
  })
})

describe('undo and redo', () => {
  it('undoes, redoes, and discards the abandoned line on a new move', () => {
    const store = casualStore()
    play(store, 'e2e4', 'e7e5', 'g1f3')
    store.undoMove()
    store.undoMove()
    expect(store.position.turn).toBe('b')
    expect(store.canRedo).toBe(true)
    store.redoMove()
    expect(store.appliedMoves.map((m) => m.san)).toEqual(['e4', 'e5'])
    play(store, 'd2d4')
    expect(store.canRedo).toBe(false)
    expect(store.record.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'd4'])
  })

  it('can take back a checkmate but not a resignation', () => {
    const store = casualStore()
    play(store, 'f2f3', 'e7e5', 'g2g4', 'd8h4')
    expect(store.undoMove().ok).toBe(true)
    expect(store.outcome).toBeNull()
    expect(store.canRedo).toBe(true)
    store.redoMove()
    expect(store.outcome?.reason).toBe('checkmate')
  })

  it('viewing historical positions does not mutate the live game', () => {
    const store = useGameStore()
    play(store, 'e2e4', 'e7e5')
    const before = JSON.stringify(store.record)
    const earlier = store.positionAt(1)
    expect(earlier?.turn).toBe('b')
    expect(earlier?.pieces.e5).toBeUndefined()
    expect(JSON.stringify(store.record)).toBe(before)
  })
})

describe('persistence', () => {
  it('saves and restores history, redo stack and explicit outcomes', () => {
    const store = useGameStore()
    store.startGame({ opponent: PERSON, whiteName: 'Ada', blackName: 'Grace', timeControl: null, rulesChoice: 'casual', rules: RULE_PRESETS.casual.rules })
    play(store, 'e2e4', 'e7e5', 'g1f3')
    store.undoMove()
    store.resign('w')
    const restored = freshStore()
    expect(restored.record.players.w.name).toBe('Ada')
    expect(restored.record.moves).toHaveLength(3)
    expect(restored.record.cursor).toBe(2)
    expect(restored.outcome).toEqual({ result: '0-1', winner: 'b', reason: 'resignation' })
  })

  it.each([
    ['corrupt JSON', '{not json'],
    ['unsupported version', JSON.stringify({ version: 99, game: {} })],
    ['illegal moves', JSON.stringify({ version: 1, game: { version: 1 } })],
  ])('recovers from %s with a notice and a backup', (_label, raw) => {
    localStorage.setItem(GAME_STORAGE_KEY, raw)
    const store = freshStore()
    expect(store.restoreNotice).toMatch(/new game was started/)
    expect(store.appliedMoves).toHaveLength(0)
    expect(localStorage.getItem(CORRUPT_BACKUP_KEY)).toBe(raw)
  })

  it('rejects a saved game whose moves were tampered with', () => {
    const store = useGameStore()
    play(store, 'e2e4')
    const saved = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY)!)
    saved.game.moves[0].to = 'e5'
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(saved))
    expect(freshStore().restoreNotice).toMatch(/not valid/)
  })

  it('keeps the current game when restore or import input is invalid', () => {
    const store = useGameStore()
    play(store, 'e2e4')
    const before = JSON.stringify(store.record)
    expect(store.restoreGame({ version: 1, moves: 'nope' }).ok).toBe(false)
    expect(store.importPgn('1. e4 e5 2. Qxf7').ok).toBe(false)
    expect(JSON.stringify(store.record)).toBe(before)
  })

  it('imports finished PGNs for review and unfinished ones as playable untimed games', () => {
    const store = useGameStore()
    expect(store.importPgn('[White "Ada"]\n[Result "1-0"]\n\n1. e4 e5 1-0').ok).toBe(true)
    expect(store.outcome).toEqual({ result: '1-0', winner: 'w', reason: 'recorded-result' })
    expect(store.record.players.w.name).toBe('Ada')
    expect(store.importPgn('1. e4 e5 *').ok).toBe(true)
    expect(store.outcome).toBeNull()
    expect(store.isTimed).toBe(false)
    expect(store.tryMove(mv('g1f3')).ok).toBe(true)
  })

  it('reports storage failures without breaking play', () => {
    const store = useGameStore()
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    try {
      expect(store.tryMove(mv('e2e4')).ok).toBe(true)
      expect(store.storageWarning).toMatch(/Saving failed/)
    } finally {
      Storage.prototype.setItem = original
    }
  })
})

describe('clocks', () => {
  const blitz: GameSetup = {
    opponent: PERSON,
    whiteName: '',
    blackName: '',
    timeControl: { initialMs: 60_000, incrementMs: 2_000 },
    rulesChoice: 'casual', rules: RULE_PRESETS.casual.rules,
  }

  it('starts after the first move and applies increment to accepted moves only', () => {
    const store = useGameStore()
    store.startGame(blitz)
    clock.advance(10_000)
    play(store, 'e2e4') // clock was not running yet: no charge, no increment
    expect(store.clocks).toEqual({ w: 60_000, b: 60_000 })
    clock.advance(5_000)
    store.tick()
    expect(store.clocks).toEqual({ w: 60_000, b: 55_000 })
    expect(store.tryMove(mv('e2e4')).ok).toBe(false)
    play(store, 'e7e5')
    expect(store.clocks).toEqual({ w: 60_000, b: 57_000 })
  })

  it('settles elapsed time after a hidden tab without counting ticks', () => {
    const store = useGameStore()
    store.startGame(blitz)
    play(store, 'e2e4')
    clock.advance(30_000) // no ticks happened while hidden
    store.tick()
    expect(store.clocks?.b).toBe(30_000)
    clock.advance(31_000)
    store.tick()
    expect(store.outcome).toEqual({ result: '1-0', winner: 'w', reason: 'timeout' })
    expect(store.clocks).toEqual({ w: 60_000, b: 0 })
  })

  it('checks expiry before accepting a move', () => {
    const store = useGameStore()
    store.startGame(blitz)
    play(store, 'e2e4')
    clock.advance(61_000)
    expect(store.tryMove(mv('e7e5'))).toEqual({ ok: false, error: 'Time ran out before that move.' })
    expect(store.outcome?.reason).toBe('timeout')
    expect(store.appliedMoves).toHaveLength(1)
  })

  it('draws on timeout when the opponent cannot mate', () => {
    const store = useGameStore()
    store.importPgn('[SetUp "1"]\n[FEN "k7/8/8/8/8/8/8/KR6 w - - 0 1"]\n\n*')
    const imported = structuredClone(store.snapshot())
    imported.timeControl = blitz.timeControl
    imported.clocks = [{ w: 60_000, b: 60_000 }]
    expect(store.restoreGame(imported).ok).toBe(true)
    play(store, 'b1h1', 'a8a7') // white to move with a rook; black has a lone king
    clock.advance(61_000)
    store.tick()
    expect(store.outcome).toEqual({ result: '1/2-1/2', winner: null, reason: 'timeout-vs-insufficient-material' })
  })

  it('restores clock checkpoints on undo', () => {
    const store = useGameStore()
    store.startGame(blitz)
    play(store, 'e2e4')
    clock.advance(10_000)
    play(store, 'e7e5') // black: 60 - 10 + 2 = 52
    clock.advance(4_000)
    play(store, 'g1f3') // white: 60 - 4 + 2 = 58
    expect(store.clocks).toEqual({ w: 58_000, b: 52_000 })
    store.undoMove()
    expect(store.clocks).toEqual({ w: 60_000, b: 52_000 })
    store.undoMove()
    expect(store.clocks).toEqual({ w: 60_000, b: 60_000 })
  })

  it('pauses on reload and keeps the time already used this turn', () => {
    const store = useGameStore()
    store.startGame(blitz)
    play(store, 'e2e4')
    clock.advance(7_000)
    store.saveCheckpoint()
    clock.advance(500_000) // time while the page was closed is not charged
    const restored = freshStore()
    expect(restored.isPaused).toBe(true)
    expect(restored.clocks?.b).toBe(53_000)
    expect(restored.tryMove(mv('e7e5')).ok).toBe(false)
    restored.resume()
    clock.advance(1_000)
    restored.tick()
    expect(restored.clocks?.b).toBe(52_000)
  })

  it('stops the clocks once the game ends', () => {
    const store = useGameStore()
    store.startGame(blitz)
    play(store, 'e2e4')
    clock.advance(2_000)
    store.resign('b')
    clock.advance(20_000)
    store.tick()
    expect(store.clocks).toEqual({ w: 60_000, b: 58_000 })
    expect(store.isClockRunning).toBe(false)
  })
})

describe('rules', () => {
  const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8']
  const start = (store: ReturnType<typeof useGameStore>, preset: keyof typeof RULE_PRESETS) =>
    store.startGame({ opponent: PERSON, whiteName: '', blackName: '', timeControl: null, rulesChoice: preset, rules: RULE_PRESETS[preset].rules })

  it('starts with Chess.com-style rules by default', () => {
    const store = useGameStore()
    expect(store.rules).toEqual(RULE_PRESETS.chesscom.rules)
    expect(store.rules).toEqual(DEFAULT_RULES)
    expect(store.rulesChoice).toBe('chesscom')
    play(store, 'e2e4')
    expect(store.canUndo).toBe(false)
  })

  it('blocks undo and redo when takebacks are off', () => {
    const store = useGameStore()
    start(store, 'strict')
    play(store, 'e2e4')
    expect(store.canUndo).toBe(false)
    expect(store.undoMove()).toEqual({ ok: false, error: 'Takebacks are off in this game.' })
    expect(store.appliedMoves).toHaveLength(1)
  })

  it('ends on threefold repetition automatically in casual games', () => {
    const store = useGameStore()
    start(store, 'casual')
    play(store, ...shuffle, ...shuffle)
    expect(store.outcome?.reason).toBe('threefold-repetition')
  })

  it('lets a player claim threefold repetition under claim rules, and the claim survives a reload', () => {
    const store = useGameStore()
    start(store, 'strict')
    play(store, ...shuffle)
    expect(store.canClaimDraw).toBe(false)
    expect(store.claimDraw().ok).toBe(false)
    play(store, ...shuffle)
    expect(store.outcome).toBeNull()
    expect(store.canClaimDraw).toBe(true)
    expect(store.claimDraw().ok).toBe(true)
    expect(store.outcome).toEqual({ result: '1/2-1/2', winner: null, reason: 'claimed-threefold-repetition' })
    expect(freshStore().outcome?.reason).toBe('claimed-threefold-repetition')
  })

  it('still ends the game on fivefold repetition under claim rules', () => {
    const store = useGameStore()
    start(store, 'strict')
    play(store, ...shuffle, ...shuffle, ...shuffle)
    expect(store.outcome).toBeNull()
    play(store, ...shuffle)
    expect(store.outcome?.reason).toBe('fivefold-repetition')
  })

  it('copies the rules into the game so later edits to the input do not change them', () => {
    const store = useGameStore()
    const rules = { ...RULE_PRESETS.casual.rules }
    store.startGame({ opponent: PERSON, whiteName: '', blackName: '', timeControl: null, rulesChoice: 'custom', rules })
    rules.takebacks = false
    expect(store.rules.takebacks).toBe(true)
  })

  it('upgrades version 1 saves to casual rules', () => {
    const store = useGameStore()
    play(store, 'e2e4')
    const saved = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY)!)
    delete saved.game.rules
    saved.version = 1
    saved.game.version = 1
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(saved))
    const restored = freshStore()
    expect(restored.restoreNotice).toBeNull()
    expect(restored.record.version).toBe(GAME_RECORD_VERSION)
    expect(restored.rulesChoice).toBe('casual')
    expect(restored.rules).toEqual(RULE_PRESETS.casual.rules)
    expect(restored.appliedMoves).toHaveLength(1)
  })

  it('upgrades version 2 saves by allowing en passant, as before', () => {
    const store = useGameStore()
    play(store, 'e2e4')
    const saved = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY)!)
    delete saved.game.rules.enPassant
    saved.version = 2
    saved.game.version = 2
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(saved))
    const restored = freshStore()
    expect(restored.restoreNotice).toBeNull()
    expect(restored.rules.enPassant).toBe(true)
  })

  it('rejects en passant when the rule is off, and keeps it off after a reload', () => {
    const store = useGameStore()
    store.startGame({ opponent: PERSON, whiteName: '', blackName: '', timeControl: null, rulesChoice: 'custom', rules: { ...DEFAULT_RULES, enPassant: false } })
    play(store, 'e2e4', 'a7a6', 'e4e5', 'd7d5')
    expect(store.tryMove(mv('e5d6'))).toEqual({ ok: false, error: 'That move is not legal.' })
    expect(store.getLegalMoves('e5').map((m) => m.to)).toEqual(['e6'])
    const restored = freshStore()
    expect(restored.rules.enPassant).toBe(false)
    expect(restored.tryMove(mv('e5d6')).ok).toBe(false)
  })

  it('upgrades version 3 saves by naming the rule set from the rules', () => {
    const store = useGameStore()
    store.startGame({ opponent: PERSON, whiteName: '', blackName: '', timeControl: null, rulesChoice: 'custom', rules: RULE_PRESETS.strict.rules })
    play(store, 'e2e4')
    const saved = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY)!)
    delete saved.game.rulesChoice
    saved.version = 3
    saved.game.version = 3
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(saved))
    expect(freshStore().rulesChoice).toBe('strict')
  })

  it('keeps the chosen rule set name even when custom rules match a preset', () => {
    const store = useGameStore()
    store.startGame({ opponent: PERSON, whiteName: '', blackName: '', timeControl: null, rulesChoice: 'custom', rules: DEFAULT_RULES })
    expect(freshStore().rulesChoice).toBe('custom')
  })

  it('rejects saves with invalid rules', () => {
    const store = useGameStore()
    play(store, 'e2e4')
    const saved = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY)!)
    saved.game.rules.drawClaims = 'sometimes'
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(saved))
    expect(freshStore().restoreNotice).toMatch(/new game was started/)
  })
})
