<script setup lang="ts">
  import { computed, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { useQueryClient } from '@tanstack/vue-query'
  import AppHeader from '@/components/AppHeader.vue'
  import BottomNav from '@/components/nav/BottomNav.vue'
  import InvitationBanner from '@/components/workspace/InvitationBanner.vue'
  import FeedbackHost from '@/components/ui/FeedbackHost.vue'
  import UnsavedDialog from '@/components/ui/UnsavedDialog.vue'
  import { useKeyboardOpen } from '@/composables/useKeyboardOpen'
  import { useOutbox } from '@/composables/useOutbox'
  import { useAuthStore } from '@/stores/auth'

  const auth = useAuthStore()
  const route = useRoute()
  /** Lot 23 : l'en-tête et la barre du bas, sauf sur les pages nues (tri, « À trancher », consentement). */
  const shell = computed(() => auth.isAuthenticated && !route.meta.bare)
  /** Le clavier ouvert retire la barre du bas : elle ne couvre jamais le champ. */
  const keyboard = useKeyboardOpen()
  /**
   * Lot 24 : la file des écritures en attente du mode visite repart dès la
   * connexion, sur n'importe quelle page (pas seulement dans le mode visite).
   */
  const outbox = useOutbox()
  outbox.setQueryClient(useQueryClient())
  watch(
    () => auth.user?.id ?? null,
    id => {
      if (id) void outbox.start(id)
    },
    { immediate: true }
  )
</script>

<template>
  <!--
    Lot 23 : `has-bottom-nav` et `bottom-nav-shown` (style.css) donnent la
    hauteur de la barre du bas au téléphone : la place gardée en bas de la page
    (`--bottom-nav-space`) et le décalage de ce qui est collé en bas
    (`--bottom-nav` : zone de messages, barre d'enregistrement des Hypothèses).
  -->
  <div
    class="min-h-dvh bg-bg text-fg"
    :class="[
      shell ? 'has-bottom-nav' : '',
      shell && !keyboard ? 'bottom-nav-shown' : '',
    ]"
  >
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-fg"
    >
      Aller au contenu
    </a>
    <AppHeader v-if="shell" />
    <main
      id="main"
      tabindex="-1"
      class="pb-[var(--bottom-nav-space,0px)] focus:outline-none"
    >
      <InvitationBanner v-if="shell" />
      <RouterView />
    </main>
    <BottomNav v-if="shell" :hidden="keyboard" />
    <FeedbackHost />
    <UnsavedDialog />
  </div>
</template>
