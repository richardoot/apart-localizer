<script setup lang="ts">
  import {
    CRITERIA_FIT_LEVEL_DESCRIPTIONS,
    CRITERIA_FIT_LEVEL_LABELS,
  } from '@apart/contracts'
  import type { CriteriaFitLevel } from '@apart/contracts'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import type { BadgeVariant, Tone } from '@/lib/ui'

  /**
   * La pastille d'adéquation aux critères (lot 14), lisible sans la couleur :
   * pleine avec une coche (dans les critères), bord pointillé (à confirmer),
   * ambre (à la marge), gris foncé (hors critères) ; le libellé dit le niveau,
   * l'infobulle ce qu'il veut dire.
   */
  withDefaults(
    defineProps<{ level: CriteriaFitLevel; count?: number | null }>(),
    {
      count: null,
    }
  )

  /** Lot 22 : la pastille commune, la coche du jeu d'icônes. */
  const TONES: Record<
    CriteriaFitLevel,
    { tone: Tone; variant: BadgeVariant; extra: string }
  > = {
    in: { tone: 'accent', variant: 'solid', extra: '' },
    to_confirm: {
      tone: 'accent',
      variant: 'outline',
      extra: 'border-[1.5px] border-dashed bg-surface',
    },
    margin: { tone: 'warn', variant: 'soft', extra: '' },
    out: { tone: 'neutral', variant: 'solid', extra: '' },
  }
</script>

<template>
  <UiBadge
    :tone="TONES[level].tone"
    :variant="TONES[level].variant"
    :icon="level === 'in' ? 'check' : undefined"
    class="w-fit justify-self-start px-2.5"
    :class="TONES[level].extra"
    :title="CRITERIA_FIT_LEVEL_DESCRIPTIONS[level]"
    :data-fit="level"
    data-testid="fit-badge"
  >
    <span class="tabular-nums">{{
      count === null
        ? CRITERIA_FIT_LEVEL_LABELS[level]
        : `${CRITERIA_FIT_LEVEL_LABELS[level]} · ${count}`
    }}</span>
  </UiBadge>
</template>
