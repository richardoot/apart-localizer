<script setup lang="ts">
  import { computed } from 'vue'
  import { installState, readInstallEnv } from '@/lib/install'
  import type { InstallEnv } from '@/lib/install'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'

  /**
   * Lot 26 (ADR 0036) : ajouter l'application à l'écran d'accueil de
   * l'iPhone. iOS ne le propose pas de lui-même : l'aide ne s'affiche que
   * dans le navigateur d'un iPhone ou d'un iPad. Dans « Plus », une ligne
   * dit qu'elle est installée ; sur la page des notifications, elle explique
   * pourquoi le push ne s'active pas dans Safari.
   */
  const props = withDefaults(
    defineProps<{
      context?: 'more' | 'notifications'
      /** L'environnement lu (tests) ; par défaut, celui du navigateur. */
      env?: InstallEnv | undefined
    }>(),
    { context: 'more', env: undefined }
  )

  const state = computed(() => installState(props.env ?? readInstallEnv()))
</script>

<template>
  <UiCard
    v-if="state === 'ios-browser'"
    :title="
      context === 'notifications'
        ? 'Sur iPhone : d’abord l’écran d’accueil'
        : 'Installer l’application sur l’iPhone'
    "
    :level="context === 'notifications' ? 'h4' : 'h2'"
    :tone="context === 'notifications' ? 'default' : 'accent'"
    data-testid="install-help"
    :data-context="context"
  >
    <p v-if="context === 'notifications'" class="mb-2 text-sm">
      Sur iPhone, les notifications ne marchent que dans l’application ouverte
      depuis l’écran d’accueil, pas dans Safari.
    </p>
    <ol class="m-0 grid list-decimal gap-1.5 pl-5 text-sm">
      <li>Ouvre ce site dans Safari.</li>
      <li>
        Touche le bouton Partager (le carré avec une flèche vers le haut ; s’il
        n’est pas visible, il est dans le menu « ••• »).
      </li>
      <li>
        Choisis « Sur l’écran d’accueil » (« Ajouter à l’écran d’accueil » selon
        la version d’iOS) ; si l’option « Ouvrir en tant qu’app web » apparaît,
        laisse-la activée ; puis « Ajouter ».
      </li>
      <li>Ouvre ensuite Apart depuis son icône.</li>
    </ol>
    <p
      v-if="context === 'more'"
      class="mt-2 text-sm text-muted"
      data-testid="install-help-push"
    >
      Les notifications sur iPhone ne marchent que depuis l’application ajoutée
      à l’écran d’accueil (iOS 16.4 ou plus récent).
    </p>
  </UiCard>
  <p
    v-else-if="state === 'installed' && context === 'more'"
    class="flex items-center gap-2 text-sm text-muted"
    data-testid="install-done"
  >
    <UiIcon name="check" class="size-4 text-good" />
    Installée sur l’écran d’accueil.
  </p>
</template>
