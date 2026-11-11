<script setup lang="ts">
  import type { ListingView } from '@/stores/filters'
  import UiSegmented from '@/components/ui/UiSegmented.vue'

  /** Lot 21 : Liste, Cartes, Carte (le tableau complet s'ouvre depuis les filtres). */
  const view = defineModel<ListingView>({ required: true })
  const options: Array<{ value: ListingView; label: string }> = [
    { value: 'list', label: 'Liste' },
    { value: 'cards', label: 'Cartes' },
    { value: 'map', label: 'Carte' },
  ]
</script>

<template>
  <UiSegmented
    v-model="view"
    :options="options"
    label="Affichage"
    data-testid="view-switch"
  />
</template>
