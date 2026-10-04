<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useGameRuntime } from '@/features/chess/composables/useGameRuntime'

useGameRuntime()
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="app-header">
    <RouterLink to="/" class="brand" aria-label="Vuess home">
      <svg class="brand__mark" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2" y="2" width="9" height="9" rx="2" />
        <rect x="13" y="13" width="9" height="9" rx="2" />
        <rect x="13" y="2" width="9" height="9" rx="2" class="brand__mark-alt" />
        <rect x="2" y="13" width="9" height="9" rx="2" class="brand__mark-alt" />
      </svg>
      Vuess
    </RouterLink>
    <nav class="app-nav" aria-label="Main">
      <RouterLink to="/" class="app-nav__link">Play</RouterLink>
      <RouterLink to="/settings" class="app-nav__link"><AppIcon name="settings" /><span>Settings</span></RouterLink>
      <RouterLink to="/about" class="app-nav__link"><AppIcon name="info" /><span>Help</span></RouterLink>
    </nav>
  </header>
  <main id="main" class="app-main" tabindex="-1">
    <RouterView />
  </main>
</template>
