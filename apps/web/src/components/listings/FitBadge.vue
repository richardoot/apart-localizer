<script setup lang="ts">
  import {
    CRITERIA_FIT_LEVEL_DESCRIPTIONS,
    CRITERIA_FIT_LEVEL_LABELS,
  } from '@apart/contracts'
  import type { CriteriaFitLevel } from '@apart/contracts'

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

  const TONES: Record<CriteriaFitLevel, string> = {
    in: 'bg-accent text-accent-fg',
    to_confirm:
      'border-[1.5px] border-dashed border-accent bg-surface text-accent',
    margin: 'bg-warn-soft text-warn',
    out: 'bg-muted text-surface',
  }
</script>

<template>
  <span
    class="inline-flex w-fit items-center gap-1.5 justify-self-start rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
    :class="TONES[level]"
    :title="CRITERIA_FIT_LEVEL_DESCRIPTIONS[level]"
    :data-fit="level"
    data-testid="fit-badge"
  >
    <svg
      v-if="level === 'in'"
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M2 6.5l2.5 2.5L10 3.5" />
    </svg>
    <span class="tabular-nums">{{
      count === null
        ? CRITERIA_FIT_LEVEL_LABELS[level]
        : `${CRITERIA_FIT_LEVEL_LABELS[level]} · ${count}`
    }}</span>
  </span>
</template>
