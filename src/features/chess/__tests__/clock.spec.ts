import { describe, expect, it } from 'vitest'
import { checkpointAfterMove, elapsedInTurn, formatClock, remainingAt } from '../services/clock'

describe('clock math', () => {
  it('derives elapsed time from checkpoints rather than ticks', () => {
    expect(elapsedInTurn(500, 1_000, 4_000)).toBe(3_500)
    expect(elapsedInTurn(500, null, 9_999)).toBe(500)
    expect(remainingAt({ w: 10_000, b: 8_000 }, 'b', 3_000)).toEqual({ w: 10_000, b: 5_000 })
  })

  it('adds increment only when the clock was running', () => {
    const control = { initialMs: 60_000, incrementMs: 2_000 }
    expect(checkpointAfterMove({ w: 60_000, b: 60_000 }, 'w', 5_000, control, true)).toEqual({ w: 57_000, b: 60_000 })
    expect(checkpointAfterMove({ w: 60_000, b: 60_000 }, 'w', 5_000, control, false)).toEqual({ w: 60_000, b: 60_000 })
  })

  it('formats clock displays', () => {
    expect(formatClock(300_000)).toBe('5:00')
    expect(formatClock(59_001)).toBe('1:00')
    expect(formatClock(9_450)).toBe('0:09.4')
    expect(formatClock(-5)).toBe('0:00.0')
    expect(formatClock(3_600_000)).toBe('1:00:00')
  })
})
