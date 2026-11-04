<script setup lang="ts">
  import { COST_BASIS_LABELS } from '@/lib/labels'
  import type { CostBasis } from '@/lib/labels'

  /**
   * La pastille d'une base de calcul (lot 9) : « sur le prix » (bordée,
   * étiquette) pour ce qui se compare au prix affiché, « tout compris »
   * (pleine, +) pour ce qui porte sur prix + notaire + travaux + mobilier.
   * En version compacte (en-têtes de tableau), l'icône seule, le libellé
   * restant lu par les lecteurs d'écran.
   */
  withDefaults(defineProps<{ basis: CostBasis; compact?: boolean }>(), {
    compact: false,
  })
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] align-middle leading-none font-semibold whitespace-nowrap"
    :class="[
      basis === 'price'
        ? 'border-accent text-accent'
        : 'border-fg bg-fg text-bg',
      compact ? 'p-[3px] text-[10px]' : 'px-2 py-[3px] text-xs',
    ]"
    :data-basis="basis"
  >
    <svg
      v-if="basis === 'price'"
      :class="compact ? 'size-2.5' : 'size-3'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M20 12 12 20 4 12V4h8z" />
      <circle cx="8.5" cy="8.5" r="1.2" />
    </svg>
    <svg
      v-else
      :class="compact ? 'size-2.5' : 'size-3'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
    <span :class="compact ? 'sr-only' : ''">{{
      COST_BASIS_LABELS[basis]
    }}</span>
  </span>
</template>
