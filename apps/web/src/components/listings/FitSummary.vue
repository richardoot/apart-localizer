<script setup lang="ts">
  import { computed } from 'vue'
  import type { ListingCriteriaFit } from '@apart/contracts'
  import { fitReasonsText, fitSinceText, keptLabel } from '@apart/domain'
  import FitBadge from './FitBadge.vue'

  /**
   * L'adéquation d'une annonce dans une liste (lot 14) : la pastille, la
   * raison dessous (le critère quand elle est dans les critères), la mention
   * « Gardée dans la liste » d'une annonce hors critères avec une offre en
   * cours ou une visite prévue, et, dans l'onglet « Hors critères », depuis
   * quand. Rien sans critère actif.
   */
  const props = withDefaults(
    defineProps<{
      fit: ListingCriteriaFit
      /** Montre « depuis » (onglet « Hors critères »). */
      since?: boolean
      /** Sans la mention « gardée » (déjà dite ailleurs). */
      hideKept?: boolean
      /** Lot 25 : sans la pastille (les jugements étiquetés la montrent déjà). */
      badge?: boolean
    }>(),
    { since: false, hideKept: false, badge: true }
  )

  const reason = computed(() =>
    props.fit.level === 'in'
      ? (props.fit.name ?? '')
      : fitReasonsText(props.fit.reasons)
  )
  const sinceText = computed(() =>
    fitSinceText(props.fit.since, props.fit.origin)
  )
</script>

<template>
  <div
    v-if="fit.activeCriteria > 0"
    class="grid w-60 max-w-full gap-0.5 whitespace-normal"
    data-testid="fit-summary"
  >
    <FitBadge v-if="badge" :level="fit.level" />
    <span v-if="reason" class="text-xs text-muted" data-testid="fit-reason">{{
      reason
    }}</span>
    <span
      v-if="fit.kept && !hideKept"
      class="text-xs font-medium text-fg"
      data-testid="fit-kept"
      >{{ keptLabel(fit.kept) }}</span
    >
    <span
      v-if="since && fit.level === 'out'"
      class="text-xs text-muted"
      data-testid="fit-since"
      >{{ sinceText }}</span
    >
  </div>
</template>
