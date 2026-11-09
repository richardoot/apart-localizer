<script setup lang="ts">
  import type { ListingView } from '@/stores/filters'

  /** Lot 21 : Liste, Cartes, Carte (le tableau complet s'ouvre depuis les filtres). */
  const view = defineModel<ListingView>({ required: true })
  const options: Array<{ value: ListingView; label: string }> = [
    { value: 'list', label: 'Liste' },
    { value: 'cards', label: 'Cartes' },
    { value: 'map', label: 'Carte' },
  ]
</script>

<template>
  <div
    class="inline-flex overflow-hidden rounded-[10px] border border-line bg-surface"
    role="group"
    aria-label="Affichage"
    data-testid="view-switch"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="min-h-11 px-3 text-sm"
      :class="
        view === option.value
          ? 'bg-accent text-accent-fg'
          : 'text-muted hover:text-fg'
      "
      :aria-pressed="view === option.value"
      @click="view = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
