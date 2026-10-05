import { onBeforeUnmount, watch } from 'vue'
import { useMediaQuery } from './useMediaQuery'

/**
 * Phones and portrait tablets get a full-screen game layout like the
 * Chess.com app: no page scroll, actions in a bottom bar. Keep this query in
 * sync with the "compact layout" media queries in style.css and BaseDialog.vue.
 */
export const COMPACT_LAYOUT_QUERY = '(max-width: 759px), (max-aspect-ratio: 1/1)'

/**
 * Shared by the local and online game screens (styles in styles/game-layout.css).
 * The full-screen layout has nothing to scroll, so the page is locked while it
 * is shown: no scrollbar from sub-pixel rounding, and swipes on the board cannot
 * move the page, collapse the address bar or trigger overscroll effects.
 */
export function useGameLayout() {
  const isCompact = useMediaQuery(COMPACT_LAYOUT_QUERY)
  watch(isCompact, (compact) => document.documentElement.classList.toggle('page-locked', compact), { immediate: true })
  onBeforeUnmount(() => document.documentElement.classList.remove('page-locked'))
  return isCompact
}
