import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { useComputerPlayer, useComputerStatus } from '../composables/useComputerPlayer'
import { setEngineFactory, abortError, type ChessEngine, type MoveRequest } from '../services/engine/engine'
import { ENGINE_LEVELS, engineLevel } from '../services/engine/levels'
import { parseBestMove, positionCommand, searchCommands, toUci } from '../services/engine/uci'
import { RULE_PRESETS } from '../services/gameRules'
import { GAME_STORAGE_KEY } from '../services/persistence'
import { setTimeSource } from '../services/timeSource'
import { useGameStore, type GameSetup } from '../stores/game'
import type { MoveInput, PieceColor } from '../types'
import { fakeClock, mv } from './helpers'

describe('UCI helpers', () => {
  it('formats moves and positions', () => {
    expect(toUci(mv('e7e8q'))).toBe('e7e8q')
    expect(positionCommand('startfen', [])).toBe('position fen startfen')
    expect(positionCommand('startfen', [mv('e2e4'), mv('e7e5')])).toBe('position fen startfen moves e2e4 e7e5')
  })

  it('parses best moves, including promotions and "no move"', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ from: 'e2', to: 'e4' })
    expect(parseBestMove('bestmove a7a8n')).toEqual({ from: 'a7', to: 'a8', promotion: 'n' })
    expect(parseBestMove('bestmove (none)')).toBeNull()
    expect(parseBestMove('info depth 3')).toBeNull()
  })

  it('maps every level to a bounded search that gets stronger', () => {
    expect(ENGINE_LEVELS).toHaveLength(8)
    expect(searchCommands(engineLevel(1))).toEqual(['setoption name Skill Level value 0', 'go depth 1 movetime 100'])
    for (let i = 1; i < ENGINE_LEVELS.length; i++) {
      expect(ENGINE_LEVELS[i]!.skill).toBeGreaterThanOrEqual(ENGINE_LEVELS[i - 1]!.skill)
      expect(ENGINE_LEVELS[i]!.depth).toBeGreaterThan(ENGINE_LEVELS[i - 1]!.depth)
    }
  })
})

/** An engine whose answers the test releases by hand. */
function fakeEngine() {
  const requests: { request: MoveRequest; resolve: (m: MoveInput) => void; reject: (e: unknown) => void }[] = []
  const engine: ChessEngine = {
    bestMove(request, signal) {
      return new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(abortError()), { once: true })
        requests.push({ request, resolve, reject })
      })
    },
    dispose: vi.fn(),
  }
  return { engine, requests }
}

const computerGame = (computer: PieceColor, takebacks = true): GameSetup => ({
  whiteName: '',
  blackName: '',
  timeControl: null,
  rulesChoice: takebacks ? 'casual' : 'chesscom',
  rules: takebacks ? RULE_PRESETS.casual.rules : RULE_PRESETS.chesscom.rules,
  opponent: { kind: 'computer', color: computer, level: 1 },
})

let scope: EffectScope
let restoreEngine: () => void
let restoreTime: () => void
let fake: ReturnType<typeof fakeEngine>

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  setActivePinia(createPinia())
  restoreTime = setTimeSource(fakeClock().now)
  fake = fakeEngine()
  restoreEngine = setEngineFactory(() => fake.engine)
  scope = effectScope()
})

afterEach(() => {
  scope.stop()
  restoreEngine()
  restoreTime()
  vi.useRealTimers()
})

/** Lets the engine request, reply delay and store update settle. */
const settle = () => vi.advanceTimersByTimeAsync(1000)

