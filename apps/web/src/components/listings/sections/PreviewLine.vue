<script setup lang="ts">
  import { computed } from 'vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import { formatEuros, formatEurosPerMonth } from '@/lib/format'
  import VerdictPill from '../VerdictPill.vue'

  /**
   * Lot 19 : l'aperçu en direct d'une section en édition, sur une ligne :
   * coût tout compris, mensualité et verdict, recalculés à chaque frappe par
   * `domain` (aucun appel réseau), comme à l'enregistrement.
   */
  const editor = useListingEditor()
  const metrics = computed(
    () => editor.preview.value.evaluation?.metrics ?? null
  )
</script>

<template>
  <p
    class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-accent-soft px-3 py-2 text-sm text-fg tabular-nums"
    aria-live="polite"
    data-testid="section-preview"
  >
    <span class="font-semibold">Aperçu</span>
    <template v-if="metrics">
      <span
        >coût tout compris
        <strong data-testid="preview-total-cost">{{
          formatEuros(metrics.totalCost)
        }}</strong></span
      >
      <span aria-hidden="true">·</span>
      <span
        >mensualité
        <strong data-testid="preview-payment">{{
          formatEurosPerMonth(metrics.monthlyPayment)
        }}</strong></span
      >
      <span aria-hidden="true">·</span>
      <span class="inline-flex items-center gap-1.5"
        >verdict <VerdictPill :verdict="metrics.verdict"
      /></span>
    </template>
    <span v-else class="text-muted"
      >saisis un prix et un loyer visé pour voir les indicateurs</span
    >
  </p>
</template>
