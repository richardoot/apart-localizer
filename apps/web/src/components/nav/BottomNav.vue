<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import { useNotifications } from '@/composables/useNotifications'
  import { plural } from '@/lib/format'
  import { PHONE_LINKS, phoneEntryOf } from '@/lib/navigation'

  /**
   * Lot 23 (ADR 0033) : la barre du bas, au téléphone seulement (`sm:hidden`).
   * Cinq entrées de 56 px, au-dessus de la barre d'accueil de l'iPhone
   * (`safe-area-inset-bottom`). Elle s'efface quand le clavier est ouvert
   * (`hidden`) ; un panneau plein écran (fiche, nouvelle annonce) la couvre
   * et rend la page inerte ; le tri et « À trancher » n'ont pas de barre.
   * « Ajouter » ouvre la nouvelle annonce existante.
   */
  defineProps<{ hidden?: boolean }>()
  const route = useRoute()
  const current = computed(() => phoneEntryOf(route.name))
  // Même lecture que la cloche : le cache est partagé.
  const { unreadCount } = useNotifications(false, 10)
</script>

<template>
  <nav
    v-show="!hidden"
    aria-label="Navigation principale"
    class="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    data-testid="bottom-nav"
  >
    <ul class="m-0 grid h-15 list-none grid-cols-5 p-0">
      <li v-for="link in PHONE_LINKS" :key="link.entry" class="flex">
        <!-- Lot 23 : une entrée de la barre du bas (icône au-dessus du libellé), pas une recette de bouton. -->
        <RouterLink
          :to="link.to"
          class="relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium"
          :class="current === link.entry ? 'text-accent' : 'text-muted'"
          :aria-current="current === link.entry ? 'page' : undefined"
          :data-entry="link.entry"
        >
          <span
            class="flex h-7 w-12 items-center justify-center rounded-full"
            :class="current === link.entry ? 'bg-accent-soft' : ''"
          >
            <UiIcon :name="link.icon" class="size-5" />
          </span>
          <span>{{ link.label }}</span>
          <span
            v-if="link.entry === 'notifications' && unreadCount"
            class="absolute top-1 left-1/2 ml-2 min-w-5 rounded-full bg-accent px-1 text-center text-xs font-semibold text-accent-fg"
            data-testid="bottom-nav-count"
            ><span aria-hidden="true">{{
              unreadCount > 99 ? '99+' : unreadCount
            }}</span
            ><span class="sr-only">{{
              plural(unreadCount, 'non lue', 'non lues')
            }}</span></span
          >
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
