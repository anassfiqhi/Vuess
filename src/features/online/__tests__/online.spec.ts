import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { STARTING_FEN } from '@/features/chess/services/chessRules'
import type { RecordedMove } from '@/features/chess/types'
import { inviteLink, parseGameReference } from '../services/gameLink'
import type { GameSocket } from '../services/connection'
import type { GameState } from '../protocol'
import { setSocketFactory, useOnlineStore } from '../stores/online'

describe('invite links', () => {
  it('builds links and reads links or bare codes', () => {
    expect(inviteLink('abc123XYZ', 'https://vuess.app')).toBe('https://vuess.app/online/abc123XYZ')
    expect(parseGameReference('https://vuess.app/online/abc123XYZ')).toBe('abc123XYZ')
    expect(parseGameReference('  abc123XYZ ')).toBe('abc123XYZ')
    expect(parseGameReference('http://localhost:5173/online/abc_12-3?x=1')).toBe('abc_12-3')
    expect(parseGameReference('not a link')).toBeNull()
    expect(parseGameReference('https://example.com/other/abc123')).toBeNull()
  })
})

const e4: RecordedMove = { from: 'e2', to: 'e4', san: 'e4', color: 'w', piece: 'p' }

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'game-123',
    revision: 2,
    status: 'active',
    initialFen: STARTING_FEN,
    moves: [],
    players: { w: { name: 'Ada', joined: true, connected: true }, b: { name: 'Bob', joined: true, connected: true } },
    timeControl: null,
    clock: null,
    outcome: null,
    drawOffer: null,
    ...overrides,
  }
}

