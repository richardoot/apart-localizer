import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useBaseMapStore } from './stores/base-map'
import { useThemeStore } from './stores/theme'
import { useFeedbackStore } from './stores/feedback'
import { useLeaveGuardStore } from './stores/leave-guard'
import { createQueryClient } from './lib/query'
import { installSentry, setSentryUser } from './lib/sentry'
import { installServiceWorker, sessionStorageOrNull } from './lib/pwa'
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

// Le service worker (PWA) : la nouvelle version, une fois active, recharge
// la page une fois (lib/pwa.ts), sauf sur une saisie en cours (lot 22).
// Pas en développement (devOptions désactivé).
if (import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) =>
    installServiceWorker({
      register: registerSW,
      storage: sessionStorageOrNull(),
      reload: () => window.location.reload(),
      now: () => Date.now(),
      setInterval: (callback, ms) => window.setInterval(callback, ms),
      // Lot 22 : jamais de rechargement sur une saisie en cours.
      canReload: () => !useLeaveGuardStore().anyDirty(),
      onDeferred: reload => {
        useFeedbackStore().notify(
          'Une nouvelle version de l’application est prête.',
          {
            tone: 'info',
            timeout: null,
            action: {
              label: 'Mettre à jour',
              run: () => useLeaveGuardStore().guard(reload),
            },
          }
        )
      },
    })
  )
}
