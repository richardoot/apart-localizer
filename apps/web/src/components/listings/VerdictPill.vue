<script setup lang="ts">
  import type { Verdict } from '@apart/contracts'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import { VERDICT_LABELS } from '@/lib/labels'
  import type { Tone } from '@/lib/ui'

  defineProps<{ verdict: Verdict }>()
  /** Lot 22 : le verdict en pastille commune, dans le ton de ses jetons. */
  const TONES: Record<Verdict, Tone> = {
    target: 'good',
    to_dig: 'warn',
    off_target: 'bad',
  }
</script>

<template>
  <UiBadge :tone="TONES[verdict]" :data-verdict="verdict">
    {{ VERDICT_LABELS[verdict] }}
  </UiBadge>
</template>
