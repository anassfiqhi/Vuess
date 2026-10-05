import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './style.css'
import './styles/game-layout.css'

createApp(App).use(createPinia()).use(router).mount('#app')
