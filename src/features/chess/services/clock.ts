import type { ClockCheckpoint, PieceColor, TimeControl } from '../types'

export const TIME_CONTROL_PRESETS: readonly { id: string; label: string; control: TimeControl | null }[] = [
  { id: 'untimed', label: 'Untimed', control: null },
  { id: '3+2', label: '3 min + 2 s', control: { initialMs: 3 * 60_000, incrementMs: 2_000 } },
  { id: '5+0', label: '5 min', control: { initialMs: 5 * 60_000, incrementMs: 0 } },
  { id: '10+5', label: '10 min + 5 s', control: { initialMs: 10 * 60_000, incrementMs: 5_000 } },
  { id: '15+10', label: '15 min + 10 s', control: { initialMs: 15 * 60_000, incrementMs: 10_000 } },
  { id: '30+0', label: '30 min', control: { initialMs: 30 * 60_000, incrementMs: 0 } },
]

export function initialCheckpoint(control: TimeControl | null): ClockCheckpoint {
  return control ? { w: control.initialMs, b: control.initialMs } : { w: 0, b: 0 }
}

export function elapsedInTurn(turnElapsedMs: number, runningSince: number | null, now: number): number {
  return turnElapsedMs + (runningSince === null ? 0 : Math.max(0, now - runningSince))
}

/** Remaining time for both sides, charging the elapsed turn time to the side to move. */
export function remainingAt(checkpoint: ClockCheckpoint, turn: PieceColor, elapsedMs: number): ClockCheckpoint {
  return { ...checkpoint, [turn]: checkpoint[turn] - elapsedMs }
}

/** Checkpoint after an accepted move. Increment is only added once the clock is running. */
export function checkpointAfterMove(
  checkpoint: ClockCheckpoint,
  mover: PieceColor,
  elapsedMs: number,
  control: TimeControl,
  clockWasRunning: boolean,
): ClockCheckpoint {
  if (!clockWasRunning) return { ...checkpoint }
  return { ...checkpoint, [mover]: checkpoint[mover] - elapsedMs + control.incrementMs }
}

export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms)
  if (clamped < 10_000) {
    // Show tenths in the final seconds; floor so 0.0 only appears at expiry.
    const tenths = Math.floor(clamped / 100)
    return `0:0${Math.floor(tenths / 10)}.${tenths % 10}`
  }
  const totalSeconds = Math.ceil(clamped / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

export function describeTimeControl(control: TimeControl | null): string {
  if (!control) return 'Untimed'
  const minutes = control.initialMs / 60_000
  const inc = control.incrementMs / 1000
  return inc > 0 ? `${minutes} min + ${inc} s` : `${minutes} min`
}
