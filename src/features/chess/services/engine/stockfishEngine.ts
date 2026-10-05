/**
 * Stockfish 19 (lite, single-threaded WebAssembly build) running in a Web
 * Worker. Stockfish is GPL-3.0; see README "Computer opponent".
 *
 * The single-threaded build needs no cross-origin isolation headers. The
 * worker script reads the location of its .wasm file from the URL fragment.
 */
import workerUrl from 'stockfish/bin/stockfish-19-lite-single.js?url'
import wasmUrl from 'stockfish/bin/stockfish-19-lite-single.wasm?url'
import { abortError, type ChessEngine, type MoveRequest } from './engine'
import { engineLevel } from './levels'
import { isBestMoveLine, parseBestMove, positionCommand, searchCommands } from './uci'
import type { MoveInput } from '../../types'

export function createStockfishEngine(): ChessEngine {
  let worker: Worker | null = null
  let ready: Promise<void> | null = null
  /** Waiters for the next line matching a predicate. */
  let waiters: { match: (line: string) => boolean; resolve: (line: string) => void; reject: (e: unknown) => void }[] = []
  /** Searches run one at a time; a cancelled search still finishes (after "stop") before the next starts. */
  let queue: Promise<unknown> = Promise.resolve()

  function failAll(error: unknown): void {
    const pending = waiters
    waiters = []
    for (const w of pending) w.reject(error)
    worker?.terminate()
    worker = null
    ready = null
  }

  function nextLine(match: (line: string) => boolean): Promise<string> {
    return new Promise((resolve, reject) => waiters.push({ match, resolve, reject }))
  }

  function send(command: string): void {
    worker?.postMessage(command)
  }

  function start(): Promise<void> {
    if (ready) return ready
    const wasm = new URL(wasmUrl, location.href).href
    worker = new Worker(`${workerUrl}#${encodeURIComponent(wasm)}`)
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const line = String(event.data)
      const index = waiters.findIndex((w) => w.match(line))
      if (index >= 0) waiters.splice(index, 1)[0]!.resolve(line)
    }
    worker.onerror = (event) => failAll(new Error(event.message || 'The chess engine stopped unexpectedly.'))
    const uciOk = nextLine((l) => l === 'uciok')
    send('uci')
    ready = uciOk.then(() => {
      const readyOk = nextLine((l) => l === 'readyok')
      send('isready')
      return readyOk.then(() => undefined)
    })
    return ready
  }

  async function search(request: MoveRequest, signal?: AbortSignal): Promise<MoveInput> {
    if (signal?.aborted) throw abortError()
    await start()
    if (signal?.aborted) throw abortError()
    const bestMove = nextLine(isBestMoveLine)
    send(positionCommand(request.initialFen, request.moves))
    for (const command of searchCommands(engineLevel(request.level))) send(command)
    const onAbort = () => send('stop')
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const line = await bestMove
      if (signal?.aborted) throw abortError()
      const move = parseBestMove(line)
      if (!move) throw new Error('The chess engine found no move.')
      return move
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  return {
    bestMove(request, signal) {
      const run = queue.then(() => search(request, signal))
      // Keep the queue alive whatever happens to this search.
      queue = run.catch(() => undefined)
      if (!signal) return run
      // Reject immediately on abort; the search itself winds down in the background.
      return new Promise<MoveInput>((resolve, reject) => {
        const onAbort = () => reject(abortError())
        if (signal.aborted) onAbort()
        signal.addEventListener('abort', onAbort, { once: true })
        run.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
      })
    },
    dispose() {
      failAll(abortError())
    },
  }
}
