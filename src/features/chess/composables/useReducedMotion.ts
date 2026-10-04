import { computed, onScopeDispose, ref, type Ref } from 'vue'
import type { AnimationPreference } from '@/stores/settings'

/** Combines the user's animation setting with the OS reduced-motion preference. */
export function useMotionEnabled(preference: Ref<AnimationPreference>) {
  const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  const systemReduced = ref(query?.matches ?? false)
  const onChange = (e: MediaQueryListEvent) => (systemReduced.value = e.matches)
  query?.addEventListener('change', onChange)
  onScopeDispose(() => query?.removeEventListener('change', onChange))

  return computed(() => preference.value === 'on' || (preference.value === 'system' && !systemReduced.value))
}
