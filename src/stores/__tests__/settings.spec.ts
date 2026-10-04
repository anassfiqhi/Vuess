import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { DEFAULT_RULES, RULE_PRESETS } from '@/features/chess/services/gameRules'
import { SETTINGS_STORAGE_KEY, useSettingsStore } from '../settings'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('settings store: customized rules', () => {
  it('starts from the default rules and remembers a saved custom set', async () => {
    const store = useSettingsStore()
    expect(store.settings.customRules).toEqual(DEFAULT_RULES)
    store.saveCustomRules(RULE_PRESETS.strict.rules)
    await nextTick()
    setActivePinia(createPinia())
    expect(useSettingsStore().settings.customRules).toEqual(RULE_PRESETS.strict.rules)
  })

  it('fills options missing from older saved custom sets', () => {
    const partial: Record<string, unknown> = { ...RULE_PRESETS.strict.rules }
    delete partial.enPassant
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, settings: { customRules: partial } }))
    const store = useSettingsStore()
    expect(store.settings.customRules).toEqual({ ...RULE_PRESETS.strict.rules, enPassant: true })
  })

  it('falls back to the defaults when the saved custom set is invalid', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, settings: { customRules: { takebacks: 'maybe' } } }))
    expect(useSettingsStore().settings.customRules).toEqual(DEFAULT_RULES)
  })
})
