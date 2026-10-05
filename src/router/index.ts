import { createRouter, createWebHistory } from 'vue-router'
import GameView from '@/views/GameView.vue'

export const routes = [
  { path: '/', name: 'game', component: GameView, meta: { title: 'Play', fill: true } },
  { path: '/online', name: 'online', component: () => import('@/views/OnlineLobbyView.vue'), meta: { title: 'Online' } },
  {
    path: '/online/:gameId',
    name: 'online-game',
    component: () => import('@/views/OnlineGameView.vue'),
    meta: { title: 'Online game', fill: true },
  },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: 'Settings' } },
  { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue'), meta: { title: 'Rules & help' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title && to.name !== 'game' ? `${title} · Vuess` : 'Vuess'
})
