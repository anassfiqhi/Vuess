<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SettingsPanel from '@/features/chess/components/SettingsPanel.vue'
import { DEFAULT_PRESET, DEFAULT_RULES } from '@/features/chess/services/gameRules'
import { useGameStore } from '@/features/chess/stores/game'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)
const game = useGameStore()

const confirmReset = ref(false)
const resetDone = ref('')

function resetEverything(): void {
  settingsStore.reset()
  game.startGame({
    whiteName: '',
    blackName: '',
    timeControl: null,
    rulesChoice: DEFAULT_PRESET,
    rules: DEFAULT_RULES,
    opponent: { kind: 'person' },
  })
  confirmReset.value = false
  resetDone.value = 'Saved game and preferences were cleared.'
}
</script>

<template>
  <div class="page" :class="`board-theme--${settings.boardTheme}`">
    <h1>Settings</h1>
    <p class="muted">Preferences are saved in this browser and apply immediately.</p>
    <section class="card">
      <SettingsPanel v-model="settings" />
    </section>
    <section class="card">
      <h2>Saved data</h2>
      <p class="muted">
        The current game and these preferences are stored locally in this browser. Nothing is sent to a server.
      </p>
      <button type="button" class="button button--danger" @click="confirmReset = true">Reset game and preferences</button>
      <p class="muted small" role="status">{{ resetDone }}</p>
    </section>
    <ConfirmDialog
      :open="confirmReset"
      title="Reset everything?"
      message="This discards the current game and restores default preferences."
      confirm-label="Reset"
      danger
      @confirm="resetEverything"
      @cancel="confirmReset = false"
    />
  </div>
</template>
