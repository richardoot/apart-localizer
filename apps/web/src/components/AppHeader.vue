<script setup lang="ts">
  import { onBeforeUnmount, onMounted } from 'vue'
  import { sendVisitHeartbeat } from '@/composables/useWhatsNew'
  import { useAuthStore } from '@/stores/auth'
  import { useThemeStore } from '@/stores/theme'
  import NotificationBell from './notifications/NotificationBell.vue'
  import ThemeToggle from './ThemeToggle.vue'

  const auth = useAuthStore()
  const theme = useThemeStore()

  const links = [
    { to: '/', label: 'Synthèse' },
    { to: '/annonces', label: 'Annonces' },
    { to: '/criteres', label: 'Critères' },
    { to: '/hypotheses', label: 'Hypothèses' },
    { to: '/activite', label: 'Activité' },
    { to: '/espace', label: 'Espace' },
  ]

  // « Ce qui a changé » : une visite au chargement, puis au retour sur l'onglet.
  function onVisible(): void {
    if (document.visibilityState === 'visible') void sendVisitHeartbeat()
  }
  onMounted(() => {
    void sendVisitHeartbeat()
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() =>
    document.removeEventListener('visibilitychange', onVisible)
  )

  async function signOut(): Promise<void> {
    await auth.signOut()
  }
</script>

<template>
  <header
    class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2"
  >
    <div class="flex items-center gap-4">
      <RouterLink to="/" class="font-display text-lg font-bold text-accent">
        apart-localizer
      </RouterLink>
      <nav class="flex flex-wrap gap-1" aria-label="Navigation principale">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"
          active-class="bg-accent-soft text-fg"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </div>
    <div class="flex items-center gap-2">
      <NotificationBell />
      <ThemeToggle :is-dark="theme.isDark" @toggle="theme.toggle()" />
      <button
        type="button"
        class="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"
        @click="signOut"
      >
        Se déconnecter
      </button>
    </div>
  </header>
</template>
