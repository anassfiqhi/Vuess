<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseDialog from '@/components/BaseDialog.vue'
import type { Result } from '../types'

const props = defineProps<{
  open: boolean
  exportText: Result<string>
  fileName: string
  importPgn: (text: string) => Result<true>
}>()
const emit = defineEmits<{ close: []; imported: [] }>()

const importText = ref('')
const importError = ref<string | null>(null)
const copyStatus = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    importText.value = ''
    importError.value = null
    copyStatus.value = ''
  },
)

async function copy(): Promise<void> {
  if (!props.exportText.ok) return
  try {
    await navigator.clipboard.writeText(props.exportText.value)
    copyStatus.value = 'Copied to clipboard.'
  } catch {
    copyStatus.value = 'Copy failed. Select the text and copy it manually.'
  }
}

function download(): void {
  if (!props.exportText.ok) return
  const url = URL.createObjectURL(new Blob([props.exportText.value], { type: 'application/x-chess-pgn' }))
  const link = document.createElement('a')
  link.href = url
  link.download = props.fileName
  link.click()
  URL.revokeObjectURL(url)
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 500_000) {
    importError.value = 'That file is too large to be a single game.'
    return
  }
  try {
    importText.value = await file.text()
    importError.value = null
  } catch {
    importError.value = 'The file could not be read.'
  }
}

function runImport(): void {
  const result = props.importPgn(importText.value)
  if (result.ok) emit('imported')
  else importError.value = result.error
}
</script>

<template>
  <BaseDialog :open="open" title="PGN" @cancel="emit('close')">
    <section class="section" aria-labelledby="pgn-export-heading">
      <h3 id="pgn-export-heading" class="section__title">Export this game</h3>
      <template v-if="exportText.ok">
        <textarea class="pgn" :value="exportText.value" readonly rows="5" aria-label="PGN of the current game" />
        <div class="row">
          <button type="button" class="button" @click="copy">Copy</button>
          <button type="button" class="button" @click="download">Download .pgn</button>
          <span class="muted small" role="status">{{ copyStatus }}</span>
        </div>
      </template>
      <p v-else class="error" role="alert">{{ exportText.error }}</p>
    </section>

    <section class="section" aria-labelledby="pgn-import-heading">
      <h3 id="pgn-import-heading" class="section__title">Import a game</h3>
      <p class="muted small">
        Imported games are untimed. Unfinished games (result “*”) can be continued; finished games open for review.
        Your current game is replaced only if the import succeeds.
      </p>
      <textarea
        v-model="importText"
        class="pgn"
        rows="5"
        placeholder="Paste PGN here…"
        aria-label="PGN to import"
        :aria-invalid="!!importError"
        aria-describedby="pgn-import-error"
      />
      <p v-if="importError" id="pgn-import-error" class="error" role="alert">{{ importError }}</p>
      <div class="row">
        <label class="button file-button">
          Choose file…
          <input type="file" accept=".pgn,text/plain,application/x-chess-pgn" class="visually-hidden" @change="onFile">
        </label>
        <button type="button" class="button button--primary" :disabled="!importText.trim()" @click="runImport">
          Import
        </button>
      </div>
    </section>
  </BaseDialog>
</template>

<style scoped>
.section {
  display: grid;
  gap: 0.5rem;
}
.section__title {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text-strong);
}
.pgn {
  width: 100%;
  font: 0.8rem/1.4 var(--mono);
  resize: vertical;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.file-button:focus-within {
  box-shadow: 0 0 0 3px var(--focus-ring);
}
</style>
