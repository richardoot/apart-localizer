<script setup lang="ts">
  import type { RentalVerdict } from '@apart/contracts'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import { RENTAL_VERDICT_LABELS } from '@/lib/labels'
  import type { Tone } from '@/lib/ui'

  defineProps<{ verdict: RentalVerdict }>()
  /** Lot 22 : la louabilité en pastille commune. */
  const TONES: Record<RentalVerdict, Tone> = {
    compatible: 'good',
    conditional: 'warn',
    incompatible: 'bad',
  }
</script>

<template>
  <UiBadge :tone="TONES[verdict]">
    {{ RENTAL_VERDICT_LABELS[verdict] }}
  </UiBadge>
</template>
