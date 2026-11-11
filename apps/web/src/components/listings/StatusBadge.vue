<script setup lang="ts">
  import type { ListingStatus } from '@apart/contracts'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'
  import type { Tone } from '@/lib/ui'

  defineProps<{ status: ListingStatus }>()
  /** Lot 22 : le statut en pastille commune ; écartée ou vendue, barrée. */
  const TONES: Record<ListingStatus, Tone> = {
    to_study: 'neutral',
    to_visit: 'accent',
    visited: 'accent',
    offer_made: 'good',
    offer_accepted: 'good',
    offer_refused: 'bad',
    discarded: 'neutral',
    sold_or_withdrawn: 'neutral',
  }
</script>

<template>
  <UiBadge
    :tone="TONES[status]"
    :class="
      status === 'discarded' || status === 'sold_or_withdrawn'
        ? 'line-through'
        : ''
    "
  >
    {{ LISTING_STATUS_LABELS[status] }}
  </UiBadge>
</template>
