<script setup lang="ts">
export type IconName =
  | 'plus'
  | 'undo'
  | 'redo'
  | 'flip'
  | 'flag'
  | 'handshake'
  | 'pause'
  | 'play'
  | 'file'
  | 'first'
  | 'prev'
  | 'next'
  | 'last'
  | 'settings'
  | 'info'

const PATHS: Record<IconName, string> = {
  plus: 'M10 4v12M4 10h12',
  undo: 'M7 5L3 9l4 4M3 9h9a5 5 0 010 10h-2',
  redo: 'M13 5l4 4-4 4M17 9H8a5 5 0 000 10h2',
  flip: 'M6 3v13m0 0l-3-3m3 3l3-3M14 17V4m0 0l-3 3m3-3l3 3',
  flag: 'M5 18V3m0 1h10l-2 4 2 4H5',
  handshake: 'M2 9l4-4 4 3 4-3 4 4-6 6-2-2-2 2zM8 11l2 2',
  pause: 'M7 4v12M13 4v12',
  play: 'M6 4l10 6-10 6z',
  file: 'M5 2h7l4 4v12H5zM12 2v4h4M8 11h5M8 14h5',
  first: 'M5 4v12M15 4l-6 6 6 6',
  prev: 'M12 4l-6 6 6 6',
  next: 'M8 4l6 6-6 6',
  last: 'M15 4v12M5 4l6 6-6 6',
  settings: 'M10 7a3 3 0 110 6 3 3 0 010-6zM10 1v3M10 16v3M1 10h3M16 10h3M3.6 3.6l2.1 2.1M14.3 14.3l2.1 2.1M3.6 16.4l2.1-2.1M14.3 5.7l2.1-2.1',
  info: 'M10 2a8 8 0 110 16 8 8 0 010-16zM10 9v5M10 6v.5',
}

defineProps<{ name: IconName }>()
</script>

<template>
  <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path :d="PATHS[name]" />
  </svg>
</template>
