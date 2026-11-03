import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import { createQueryClient } from './lib/query'
// Imported early to validate the environment at startup.
import './lib/supabase'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(VueQueryPlugin, { queryClient: createQueryClient() })
app.use(router)

useThemeStore().initialize()

useAuthStore()
  .initialize()
  .then(() => {
    app.mount('#app')
  })