describe('computer opponent', () => {
  it('replies after the player moves, using the game moves and level', async () => {
    const game = useGameStore()
    game.startGame(computerGame('b'))
    scope.run(() => useComputerPlayer())
    expect(game.isComputerTurn).toBe(false)
    game.tryMove(mv('e2e4'))
    await settle()
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0]!.request.moves.map(toUci)).toEqual(['e2e4'])
    expect(fake.requests[0]!.request.level).toBe(1)
    expect(useComputerStatus().thinking).toBe(true)
    fake.requests[0]!.resolve(mv('e7e5'))
    await settle()
    expect(game.appliedMoves.map((m) => m.san)).toEqual(['e4', 'e5'])
    expect(useComputerStatus().thinking).toBe(false)
  })

  it('moves first when the player chooses black', async () => {
    const game = useGameStore()
    game.startGame(computerGame('w'))
    scope.run(() => useComputerPlayer())
    await settle()
    fake.requests[0]!.resolve(mv('d2d4'))
    await settle()
    expect(game.appliedMoves.map((m) => m.san)).toEqual(['d4'])
    expect(game.isComputerTurn).toBe(false)
  })

  it('ignores a late reply after the game changed', async () => {
    const game = useGameStore()
    game.startGame(computerGame('b'))
    scope.run(() => useComputerPlayer())
    game.tryMove(mv('e2e4'))
    await settle()
    const stale = fake.requests[0]!
    game.undoMove() // back to the player's turn: the request is cancelled
    await settle()
    stale.resolve(mv('e7e5'))
    await settle()
    expect(game.appliedMoves).toHaveLength(0)
    expect(useComputerStatus().thinking).toBe(false)
  })

  it('reports engine failures and can try again', async () => {
    const game = useGameStore()
    game.startGame(computerGame('b'))
    scope.run(() => useComputerPlayer())
    game.tryMove(mv('e2e4'))
    await settle()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fake.requests[0]!.reject(new Error('worker crashed'))
    await settle()
    const status = useComputerStatus()
    expect(status.error).toMatch(/could not move/)
    status.retry()
    await settle()
    expect(fake.requests).toHaveLength(2)
    fake.requests[1]!.resolve(mv('c7c5'))
    await settle()
    expect(game.appliedMoves.map((m) => m.san)).toEqual(['e4', 'c5'])
  })

  it('does not move while a timed game is paused', async () => {
    const game = useGameStore()
    game.startGame({ ...computerGame('b'), timeControl: { initialMs: 60_000, incrementMs: 0 } })
    scope.run(() => useComputerPlayer())
    game.tryMove(mv('e2e4'))
    await settle()
    game.pause()
    await settle()
    fake.requests[0]!.resolve(mv('e7e5'))
    await settle()
    expect(game.appliedMoves).toHaveLength(1)
    game.resume()
    await settle()
    fake.requests.at(-1)!.resolve(mv('e7e5'))
    await settle()
    expect(game.appliedMoves).toHaveLength(2)
  })
})

describe('takebacks against the computer', () => {
  const playPair = (game: ReturnType<typeof useGameStore>, player: string, computer: string) => {
    game.tryMove(mv(player))
    game.tryMove(mv(computer))
  }

  it('undo takes back the computer reply and the player move together; redo restores both', () => {
    const game = useGameStore()
    game.startGame(computerGame('b'))
    playPair(game, 'e2e4', 'e7e5')
    playPair(game, 'g1f3', 'b8c6')
    game.undoMove()
    expect(game.appliedMoves.map((m) => m.san)).toEqual(['e4', 'e5'])
    expect(game.position.turn).toBe('w')
    game.redoMove()
    expect(game.appliedMoves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
  })

  it('undo while the computer is still thinking takes back only the player move', () => {
    const game = useGameStore()
    game.startGame(computerGame('b'))
    playPair(game, 'e2e4', 'e7e5')
    game.tryMove(mv('g1f3'))
    game.undoMove()
    expect(game.appliedMoves.map((m) => m.san)).toEqual(['e4', 'e5'])
  })

  it('follows the rules: no takebacks in Chess.com style', () => {
    const game = useGameStore()
    game.startGame(computerGame('b', false))
    playPair(game, 'e2e4', 'e7e5')
    expect(game.undoMove().ok).toBe(false)
  })
})

describe('saves', () => {
  it('keeps the opponent across a reload and upgrades version 4 saves to in-person games', () => {
    const game = useGameStore()
    game.startGame(computerGame('w'))
    setActivePinia(createPinia())
    const restored = useGameStore()
    restored.hydrate()
    expect(restored.opponent).toEqual({ kind: 'computer', color: 'w', level: 1 })

    const saved = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY)!)
    delete saved.game.opponent
    saved.version = 4
    saved.game.version = 4
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(saved))
    setActivePinia(createPinia())
    const upgraded = useGameStore()
    upgraded.hydrate()
    expect(upgraded.restoreNotice).toBeNull()
    expect(upgraded.opponent).toEqual({ kind: 'person' })
  })
})
