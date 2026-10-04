import type { Outcome, PieceColor, PlayerInfo } from '../types'

const REASON_TEXT: Record<Outcome['reason'], string> = {
  checkmate: 'by checkmate',
  stalemate: 'by stalemate',
  'insufficient-material': 'by insufficient material',
  'threefold-repetition': 'by threefold repetition',
  'fifty-move-rule': 'by the fifty-move rule',
  resignation: 'by resignation',
  agreement: 'by agreement',
  timeout: 'on time',
  'timeout-vs-insufficient-material': 'time ran out, but the opponent could not checkmate',
  'recorded-result': 'as recorded in the imported game',
  'fivefold-repetition': 'by fivefold repetition',
  'seventy-five-move-rule': 'by the 75-move rule',
  'claimed-threefold-repetition': 'by threefold repetition (claimed)',
  'claimed-fifty-move-rule': 'by the fifty-move rule (claimed)',
}

export const colorName = (c: PieceColor) => (c === 'w' ? 'White' : 'Black')

export function playerLabel(color: PieceColor, players: Record<PieceColor, PlayerInfo>): string {
  const name = players[color].name
  return name ? `${name} (${colorName(color)})` : colorName(color)
}

export function describeOutcome(outcome: Outcome, players: Record<PieceColor, PlayerInfo>) {
  const headline = outcome.winner ? `${playerLabel(outcome.winner, players)} wins` : 'Draw'
  return { headline, detail: `${outcome.result} · ${REASON_TEXT[outcome.reason]}` }
}
