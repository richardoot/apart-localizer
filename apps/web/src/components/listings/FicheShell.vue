<script setup lang="ts">
  import SidePanel from '@/components/ui/SidePanel.vue'

  /**
   * Lot 25 (ADR 0035) : l'enveloppe de la fiche. Sur ordinateur, une vraie
   * page sous l'en-tête de l'application (la liste reste montée, cachée,
   * pour revenir au même endroit) ; au téléphone, le panneau plein écran du
   * lot 19 (dialogue reka-ui qui couvre la barre du bas). Les deux portent le
   * même haut (`top` : ligne d'identité collée, en-tête, onglets collés) et
   * le même contenu.
   */
  defineProps<{ layout: 'page' | 'panel'; title: string }>()
  const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <SidePanel
    v-if="layout === 'panel'"
    :title="title"
    wide
    @close="emit('close')"
  >
    <template #top>
      <slot name="top" />
    </template>
    <slot />
  </SidePanel>
  <article
    v-else
    class="-mx-4 -mt-5 grid min-w-0 content-start bg-bg"
    data-testid="listing-page"
  >
    <slot name="top" />
    <div class="px-4 pt-4 pb-10 sm:px-5">
      <slot />
    </div>
  </article>
</template>
