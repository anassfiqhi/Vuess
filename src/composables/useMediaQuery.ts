import { onScopeDispose, ref } from 'vue'

/** Reactive matchMedia result, cleaned up with the calling scope. */
export function useMediaQuery(query: string) {
  const list = typeof matchMedia === 'function' ? matchMedia(query) : null
  const matches = ref(list?.matches ?? false)
  const onChange = (event: MediaQueryListEvent) => (matches.value = event.matches)
  list?.addEventListener('change', onChange)
  onScopeDispose(() => list?.removeEventListener('change', onChange))
  return matches
}
