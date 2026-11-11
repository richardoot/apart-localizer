<script setup lang="ts">
  import {
    DialogContent,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
  } from 'reka-ui'
  import FeedbackHost from './FeedbackHost.vue'
  import UiButton from './UiButton.vue'
  import UiIcon from './UiIcon.vue'

  defineProps<{
    title: string
    /** Lot 9 : la fiche annonce s'élargit (trois colonnes sur grand écran). */
    wide?: boolean
  }>()
  const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <DialogRoot :open="true" @update:open="open => !open && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-20 bg-black/30" />
      <DialogContent
        class="fixed inset-y-0 right-0 z-30 flex w-full flex-col bg-surface pt-[env(safe-area-inset-top)] shadow-panel outline-none"
        :class="
          wide
            ? 'sm:w-[min(760px,100%)] lg:w-[min(1160px,100%)]'
            : 'sm:w-[min(640px,100%)]'
        "
        :aria-describedby="undefined"
      >
        <!--
          Lot 19 : un panneau peut fournir son propre en-tête (`top`), qui
          défile avec le contenu sur un fond de page ; il porte alors le
          titre du dialogue (DialogTitle) et son bouton de fermeture.
        -->
        <header
          v-if="!$slots.top"
          class="flex items-start justify-between gap-3 border-b border-line px-4 py-3"
        >
          <DialogTitle class="font-display text-lg font-bold">
            {{ title }}
          </DialogTitle>
          <UiButton size="icon" aria-label="Fermer" @click="emit('close')">
            <UiIcon name="close" class="size-5" />
          </UiButton>
        </header>
        <div
          v-if="$slots.top"
          class="flex-1 overflow-x-hidden overflow-y-auto bg-bg"
          data-panel-scroller
        >
          <slot name="top" />
          <div class="px-4 pt-4 pb-10 sm:px-5">
            <slot />
          </div>
        </div>
        <div v-else class="flex-1 overflow-y-auto px-4 py-4">
          <slot />
        </div>
        <footer
          v-if="$slots.footer"
          class="border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <slot name="footer" />
        </footer>
        <!--
          Lot 22 : un panneau modal rend la page inerte ; ses messages
          (« Enregistré », « Annuler ») s'affichent dans sa propre zone.
        -->
        <FeedbackHost />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
