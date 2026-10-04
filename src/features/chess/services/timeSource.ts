/**
 * Monotonic clock used for live timing. `performance.now()` is unaffected by
 * system clock changes but resets on reload, which is why clocks persist
 * elapsed durations rather than timestamps (see README "Clock policy").
 */
let source: () => number = () => performance.now()

export function now(): number {
  return source()
}

/** Test seam: replace the time source and return a restore function. */
export function setTimeSource(next: () => number): () => void {
  const previous = source
  source = next
  return () => {
    source = previous
  }
}
