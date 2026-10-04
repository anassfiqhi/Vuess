<script setup lang="ts">
import type { AnimationPreference, BoardTheme, Settings } from '@/stores/settings'

const settings = defineModel<Settings>({ required: true })

const THEMES: { id: BoardTheme; label: string }[] = [
  { id: 'walnut', label: 'Walnut' },
  { id: 'slate', label: 'Slate' },
  { id: 'meadow', label: 'Meadow' },
]
const ANIMATIONS: { id: AnimationPreference; label: string }[] = [
  { id: 'system', label: 'Follow system setting' },
  { id: 'on', label: 'Always' },
  { id: 'off', label: 'Never' },
]
</script>

<template>
  <div class="settings">
    <fieldset class="field">
      <legend>Board theme</legend>
      <div class="themes">
        <label v-for="theme in THEMES" :key="theme.id" class="theme" :class="`board-theme--${theme.id}`">
          <input v-model="settings.boardTheme" type="radio" name="board-theme" :value="theme.id">
          <span class="theme__swatch" aria-hidden="true"><span /><span /><span /><span /></span>
          <span>{{ theme.label }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset class="field">
      <legend>Animations</legend>
      <label v-for="option in ANIMATIONS" :key="option.id" class="check">
        <input v-model="settings.animations" type="radio" name="animations" :value="option.id">
        {{ option.label }}
      </label>
    </fieldset>

    <fieldset class="field">
      <legend>Board</legend>
      <label class="check">
        <input v-model="settings.showCoordinates" type="checkbox">
        Show coordinates
      </label>
      <label class="check">
        <input v-model="settings.soundEnabled" type="checkbox">
        Play move sounds
      </label>
    </fieldset>
  </div>
</template>

<style scoped>
.settings {
  display: grid;
  gap: 1.25rem;
}
.themes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.theme {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.theme:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.theme__swatch {
  display: grid;
  grid-template-columns: repeat(2, 0.7rem);
  border-radius: 3px;
  overflow: hidden;
}
.theme__swatch span {
  height: 0.7rem;
}
.theme__swatch span:nth-child(1),
.theme__swatch span:nth-child(4) {
  background: var(--board-light);
}
.theme__swatch span:nth-child(2),
.theme__swatch span:nth-child(3) {
  background: var(--board-dark);
}
.check {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.3rem 0;
  cursor: pointer;
}
.check input,
.theme input {
  accent-color: var(--accent);
  width: 1.05rem;
  height: 1.05rem;
}
</style>
