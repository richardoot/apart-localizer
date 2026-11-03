<script setup lang="ts">
  import type { ListingView } from '@/stores/filters'

  const view = defineModel<ListingView>({ required: true })
  const options: Array<{ value: ListingView; label: string }> = [
    { value: 'table', label: 'Tableau' },
    { value: 'cards', label: 'Cartes' },
    { value: 'map', label: 'Carte' },
  ]
</script>

<template>
  <div
    class="inline-flex rounded-lg border border-line bg-surface p-0.5"
    role="tablist"
    aria-label="Affichage"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      class="rounded-md px-3 py-1 text-sm"
      :class="
        view === option.value
          ? 'bg-accent text-accent-fg'
          : 'text-muted hover:text-fg'
      "
      :aria-selected="view === option.value"
      @click="view = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
