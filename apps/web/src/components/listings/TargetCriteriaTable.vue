<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    Assumptions,
    TargetCriterion,
    TargetPrice,
    TargetPriceCriterion,
  } from '@apart/contracts'
  import {
    formatEuros,
    formatEurosPerMonth,
    formatPercent,
    formatRate,
  } from '@/lib/format'
  import { TARGET_CRITERION_LABELS } from '@/lib/labels'
  import CostBasisBadge from './CostBasisBadge.vue'

  /**
   * « À partir de quel prix ? », critère par critère (lot 9) : l'exigence
   * (seuil des hypothèses), le prix affiché maximal et le coût tout compris
   * qu'il entraîne (`maxTotalCost` de `domain`), la décote. Le critère liant
   * est surligné, les critères non retenus sont grisés.
   */
  const props = defineProps<{
    targetPrice: TargetPrice
    assumptions: Assumptions | null
    /** Loyer retenu en euros par mois, pour le repère 220 × loyer. */
    rent: number
  }>()

  const criteria = computed(() =>
    props.targetPrice.criteria.filter(
      (c): c is TargetPriceCriterion & { maxPrice: number } =>
        c.maxPrice !== null
    )
  )

  function requirement(criterion: TargetCriterion): string {
    const a = props.assumptions
    switch (criterion) {
      case 'gross_yield':
        return a ? `≥ ${formatRate(a.grossYieldThreshold)}` : '—'
      case 'net_yield':
        return a?.netYieldThreshold != null
          ? `≥ ${formatRate(a.netYieldThreshold)}`
          : '—'
      case 'effort':
        return a ? `≤ ${formatEurosPerMonth(a.maxMonthlyEffort)}` : '—'
      case 'rent_x220':
        return `coût ≤ 220 × ${formatEuros(props.rent)}`
      case 'market':
        return 'prix ≤ médiane DVF × surface'
    }
  }
</script>

<template>
  <div class="overflow-x-auto">
    <table
      class="w-full min-w-[34rem] border-collapse text-sm tabular-nums"
      data-testid="target-criteria"
    >
      <caption class="sr-only">
        Prix affiché maximal et coût tout compris maximal par critère
      </caption>
      <thead>
        <tr class="border-b border-line text-xs text-muted">
          <th scope="col" class="px-2 py-2 text-left font-medium">Critère</th>
          <th scope="col" class="px-2 py-2 text-left font-medium">Exigence</th>
          <th scope="col" class="px-2 py-2 text-right font-medium">
            <span class="inline-flex items-center gap-1.5"
              ><CostBasisBadge basis="price" compact /> Prix affiché max</span
            >
          </th>
          <th scope="col" class="px-2 py-2 text-right font-medium">
            <span class="inline-flex items-center gap-1.5"
              ><CostBasisBadge basis="all_in" compact /> Coût tout compris
              max</span
            >
          </th>
          <th scope="col" class="px-2 py-2 text-right font-medium">Décote</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="c in criteria"
          :key="c.criterion"
          class="border-b border-surface-2 last:border-b-0"
          :class="
            c.criterion === targetPrice.bindingCriterion
              ? 'bg-accent-soft font-semibold'
              : c.active
                ? ''
                : 'text-muted'
          "
          :data-criterion="c.criterion"
          :data-binding="
            c.criterion === targetPrice.bindingCriterion ? 'true' : undefined
          "
        >
          <th
            scope="row"
            class="px-2 py-2.5 text-left"
            :class="
              c.criterion === targetPrice.bindingCriterion
                ? 'font-semibold'
                : 'font-normal'
            "
          >
            {{ TARGET_CRITERION_LABELS[c.criterion] }}
            <span
              v-if="c.criterion === targetPrice.bindingCriterion"
              class="text-xs font-semibold text-accent"
              >· critère liant</span
            >
            <span v-else-if="!c.active" class="text-xs font-normal"
              >(non retenu)</span
            >
          </th>
          <td class="px-2 py-2.5 font-normal">
            {{ requirement(c.criterion) }}
          </td>
          <td class="px-2 py-2.5 text-right" data-col="max-price">
            {{ formatEuros(c.maxPrice) }}
          </td>
          <td class="px-2 py-2.5 text-right" data-col="max-cost">
            {{ c.maxTotalCost === null ? '—' : formatEuros(c.maxTotalCost) }}
          </td>
          <td class="px-2 py-2.5 text-right" data-col="discount">
            <template v-if="c.discount !== null"
              >{{ c.discount > 0 ? '−' : '+'
              }}{{ formatPercent(Math.abs(c.discount)) }}</template
            >
            <template v-else>—</template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
