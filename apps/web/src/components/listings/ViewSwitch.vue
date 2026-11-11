<script setup lang="ts">
  import { computed } from 'vue'
  import type { ListingView } from '@/stores/filters'
  import UiSegmented from '@/components/ui/UiSegmented.vue'

  /**
   * Lot 21 : Liste, Cartes, Carte. Lot 26 : le tableau complet entre dans le
   * choix (sur ordinateur) : il est allumé quand il est affiché ; au
   * téléphone, trop large, il n'est pas proposé.
   */
  const props = withDefaults(defineProps<{ withTable?: boolean }>(), {
    withTable: true,
  })
  const view = defineModel<ListingView>({ required: true })
  const options = computed<Array<{ value: ListingView; label: string }>>(() => [
    { value: 'list', label: 'Liste' },
    { value: 'cards', label: 'Cartes' },
    { value: 'map', label: 'Carte' },
    ...(props.withTable
      ? [{ value: 'table' as ListingView, label: 'Tableau' }]
      : []),
  ])
</script>

<template>
  <UiSegmented
    v-model="view"
    :options="options"
    label="Affichage"
    data-testid="view-switch"
  />
</template>
