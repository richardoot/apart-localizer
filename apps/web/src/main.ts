import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useBaseMapStore } from './stores/base-map'
import { useThemeStore } from './stores/theme'
import { createQueryClient } from './lib/query'
import { installSentry, setSentryUser } from './lib/sentry'
// Imported early to validate the environment at startup.
import './lib/supabase'
import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(VueQueryPlugin, { queryClient: createQueryClient() })

// Avant le routeur, pour que la première navigation soit tracée. Sans DSN,
// ne fait rien.
installSentry(app, router)
app.use(router)

useThemeStore().initialize()

const auth = useAuthStore()
const baseMap = useBaseMapStore()
watch(
  () => auth.user?.id,
  id => {
    setSentryUser(id)
    // Le fond de carte de cette personne sur cet appareil (lot 10).
    baseMap.load(id)
  },
  { immediate: true }
)

auth.initialize().then(() => {
  app.mount('#app')
})
