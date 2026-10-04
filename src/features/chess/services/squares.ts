import type { File, PieceColor, Rank, Square } from '../types'

export const FILES: readonly File[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
export const RANKS: readonly Rank[] = ['1', '2', '3', '4', '5', '6', '7', '8']

export function isSquare(value: unknown): value is Square {
  return typeof value === 'string' && /^[a-h][1-8]$/.test(value)
}

/** Squares in display order (top-left first) for the given orientation. */
export function displaySquares(orientation: PieceColor): Square[] {
  const ranks = orientation === 'w' ? [...RANKS].reverse() : [...RANKS]
  const files = orientation === 'w' ? [...FILES] : [...FILES].reverse()
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square))
}

/** Zero-based display row/column of a square for the given orientation. */
export function squareToDisplay(square: Square, orientation: PieceColor): { row: number; col: number } {
  const file = FILES.indexOf(square[0] as File)
  const rank = RANKS.indexOf(square[1] as Rank)
  return orientation === 'w' ? { row: 7 - rank, col: file } : { row: rank, col: 7 - file }
}

export function displayToSquare(row: number, col: number, orientation: PieceColor): Square | null {
  if (row < 0 || row > 7 || col < 0 || col > 7) return null
  const file = orientation === 'w' ? FILES[col] : FILES[7 - col]
  const rank = orientation === 'w' ? RANKS[7 - row] : RANKS[row]
  return file && rank ? `${file}${rank}` : null
}

export function isLightSquare(square: Square): boolean {
  const file = FILES.indexOf(square[0] as File)
  const rank = RANKS.indexOf(square[1] as Rank)
  return (file + rank) % 2 === 1
}
