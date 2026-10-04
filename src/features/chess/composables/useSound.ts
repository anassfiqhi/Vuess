import { onScopeDispose, type Ref } from 'vue'

export type SoundKind = 'move' | 'capture' | 'check' | 'end' | 'error'

const TONES: Record<SoundKind, { freq: number; duration: number; type: OscillatorType; gain: number }[]> = {
  move: [{ freq: 520, duration: 0.05, type: 'triangle', gain: 0.18 }],
  capture: [
    { freq: 300, duration: 0.05, type: 'square', gain: 0.08 },
    { freq: 220, duration: 0.07, type: 'triangle', gain: 0.16 },
  ],
  check: [
    { freq: 660, duration: 0.07, type: 'triangle', gain: 0.18 },
    { freq: 880, duration: 0.09, type: 'triangle', gain: 0.16 },
  ],
  end: [
    { freq: 523, duration: 0.12, type: 'sine', gain: 0.18 },
    { freq: 659, duration: 0.12, type: 'sine', gain: 0.18 },
    { freq: 784, duration: 0.2, type: 'sine', gain: 0.18 },
  ],
  error: [{ freq: 160, duration: 0.08, type: 'sawtooth', gain: 0.05 }],
}

/**
 * Synthesised feedback tones. The AudioContext is created lazily on the first
 * sound, which always follows a user action, so autoplay policies are respected.
 */
export function useSound(enabled: Ref<boolean>) {
  let context: AudioContext | null = null

  function play(kind: SoundKind): void {
    if (!enabled.value || typeof AudioContext === 'undefined') return
    try {
      context ??= new AudioContext()
      if (context.state === 'suspended') void context.resume()
      let start = context.currentTime
      for (const tone of TONES[kind]) {
        const osc = context.createOscillator()
        const gain = context.createGain()
        osc.type = tone.type
        osc.frequency.value = tone.freq
        gain.gain.setValueAtTime(tone.gain, start)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration)
        osc.connect(gain).connect(context.destination)
        osc.start(start)
        osc.stop(start + tone.duration)
        start += tone.duration * 0.8
      }
    } catch {
      // Audio is optional feedback; failures must never affect play.
    }
  }

  onScopeDispose(() => {
    void context?.close().catch(() => undefined)
    context = null
  })

  return { play }
}
