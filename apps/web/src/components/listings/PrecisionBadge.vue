<script setup lang="ts">
  import { computed } from 'vue'
  import type { ListingLocation } from '@apart/contracts'
  import { precisionBadge } from '@apart/domain'
  import type { PrecisionTone } from '@apart/domain'

  /**
   * La pastille de précision du repère (lot 12) : « Adresse exacte », « À la
   * rue », « Au quartier (X) », « Commune seulement ». Le libellé et
   * l'explication (infobulle) viennent de `domain` ; le petit rond reprend
   * le style du repère sur la carte (plein, creux, pointillé).
   */
  const props = withDefaults(
    defineProps<{
      location: Pick<
        ListingLocation,
        'precision' | 'point' | 'placement' | 'commune' | 'district'
      >
      /** Sans le nom du quartier, pour les listes serrées. */
      compact?: boolean
    }>(),
    { compact: false }
  )

  const badge = computed(() => precisionBadge(props.location))
  const label = computed(() =>
    props.compact && badge.value.tone === 'district'
      ? 'Au quartier'
      : badge.value.label
  )

  const TONES: Record<PrecisionTone, string> = {
    exact: 'bg-good-soft text-good',
    street: 'bg-accent-soft text-accent',
    district: 'bg-warn-soft text-warn',
    commune: 'border border-dashed border-muted bg-surface-2 text-muted',
    none: 'bg-bad-soft text-bad',
  }
  const DOTS: Record<PrecisionTone, string> = {
    exact: 'bg-current',
    street: 'bg-current',
    district: 'border-2 border-current',
    commune: 'border border-dashed border-current opacity-70',
    none: 'border border-current opacity-50',
  }
</script>

<template>
  <span
    class="inline-flex w-fit max-w-full items-center gap-1 justify-self-start rounded-full px-2 py-px text-xs whitespace-nowrap"
    :class="TONES[badge.tone]"
    :title="badge.title"
    :data-precision="badge.tone"
    data-testid="precision-badge"
  >
    <span
      class="inline-block h-2 w-2 flex-none rounded-full"
      :class="DOTS[badge.tone]"
      aria-hidden="true"
    />
    <span class="truncate">{{ label }}</span>
  </span>
</template>
