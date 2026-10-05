<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { TIME_CONTROL_PRESETS } from '@/features/chess/services/clock'
import type { PieceColor } from '@/features/chess/types'
import { ONLINE_SERVER_URL } from '@/features/online/services/connection'
import { parseGameReference } from '@/features/online/services/gameLink'
import { useOnlineStore } from '@/features/online/stores/online'

const router = useRouter()
const online = useOnlineStore()
const { busy, game, gameId, playerName } = storeToRefs(online)

const name = ref(playerName.value)
const presetId = ref('10+5')
const playAs = ref<PieceColor | 'random'>('random')
const createError = ref<string | null>(null)
const joinText = ref('')
const joinError = ref<string | null>(null)

const PLAY_AS: { id: PieceColor | 'random'; label: string }[] = [
  { id: 'w', label: 'White' },
  { id: 'random', label: 'Random' },
  { id: 'b', label: 'Black' },
]

const currentGame = computed(() => (gameId.value && game.value && game.value.status !== 'ended' ? gameId.value : null))

async function create(): Promise<void> {
  createError.value = null
  const preset = TIME_CONTROL_PRESETS.find((p) => p.id === presetId.value)
  const result = await online.createGame({
    name: name.value,
    color: playAs.value,
    timeControl: preset?.control ? { ...preset.control } : null,
  })
  if (result.ok) await router.push(`/online/${result.value}`)
  else createError.value = `${result.error} (server: ${ONLINE_SERVER_URL})`
}

async function join(): Promise<void> {
  const id = parseGameReference(joinText.value)
  if (!id) {
    joinError.value = 'Paste the invite link or the game code you received.'
    return
  }
  joinError.value = null
  if (name.value.trim()) online.setName(name.value)
  await router.push(`/online/${id}`)
}
</script>

<template>
  <div class="page">
    <h1>Online</h1>
    <p class="muted">Play a friend over the internet. Create a game and send them the link, or join with a link you received.</p>

    <div v-if="currentGame" class="notice notice--info">
      <p>You have an online game in progress.</p>
      <RouterLink class="button button--small button--primary" :to="`/online/${currentGame}`">Return to game</RouterLink>
    </div>

    <section class="card">
      <h2>Create a game</h2>
      <form class="form" @submit.prevent="create">
        <label class="field">
          <span>Your name</span>
          <input v-model="name" name="online-name" maxlength="40" placeholder="Your name" autocomplete="nickname">
        </label>
        <fieldset class="field">
          <legend>Play as</legend>
          <div class="choices choices--three">
            <label v-for="option in PLAY_AS" :key="option.id" class="choice">
              <input v-model="playAs" type="radio" name="online-play-as" :value="option.id">
              <span>{{ option.label }}</span>
            </label>
          </div>
        </fieldset>
        <fieldset class="field">
          <legend>Time control</legend>
          <div class="choices">
            <label v-for="preset in TIME_CONTROL_PRESETS" :key="preset.id" class="choice">
              <input v-model="presetId" type="radio" name="online-time" :value="preset.id">
              <span>{{ preset.label }}</span>
            </label>
          </div>
        </fieldset>
        <p class="muted small">Online games use Chess.com style rules: no takebacks, and draws by repetition or fifty moves are automatic.</p>
        <p v-if="createError" class="error" role="alert">{{ createError }}</p>
        <div>
          <button type="submit" class="button button--primary" :disabled="busy">
            {{ busy ? 'Creating…' : 'Create game' }}
          </button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Join a game</h2>
      <form class="form" @submit.prevent="join">
        <label class="field">
          <span>Invite link or game code</span>
          <input
            v-model="joinText"
            name="join"
            placeholder="https://…/online/abc123 or abc123"
            autocomplete="off"
            :aria-invalid="!!joinError"
          >
        </label>
        <p v-if="joinError" class="error" role="alert">{{ joinError }}</p>
        <div>
          <button type="submit" class="button button--primary" :disabled="!joinText.trim()">Join</button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.form {
  display: grid;
  gap: 1rem;
}
.choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
  gap: 0.4rem;
}
.choices--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.choice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.choice:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.choice input {
  accent-color: var(--accent);
}
</style>
