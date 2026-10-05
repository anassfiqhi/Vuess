import type { EngineLevel, MoveInput } from '../../types'

export interface MoveRequest {
  initialFen: string
  moves: readonly MoveInput[]
  level: EngineLevel
}

/**
 * The computer opponent. The app only depends on this interface, so the
 * Stockfish worker can be swapped (or faked in tests).
 */
export interface ChessEngine {
  /** Resolves with the engine's move; rejects with an AbortError if `signal` aborts first. */
  bestMove(request: MoveRequest, signal?: AbortSignal): Promise<MoveInput>
  dispose(): void
}

export type EngineFactory = () => ChessEngine

/** Loaded lazily so the engine (and its 1.8 MB WebAssembly file) is only fetched for Computer games. */
let factory: EngineFactory = () => {
  throw new Error('Engine factory not loaded yet.')
}
let factoryLoaded = false
let instance: ChessEngine | null = null

export async function getEngine(): Promise<ChessEngine> {
  if (instance) return instance
  if (!factoryLoaded) {
    const { createStockfishEngine } = await import('./stockfishEngine')
    if (!factoryLoaded) factory = createStockfishEngine
    factoryLoaded = true
  }
  instance ??= factory()
  return instance
}

export function disposeEngine(): void {
  instance?.dispose()
  instance = null
}

/** Test seam: use another engine and return a function that restores the previous one. */
export function setEngineFactory(next: EngineFactory): () => void {
  const previous = { factory, factoryLoaded }
  disposeEngine()
  factory = next
  factoryLoaded = true
  return () => {
    disposeEngine()
    factory = previous.factory
    factoryLoaded = previous.factoryLoaded
  }
}

export const abortError = () => new DOMException('The engine request was cancelled.', 'AbortError')
export const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'