type Handler = (payload: unknown) => unknown
/** A minimal stand-in for the Socket.IO client: requests are answered by the test. */
function fakeSocket(handlers: Record<string, Handler>) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  const sent: { event: string; payload: unknown }[] = []
  const socket = {
    on(event: string, listener: (...args: unknown[]) => void) {
      ;(listeners[event] ??= []).push(listener)
      return socket
    },
    timeout() {
      return {
        marker: 'timed-socket',
        async emitWithAck(this: { marker?: string }, event: string, payload: unknown) {
          // The real client uses `this`; calling the method detached must fail here too.
          if (this?.marker !== 'timed-socket') throw new TypeError('emitWithAck called without its socket')
          sent.push({ event, payload })
          const handler = handlers[event]
          if (!handler) throw new Error(`no handler for ${event}`)
          return handler(payload)
        },
      }
    },
    disconnect() {},
  }
  return {
    socket: socket as unknown as GameSocket,
    sent,
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners[event] ?? []) listener(...args)
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('online store', () => {
  it('creates a game, remembers the seat and the name', async () => {
    const fake = fakeSocket({
      'game:create': () => ({ ok: true, seat: { color: 'w', token: 'token-white-123456' }, state: state({ status: 'waiting' }) }),
    })
    setSocketFactory(() => fake.socket)
    const online = useOnlineStore()
    const created = await online.createGame({ name: 'Ada', color: 'w', timeControl: null })
    expect(created).toEqual({ ok: true, value: 'game-123' })
    expect(online.myColor).toBe('w')
    expect(online.hasSeat('game-123')).toBe(true)
    expect(online.playerName).toBe('Ada')
  })

  it('rejoins with the saved token after a reload or reconnect', async () => {
    localStorage.setItem('vuess.online.seats', JSON.stringify({ 'game-123': { color: 'b', token: 'token-black-123456' } }))
    const fake = fakeSocket({
      'game:join': (payload) => ({ ok: true, seat: { color: 'b', token: (payload as { token: string }).token }, state: state() }),
    })
    setSocketFactory(() => fake.socket)
    const online = useOnlineStore()
    await online.openGame('game-123')
    expect(fake.sent[0]).toEqual({ event: 'game:join', payload: { gameId: 'game-123', name: '', token: 'token-black-123456' } })
    expect(online.myColor).toBe('b')
    // The first connect does not join again (openGame already did); a reconnect does.
    fake.emit('connect')
    await Promise.resolve()
    expect(fake.sent.filter((s) => s.event === 'game:join')).toHaveLength(1)
    fake.emit('disconnect')
    fake.emit('connect')
    await new Promise((resolve) => setTimeout(resolve))
    expect(fake.sent.filter((s) => s.event === 'game:join')).toHaveLength(2)
  })

  it('shows a move immediately and keeps it when the server confirms', async () => {
    let answer: (value: unknown) => void = () => undefined
    const fake = fakeSocket({
      'game:create': () => ({ ok: true, seat: { color: 'w', token: 'token-white-123456' }, state: state() }),
      'game:move': () => new Promise((resolve) => (answer = resolve)),
    })
    setSocketFactory(() => fake.socket)
    const online = useOnlineStore()
    await online.createGame({ name: 'Ada', color: 'w', timeControl: null })
    fake.emit('connect')
    const pending = online.move({ from: 'e2', to: 'e4' })
    expect(online.moves.map((m) => m.san)).toEqual(['e4'])
    expect(online.canMove).toBe(false)
    expect(fake.sent.at(-1)?.payload).toMatchObject({ gameId: 'game-123', expectedRevision: 2, from: 'e2', to: 'e4' })
    answer({ ok: true, state: state({ revision: 3, moves: [e4] }) })
    expect((await pending).ok).toBe(true)
    expect(online.moves.map((m) => m.san)).toEqual(['e4'])
    expect(online.pendingMove).toBeNull()
  })

  it('takes the move back when the server rejects it', async () => {
    const fake = fakeSocket({
      'game:create': () => ({ ok: true, seat: { color: 'w', token: 'token-white-123456' }, state: state() }),
      'game:move': () => ({ ok: false, error: 'It is not your turn.', state: state() }),
    })
    setSocketFactory(() => fake.socket)
    const online = useOnlineStore()
    await online.createGame({ name: 'Ada', color: 'w', timeControl: null })
    fake.emit('connect')
    const result = await online.move({ from: 'e2', to: 'e4' })
    expect(result).toEqual({ ok: false, error: 'It is not your turn.' })
    expect(online.moves).toHaveLength(0)
    expect(online.error).toBe('It is not your turn.')
  })

  it('never sends two joins at once, so a seat cannot be raced', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const fake = fakeSocket({
      'game:join': async () => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight--
        return { ok: true, seat: { color: 'b', token: 'token-black-123456' }, state: state() }
      },
    })
    setSocketFactory(() => fake.socket)
    const online = useOnlineStore()
    const opening = online.openGame('game-123')
    fake.emit('connect')
    fake.emit('disconnect')
    fake.emit('connect') // a reconnect while the first join is still in flight
    await opening
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(maxInFlight).toBe(1)
    expect(online.myColor).toBe('b')
  })

  it('ignores out-of-date broadcasts and only plays on its own turn', async () => {
    const fake = fakeSocket({
      'game:create': () => ({ ok: true, seat: { color: 'b', token: 'token-black-123456' }, state: state({ revision: 5, moves: [e4] }) }),
    })
    setSocketFactory(() => fake.socket)
    const online = useOnlineStore()
    await online.createGame({ name: 'Bob', color: 'b', timeControl: null })
    fake.emit('connect')
    fake.emit('game:state', state({ revision: 4, moves: [] }))
    expect(online.moves).toHaveLength(1)
    expect(online.canMove).toBe(true) // black to move after 1.e4
    expect((await online.move({ from: 'e2', to: 'e4' })).ok).toBe(false)
  })

  it('counts the running clock down locally from the last server time', async () => {
    const fake = fakeSocket({
      'game:create': () => ({
        ok: true,
        seat: { color: 'w', token: 'token-white-123456' },
        state: state({ timeControl: { initialMs: 60_000, incrementMs: 0 }, clock: { remainingMs: { w: 30_000, b: 60_000 }, running: 'w' } }),
      }),
    })
    setSocketFactory(() => fake.socket)
    const online = useOnlineStore()
    await online.createGame({ name: 'Ada', color: 'w', timeControl: null })
    expect(online.clocks?.w).toBeLessThanOrEqual(30_000)
    expect(online.clocks?.b).toBe(60_000)
  })

  it('reports an unreachable server as a normal error', async () => {
    const fake = fakeSocket({
      'game:create': () => {
        throw new Error('operation has timed out')
      },
    })
    setSocketFactory(() => fake.socket)
    const online = useOnlineStore()
    const created = await online.createGame({ name: 'Ada', color: 'w', timeControl: null })
    expect(created).toEqual({ ok: false, error: 'The online server did not answer. Check your connection.' })
  })
})
