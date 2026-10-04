<script setup lang="ts">
import { RULE_OPTIONS } from '../services/gameRules'
import type { GameRules } from '../types'

/** Read-only on/off list of a rule set, grouped into chess rules and helpers. */
defineProps<{ rules: GameRules }>()

const chessOptions = RULE_OPTIONS.filter((o) => o.group === 'chess')
const helperOptions = RULE_OPTIONS.filter((o) => o.group === 'helper')
</script>

<template>
  <div class="rules-list">
    <p class="rules-list__heading">Chess rules</p>
    <ul>
      <li v-for="option in chessOptions" :key="option.key">
        <span class="state" :class="{ 'state--on': rules[option.key] }">{{ rules[option.key] ? 'On' : 'Off' }}</span>
        {{ option.label }}
      </li>
      <li>
        <span class="state state--on">{{ rules.drawClaims === 'claim' ? 'Claim' : 'Auto' }}</span>
        Repetition and fifty-move draws
      </li>
    </ul>
    <p class="rules-list__heading">Helpers</p>
    <ul>
      <li v-for="option in helperOptions" :key="option.key">
        <span class="state" :class="{ 'state--on': rules[option.key] }">{{ rules[option.key] ? 'On' : 'Off' }}</span>
        {{ option.label }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.rules-list {
  font-size: 0.85rem;
}
.rules-list__heading {
  margin: 0.5rem 0 0.2rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.rules-list__heading:first-child {
  margin-top: 0;
}
ul {
  display: grid;
  gap: 0.2rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.state {
  display: inline-block;
  min-width: 3rem;
  margin-right: 0.35rem;
  padding: 0 0.3rem;
  border-radius: 4px;
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
}
.state--on {
  background: var(--accent-soft);
  color: var(--accent-strong);
}
</style>
