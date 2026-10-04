import { onScopeDispose, watch } from 'vue'
import { useGameStore } from '../stores/game'

/** How often the clock display refreshes. Elapsed time is always derived from timestamps. */
const TICK_INTERVAL_MS = 100

/**
 * App-level game runtime: restores the saved game, refreshes running clocks,
 * settles time when a hidden tab becomes visible, and saves at lifecycle
 * checkpoints. Mounted once in App.vue so clocks keep working on every route.
 */
export function useGameRuntime() {
  const game = useGameStore()
  game.hydrate()

  let timer: ReturnType<typeof setInterval> | null = null
  const stop = () => {
    if (timer !== null) clearInterval(timer)
    timer = null
  }
  watch(
    () => game.isClockRunning,
    (running) => {
      stop()
      if (running) timer = setInterval(() => game.tick(), TICK_INTERVAL_MS)
    },
    { immediate: true },
  )

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') game.saveCheckpoint()
    else game.tick() // background timers may have been throttled; settle immediately
  }
  function onPageHide(): void {
    game.saveCheckpoint()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', onPageHide)

  onScopeDispose(() => {
    stop()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', onPageHide)
  })
}
