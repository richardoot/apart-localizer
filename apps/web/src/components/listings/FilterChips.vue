<script setup lang="ts">
  import type { FilterChip } from '@apart/domain'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiChip from '@/components/ui/UiChip.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'

  /**
   * Lot 26 (ADR 0036) : les filtres actifs, visibles au-dessus de la liste,
   * une puce chacun, qu'on retire d'un geste ; « Tout effacer » ; et, quand
   * les compteurs suivent les filtres, combien l'étape en montre.
   */
  defineProps<{
    chips: readonly FilterChip[]
    /** « 1 sur 4 annonces, avec les filtres », ou null. */
    summary?: string | null
  }>()
  const emit = defineEmits<{ remove: [chip: FilterChip]; clear: [] }>()
</script>

<template>
  <section
    v-if="chips.length"
    class="flex flex-wrap items-center gap-x-2 gap-y-1.5"
    aria-label="Filtres actifs"
    data-testid="filter-chips"
  >
    <span class="text-sm font-semibold">Filtres :</span>
    <ul class="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
      <li v-for="chip in chips" :key="chip.key">
        <UiChip
          selected
          :toggle="false"
          :aria-label="`Retirer le filtre ${chip.label}`"
          :data-chip="chip.key"
          @click="emit('remove', chip)"
        >
          {{ chip.label }}
          <UiIcon name="close" class="size-4" />
        </UiChip>
      </li>
    </ul>
    <UiButton
      variant="link"
      size="sm"
      data-testid="filter-chips-clear"
      @click="emit('clear')"
    >
      Tout effacer
    </UiButton>
    <span
      v-if="summary"
      class="w-full text-sm text-muted sm:ml-auto sm:w-auto"
      data-testid="filter-chips-summary"
      >{{ summary }}</span
    >
  </section>
</template>
