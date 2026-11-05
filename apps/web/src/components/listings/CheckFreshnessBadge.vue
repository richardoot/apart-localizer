<script setup lang="ts">
  import { computed } from 'vue'
  import type { Listing, ListingCheckOutcome } from '@apart/contracts'
  import { checkFreshness } from '@apart/domain'

  /**
   * Lot 15 : la mention discrète de la liste, « Vérifiée il y a 3 j » ou
   * « À revérifier » (règle de `domain`, 7 jours). Rien pour une annonce
   * récente jamais revérifiée.
   */
  const props = defineProps<{
    listing: Pick<Listing, 'status' | 'lastCheckedAt' | 'createdAt'>
    /** Le dernier résultat : une page inaccessible n'est pas « vérifiée ». */
    lastOutcome?: ListingCheckOutcome | null
  }>()

  const freshness = computed(() =>
    checkFreshness(
      props.listing,
      new Date(),
      undefined,
      props.lastOutcome ?? null
    )
  )
</script>

<template>
  <span
    v-if="freshness.label"
    class="text-xs whitespace-nowrap"
    :class="freshness.stale ? 'font-medium text-warn' : 'text-muted'"
    :title="freshness.title"
    :data-stale="freshness.stale"
    data-testid="check-freshness"
    >{{ freshness.label }}</span
  >
</template>
