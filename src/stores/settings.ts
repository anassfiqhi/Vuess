import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { readRaw, removeRaw, writeRaw } from '@/features/chess/services/storage'
import { DEFAULT_RULES, isRules } from '@/features/chess/services/gameRules'
import type { GameRules, PieceColor } from '@/features/chess/types'

export type BoardTheme = 'walnut' | 'slate' | 'meadow'
export type AnimationPreference = 'system' | 'on' | 'off'

export interface Settings {
  boardTheme: BoardTheme
  soundEnabled: boolean
  animations: AnimationPreference
  showCoordinates: boolean
  orientation: PieceColor
  /** The player's own rule set for the "Customized rules" choice. */
  customRules: GameRules
}

export const SETTINGS_STORAGE_KEY = 'vuess.settings'
const SETTINGS_VERSION = 1

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  boardTheme: 'walnut',
  soundEnabled: false,
  animations: 'system',
  showCoordinates: true,
  orientation: 'w',
  customRules: DEFAULT_RULES,
}

const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

/** Reads saved settings, falling back field-by-field so one bad value doesn't reset everything. */
function loadSettings(): Settings {
  const raw = readRaw(SETTINGS_STORAGE_KEY)
  if (!raw.ok || raw.value === null) return { ...DEFAULT_SETTINGS, customRules: { ...DEFAULT_RULES } }
  try {
    const parsed = JSON.parse(raw.value) as { version?: unknown; settings?: Record<string, unknown> }
    if (parsed.version !== SETTINGS_VERSION || typeof parsed.settings !== 'object' || !parsed.settings) {
      return { ...DEFAULT_SETTINGS, customRules: { ...DEFAULT_RULES } }
    }
    const s = parsed.settings
    const d = DEFAULT_SETTINGS
    return {
      boardTheme: pick(s.boardTheme, ['walnut', 'slate', 'meadow'] as const, d.boardTheme),
      soundEnabled: pick(s.soundEnabled, [true, false], d.soundEnabled),
      animations: pick(s.animations, ['system', 'on', 'off'] as const, d.animations),
      showCoordinates: pick(s.showCoordinates, [true, false], d.showCoordinates),
      orientation: pick(s.orientation, ['w', 'b'] as const, d.orientation),
      // Saved custom rules may predate newer options; fill those from the defaults.
      customRules: isRules({ ...DEFAULT_RULES, ...(s.customRules as object) })
        ? { ...DEFAULT_RULES, ...(s.customRules as GameRules) }
        : { ...DEFAULT_RULES },
    }
  } catch {
    return { ...DEFAULT_SETTINGS, customRules: { ...DEFAULT_RULES } }
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>(loadSettings())

  watch(
    settings,
    (value) => {
      writeRaw(SETTINGS_STORAGE_KEY, JSON.stringify({ version: SETTINGS_VERSION, settings: value }))
    },
    { deep: true },
  )

  function flipBoard(): void {
    settings.value.orientation = settings.value.orientation === 'w' ? 'b' : 'w'
  }

  function reset(): void {
    removeRaw(SETTINGS_STORAGE_KEY)
    settings.value = { ...DEFAULT_SETTINGS, customRules: { ...DEFAULT_RULES } }
  }

  function saveCustomRules(rules: GameRules): void {
    settings.value.customRules = { ...rules }
  }

  return { settings, flipBoard, saveCustomRules, reset }
})
