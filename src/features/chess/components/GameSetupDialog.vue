<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseDialog from '@/components/BaseDialog.vue'
import RulesList from './RulesList.vue'
import { TIME_CONTROL_PRESETS } from '../services/clock'
import { DEFAULT_ENGINE_LEVEL, ENGINE_LEVELS, computerPlayerName } from '../services/engine/levels'
import { CUSTOM_RULES_INFO, DEFAULT_PRESET, RULE_OPTIONS, RULE_PRESETS, RULES_CHOICES } from '../services/gameRules'
import type { GameSetup } from '../stores/game'
import type { EngineLevel, GameRules, PieceColor, RulesChoice, TimeControl } from '../types'

const props = defineProps<{
  open: boolean
  defaults: GameSetup
  /** The saved rule set behind the "Customized rules" choice. */
  customRules: GameRules
  replacing?: boolean
  /** Shown when creating an online game fails (for example, the server is unreachable). */
  error?: string | null
  busy?: boolean
}>()
export interface OnlineSetup {
  name: string
  color: PieceColor | 'random'
  timeControl: TimeControl | null
}
const emit = defineEmits<{ start: [setup: GameSetup]; online: [setup: OnlineSetup]; cancel: [] }>()

type Mode = 'person' | 'computer' | 'online'
type PlayAs = PieceColor | 'random'

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'person', label: 'Play in person', hint: 'Two players on this device' },
  { id: 'computer', label: 'Computer', hint: 'Play against Stockfish' },
  { id: 'online', label: 'Online', hint: 'Play a friend by link' },
]
const PLAY_AS: { id: PlayAs; label: string }[] = [
  { id: 'w', label: 'White' },
  { id: 'random', label: 'Random' },
  { id: 'b', label: 'Black' },
]

const mode = ref<Mode>('person')
const whiteName = ref('')
const blackName = ref('')
const yourName = ref('')
const playAs = ref<PlayAs>('w')
const level = ref<EngineLevel>(DEFAULT_ENGINE_LEVEL)
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
  const opponent = props.defaults.opponent
  // Reopen on the kind of game that was played last.
  mode.value = opponent.kind
  if (opponent.kind === 'computer') {
    const human: PieceColor = opponent.color === 'w' ? 'b' : 'w'
    yourName.value = human === 'w' ? props.defaults.whiteName : props.defaults.blackName
    playAs.value = human
    level.value = opponent.level
    whiteName.value = ''
    blackName.value = ''
  } else {
    whiteName.value = props.defaults.whiteName
    blackName.value = props.defaults.blackName
    yourName.value = props.defaults.whiteName
    playAs.value = 'w'
    level.value = DEFAULT_ENGINE_LEVEL
  }
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
  const common = {
    timeControl: preset?.control ? { ...preset.control } : null,
    rulesChoice: rulesChoice.value,
    rules: { ...chosenRules.value },
  }
  if (mode.value === 'online') {
    emit('online', { name: yourName.value.trim(), color: playAs.value, timeControl: common.timeControl })
    return
  }
  if (mode.value === 'computer') {
    const human: PieceColor = playAs.value === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : playAs.value
    const computer: PieceColor = human === 'w' ? 'b' : 'w'
    const names = { [human]: yourName.value.trim() || 'You', [computer]: computerPlayerName(level.value) } as Record<PieceColor, string>
    emit('start', {
      ...common,
      whiteName: names.w,
      blackName: names.b,
      opponent: { kind: 'computer', color: computer, level: level.value },
    })
  } else {
    emit('start', {
      ...common,
      whiteName: whiteName.value.trim(),
      blackName: blackName.value.trim(),
      opponent: { kind: 'person' },
    })
  }
}
</script>

<template>
  <BaseDialog :open="open" title="New game" @cancel="emit('cancel')">
    <p v-if="replacing" class="notice notice--info">Starting a new game replaces the game in progress.</p>
    <form id="setup-form" class="form" @submit.prevent="submit">
      <div class="modes" role="radiogroup" aria-label="Opponent">
        <label v-for="m in MODES" :key="m.id" class="preset mode">
          <input v-model="mode" type="radio" name="mode" :value="m.id">
          <span>
            <strong>{{ m.label }}</strong>
            <span class="muted small mode__hint">{{ m.hint }}</span>
          </span>
        </label>
      </div>

      <div v-if="mode === 'person'" class="field-row">
        <label class="field">
          <span>White player</span>
          <input v-model="whiteName" name="white" maxlength="40" placeholder="White" autocomplete="off" data-autofocus>
        </label>
        <label class="field">
          <span>Black player</span>
          <input v-model="blackName" name="black" maxlength="40" placeholder="Black" autocomplete="off">
        </label>
      </div>

      <template v-else>
        <label class="field">
          <span>Your name</span>
          <input v-model="yourName" name="your-name" maxlength="40" placeholder="You" autocomplete="off" data-autofocus>
        </label>
        <fieldset class="field">
          <legend>Play as</legend>
          <div class="presets presets--three">
            <label v-for="option in PLAY_AS" :key="option.id" class="preset">
              <input v-model="playAs" type="radio" name="play-as" :value="option.id">
              <span>{{ option.label }}</span>
            </label>
          </div>
        </fieldset>
        <fieldset v-if="mode === 'computer'" class="field">
          <legend>Computer level</legend>
          <div class="levels">
            <label v-for="option in ENGINE_LEVELS" :key="option.level" class="preset level">
              <input v-model="level" type="radio" name="level" :value="option.level" :aria-label="`Level ${option.level}, ${option.label}`">
              <span class="level__number" aria-hidden="true">{{ option.level }}</span>
              <span class="level__label muted small" aria-hidden="true">{{ option.label }}</span>
            </label>
          </div>
        </fieldset>
      </template>

      <fieldset class="field">
        <legend>Time control</legend>
        <div class="presets">
          <label v-for="preset in TIME_CONTROL_PRESETS" :key="preset.id" class="preset">
            <input v-model="presetId" type="radio" name="time-control" :value="preset.id">
            <span>{{ preset.label }}</span>
          </label>
        </div>
        <p class="muted small">
          Clocks start after the first move{{ mode === 'online' ? ' and are kept by the server' : ' and pause if you close the app' }}.
        </p>
      </fieldset>

      <p v-if="mode === 'online'" class="muted small">
        Online games use Chess.com style rules: no takebacks, and draws by repetition or fifty moves are automatic.
        You will get a link to send to your opponent.
      </p>
      <fieldset v-else class="field">
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
      <p v-if="error" class="error setup-error" role="alert">{{ error }}</p>
      <button type="submit" form="setup-form" class="button button--primary" :disabled="busy">
        {{ mode === 'online' ? (busy ? 'Creating…' : 'Create online game') : 'Start game' }}
      </button>
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
.setup-error {
  flex-basis: 100%;
}
.modes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: 0.4rem;
}
.mode {
  align-items: flex-start;
}
.mode input {
  margin-top: 0.25rem;
}
.mode__hint {
  display: block;
}
.presets--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.levels {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
}
.level {
  position: relative;
  flex-direction: column;
  gap: 0;
  padding: 0.4rem 0.25rem;
  text-align: center;
}
/* The whole tile is the radio; keep the native input for keyboard and screen readers. */
.level input {
  position: absolute;
  opacity: 0;
  inset: 0;
  margin: 0;
  cursor: pointer;
}
.level:has(input:focus-visible) {
  outline: 3px solid var(--focus-ring);
  outline-offset: 1px;
}
.level__number {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-strong);
}
.level__label {
  font-size: 0.7rem;
  white-space: nowrap;
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
