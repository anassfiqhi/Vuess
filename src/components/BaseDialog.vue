<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, useId, useTemplateRef, watch } from 'vue'

/**
 * Modal built on the native <dialog>: showModal() makes the rest of the page
 * inert and handles Escape; we restore focus to the opener on close.
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    /** Whether Escape / backdrop click may dismiss the dialog. */
    dismissible?: boolean
    size?: 'sm' | 'md'
  }>(),
  { dismissible: true, size: 'md' },
)
const emit = defineEmits<{ cancel: [] }>()

const dialogEl = useTemplateRef<HTMLDialogElement>('dialog')
const titleId = useId()
let opener: HTMLElement | null = null

function show(): void {
  const el = dialogEl.value
  if (!el || el.open) return
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  if (typeof el.showModal === 'function') el.showModal()
  else el.setAttribute('open', '')
  void nextTick(() => {
    const preferred = el.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
    preferred?.focus()
  })
}

function hide(): void {
  const el = dialogEl.value
  if (!el?.open) return
  if (typeof el.close === 'function') el.close()
  else el.removeAttribute('open')
  if (opener?.isConnected) opener.focus()
  opener = null
}

watch(
  () => props.open,
  (open) => (open ? show() : hide()),
)
onMounted(() => {
  if (props.open) show()
})
onBeforeUnmount(hide)

function onCancel(event: Event): void {
  event.preventDefault() // keep the dialog under Vue's control
  if (props.dismissible) emit('cancel')
}

function onBackdropClick(event: MouseEvent): void {
  if (props.dismissible && event.target === dialogEl.value) emit('cancel')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="dialog"
    :class="`dialog--${size}`"
    :aria-labelledby="titleId"
    @cancel="onCancel"
    @click="onBackdropClick"
  >
    <div class="dialog__panel">
      <header class="dialog__header">
        <h2 :id="titleId" class="dialog__title">{{ title }}</h2>
        <button v-if="dismissible" type="button" class="icon-button" aria-label="Close" @click="emit('cancel')">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
        </button>
      </header>
      <slot />
      <footer v-if="$slots.actions" class="dialog__actions">
        <slot name="actions" />
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  padding: 0;
  border: none;
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-dialog);
  width: min(100% - 2rem, 30rem);
  max-height: min(100% - 2rem, 44rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.dialog--sm {
  width: min(100% - 2rem, 22rem);
}
.dialog::backdrop {
  background: rgb(10 12 16 / 0.55);
}
.dialog[open] {
  animation: dialog-in var(--motion-ui) ease-out;
}
@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(0.5rem) scale(0.98);
  }
}
.dialog__panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
}
.dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.dialog__title {
  margin: 0;
  font-size: 1.15rem;
  color: var(--text-strong);
}
.dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
