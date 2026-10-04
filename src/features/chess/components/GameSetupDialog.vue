<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseDialog from '@/components/BaseDialog.vue'
import RulesList from './RulesList.vue'
import { TIME_CONTROL_PRESETS } from '../services/clock'
import { CUSTOM_RULES_INFO, DEFAULT_PRESET, RULE_OPTIONS, RULE_PRESETS, RULES_CHOICES } from '../services/gameRules'
import type { GameSetup } from '../stores/game'
import type { GameRules, RulesChoice } from '../types'

const props = defineProps<{
  open: boolean
  defaults: GameSetup
  /** The saved rule set behind the "Customized rules" choice. */
  customRules: GameRules
  replacing?: boolean
}>()
const emit = defineEmits<{ start: [setup: GameSetup]; cancel: [] }>()

const whiteName = ref('')
const blackName = ref('')
const presetId = ref('untimed')
const rulesChoice = ref<RulesChoice>(DEFAULT_PRESET)
/** Working copy of the custom set; only saved when a game starts with it. */
const customDraft = ref<GameRules>({ ...props.customRules })

const chessOptions = RULE_OPTIONS.filter((o) => o.group === 'chess')
const helperOptions = RULE_OPTIONS.filter((o) => o.group === 'helper')

const choiceInfo = (choice: RulesChoice) => (choice === 'custom' ? CUSTOM_RULES_INFO : RULE_PRESETS[choice])
/** The rules the game will use with the current choice. */
const chosenRules = computed<GameRules>(() =>
  rulesChoice.value === 'custom' ? customDraft.value : RULE_PRESETS[rulesChoice.value].rules,
)

function reset(): void {
  whiteName.value = props.defaults.whiteName
  blackName.value = props.defaults.blackName
  // Every new game starts on the default choice; the custom set keeps its saved values.
  rulesChoice.value = DEFAULT_PRESET
  customDraft.value = { ...props.customRules }
  const tc = props.defaults.timeControl
  presetId.value =
    TIME_CONTROL_PRESETS.find(
      (p) => p.control?.initialMs === tc?.initialMs && p.control?.incrementMs === tc?.incrementMs,
    )?.id ?? 'untimed'
}
watch(
  () => props.open,
  (open) => open && reset(),
  { immediate: true },
)

function submit(): void {
  const preset = TIME_CONTROL_PRESETS.find((p) => p.id === presetId.value)
  emit('start', {
    whiteName: whiteName.value.trim(),
    blackName: blackName.value.trim(),
    timeControl: preset?.control ? { ...preset.control } : null,
    rulesChoice: rulesChoice.value,
    rules: { ...chosenRules.value },
  })
}
</script>

<template>
  <BaseDialog :open="open" title="New game" @cancel="emit('cancel')">
    <p v-if="replacing" class="notice notice--info">Starting a new game replaces the game in progress.</p>
    <form id="setup-form" class="form" @submit.prevent="submit">
      <div class="field-row">
        <label class="field">
          <span>White player</span>
          <input v-model="whiteName" name="white" maxlength="40" placeholder="White" autocomplete="off" data-autofocus>
        </label>
        <label class="field">
          <span>Black player</span>
          <input v-model="blackName" name="black" maxlength="40" placeholder="Black" autocomplete="off">
        </label>
      </div>

      <fieldset class="field">
        <legend>Time control</legend>
        <div class="presets">
          <label v-for="preset in TIME_CONTROL_PRESETS" :key="preset.id" class="preset">
            <input v-model="presetId" type="radio" name="time-control" :value="preset.id">
            <span>{{ preset.label }}</span>
          </label>
        </div>
        <p class="muted small">Clocks start after the first move and pause if you close the app.</p>
      </fieldset>

      <fieldset class="field">
        <legend>Rules</legend>
        <div class="rule-presets">
          <label v-for="choice in RULES_CHOICES" :key="choice" class="preset rule-preset">
            <input v-model="rulesChoice" type="radio" name="rules-choice" :value="choice">
            <span>
              <strong>{{ choiceInfo(choice).label }}</strong>
              <span v-if="choice === DEFAULT_PRESET" class="badge-default">Default</span>
              <span class="muted small rule-preset__desc">{{ choiceInfo(choice).description }}</span>
            </span>
          </label>
        </div>

        <div v-if="rulesChoice === 'custom'" class="customize" data-testid="custom-rules">
          <div class="options">
            <h3 class="options__heading">Chess rules</h3>
            <label v-for="option in chessOptions" :key="option.key" class="option">
              <input v-model="customDraft[option.key]" type="checkbox" :name="option.key">
              <span>
                {{ option.label }}
                <span class="muted small option__hint">{{ option.hint }}</span>
              </span>
            </label>
            <fieldset class="option option--group">
              <legend>Repetition and fifty-move draws</legend>
              <label class="option__radio">
                <input v-model="customDraft.drawClaims" type="radio" name="draw-claims" value="automatic">
                End the game automatically
              </label>
              <label class="option__radio">
                <input v-model="customDraft.drawClaims" type="radio" name="draw-claims" value="claim">
                A player must claim the draw
              </label>
              <span class="muted small option__hint">
                Fivefold repetition and the 75-move rule always end the game.
              </span>
            </fieldset>
            <h3 class="options__heading">Helpers</h3>
            <label v-for="option in helperOptions" :key="option.key" class="option">
              <input v-model="customDraft[option.key]" type="checkbox" :name="option.key">
              <span>
                {{ option.label }}
                <span class="muted small option__hint">{{ option.hint }}</span>
              </span>
            </label>
          </div>
        </div>
        <details v-else class="customize included">
          <summary>What {{ choiceInfo(rulesChoice).label }} includes</summary>
          <RulesList class="included__list" :rules="chosenRules" />
        </details>
        <p class="muted small">Rules are fixed once the game starts.</p>
      </fieldset>
    </form>
    <template #actions>
      <button type="button" class="button" @click="emit('cancel')">Cancel</button>
      <button type="submit" form="setup-form" class="button button--primary">Start game</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.form {
  display: grid;
  gap: 1rem;
}
.field-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.75rem;
}
.presets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
  gap: 0.4rem;
}
.preset {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.preset:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.preset input,
.option input {
  accent-color: var(--accent);
}
.rule-presets {
  display: grid;
  gap: 0.4rem;
}
.rule-preset {
  align-items: flex-start;
}
.rule-preset input {
  margin-top: 0.25rem;
}
.badge-default {
  margin-left: 0.4rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 0.7rem;
  font-weight: 600;
  vertical-align: middle;
}
.rule-preset__desc {
  display: block;
}
.customize {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem;
}
.customize summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-strong);
}
.options {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.65rem;
}
.option {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  cursor: pointer;
}
.option input {
  margin-top: 0.2rem;
  width: 1rem;
  height: 1rem;
}
.included__list {
  margin-top: 0.6rem;
}
.options__heading {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.options__heading:first-child {
  margin-top: 0;
}
.option__hint {
  display: block;
}
.option--group {
  display: grid;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  border: none;
  cursor: default;
}
.option--group legend {
  padding: 0;
  margin-bottom: 0.2rem;
}
.option__radio {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}
</style>
