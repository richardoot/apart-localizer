<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { sendVisitHeartbeat } from '@/composables/useWhatsNew'
  import { useWorkspace } from '@/composables/useWorkspace'
  import { DESKTOP_LINKS, desktopEntryOf, initialsOf } from '@/lib/navigation'
  import NotificationBell from './notifications/NotificationBell.vue'
  import AccountMenu from './nav/AccountMenu.vue'

  /**
   * Lot 23 (ADR 0033) : l'en-tête, collé en haut. Sur ordinateur : la
   * marque, cinq entrées de 44 px, la cloche et le menu du compte (qui dit
   * qui est connecté). Au téléphone, une seule ligne : la marque et le
   * membre connecté (vers « Plus ») ; la navigation est dans la barre du
   * bas. Chaque page secondaire allume l'entrée de sa page parente.
   */
  const route = useRoute()
  const { me } = useWorkspace()
  const current = computed(() => desktopEntryOf(route.name))

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
</script>

<template>
  <header
    class="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:h-auto sm:min-h-15 sm:py-2"
    data-testid="app-header"
  >
    <div class="flex min-w-0 items-center gap-4">
      <RouterLink
        to="/"
        class="inline-flex min-h-11 items-center font-display text-lg font-bold text-accent"
      >
        apart-localizer
      </RouterLink>
      <nav
        class="hidden flex-wrap gap-1 sm:flex"
        aria-label="Navigation principale"
        data-testid="desktop-nav"
      >
        <RouterLink
          v-for="link in DESKTOP_LINKS"
          :key="link.entry"
          :to="link.to"
          class="inline-flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-surface-2 hover:text-fg"
          :class="
            current === link.entry
              ? 'bg-accent-soft font-medium text-fg'
              : 'text-muted'
          "
          :aria-current="current === link.entry ? 'page' : undefined"
          :data-entry="link.entry"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </div>
    <div class="hidden items-center gap-2 sm:flex">
      <NotificationBell />
      <AccountMenu />
    </div>
    <!-- Au téléphone : qui est connecté, vers « Plus » (compte, thème, déconnexion). -->
    <RouterLink
      v-if="me"
      to="/plus"
      class="inline-flex min-h-11 min-w-0 items-center gap-2 text-sm text-muted sm:hidden"
      :aria-label="`${me.displayName} : compte et réglages`"
      data-testid="phone-who"
    >
      <span class="truncate">{{ me.displayName }}</span>
      <span
        aria-hidden="true"
        class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
        >{{ initialsOf(me.displayName) }}</span
      >
    </RouterLink>
  </header>
</template>
