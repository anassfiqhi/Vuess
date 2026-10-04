import type { MoveInput, PromotionPiece, Square } from '../types'

/** Parses compact coordinate notation such as "e2e4" or "a7a8n". */
export function mv(text: string): MoveInput {
  const input: MoveInput = { from: text.slice(0, 2) as Square, to: text.slice(2, 4) as Square }
  if (text[4]) input.promotion = text[4] as PromotionPiece
  return input
}

export function fakeClock(start = 1_000) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}
