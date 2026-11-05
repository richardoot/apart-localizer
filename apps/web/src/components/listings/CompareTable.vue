<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    CompareItem,
    CompareRanks,
    CompareResult,
  } from '@apart/contracts'
  import {
    formatEuros,
    formatEurosPerM2,
    formatEurosPerMonth,
    formatPercent,
    formatSurface,
  } from '@/lib/format'
  import {
    DISCOUNT_CLASS_LABELS,
    LISTING_STATUS_LABELS,
    RENTAL_VERDICT_LABELS,
    TARGET_CRITERION_LABELS,
    VERDICT_LABELS,
  } from '@/lib/labels'
  import type { CostBasis } from '@/lib/labels'
  import { precisionBadge } from '@apart/domain'
  import CostBasisBadge from './CostBasisBadge.vue'
  import PrecisionBadge from './PrecisionBadge.vue'

  const props = defineProps<{ result: CompareResult }>()
  const emit = defineEmits<{ open: [id: string] }>()

  interface Row {
    key: string
    label: string
    /** L'indicateur dont le rang 1 met la cellule en avant. */
    best?: keyof CompareRanks
    /** Base de calcul de la valeur (lot 9) : sur le prix ou tout compris. */
    basis?: CostBasis
    value: (item: CompareItem) => string
  }

  const rows = computed<Row[]>(() => [
    {
      key: 'status',
      label: 'Statut',
      value: i => LISTING_STATUS_LABELS[i.listing.status],
    },
    {
      key: 'commune',
      label: 'Commune',
      value: i =>
        [i.listing.location.commune, i.listing.location.district]
          .filter(Boolean)
          .join(' · ') || '—',
    },
    {
      // Lot 12 : la pastille de précision du repère (adresse, quartier, commune).
      key: 'precision',
      label: 'Repère',
      value: i => precisionBadge(i.listing.location).label,
    },
    {
      key: 'price',
      label: 'Prix',
      basis: 'price',
      value: i => formatEuros(i.listing.price),
    },
    {
      key: 'surface',
      label: 'Surface',
      value: i => formatSurface(i.listing.surface),
    },
    {
      key: 'pricePerM2',
      label: 'Prix au m²',
      best: 'pricePerM2',
      basis: 'price',
      value: i => formatEurosPerM2(i.evaluation.metrics.pricePerM2),
    },
    { key: 'dpe', label: 'DPE', value: i => i.listing.dpeClass ?? '—' },
    {
      key: 'rent',
      label: 'Loyer retenu',
      value: i => formatEurosPerMonth(i.evaluation.metrics.rent),
    },
    {
      key: 'totalCost',
      label: 'Coût tout compris',
      basis: 'all_in',
      value: i => formatEuros(i.evaluation.metrics.totalCost),
    },
    {
      key: 'monthlyPayment',
      label: 'Mensualité',
      basis: 'all_in',
      value: i => formatEurosPerMonth(i.evaluation.metrics.monthlyPayment),
    },
    {
      key: 'grossYield',
      label: 'Rendement brut',
      best: 'grossYield',
      basis: 'all_in',
      value: i => formatPercent(i.evaluation.metrics.grossYield),
    },
    {
      key: 'netYield',
      label: 'Rendement net',
      best: 'netYield',
      basis: 'all_in',
      value: i =>
        `${i.evaluation.metrics.propertyTaxEstimated ? '≈ ' : ''}${formatPercent(i.evaluation.metrics.netYield)}`,
    },
    {
      key: 'effort',
      label: 'Effort mensuel',
      best: 'effort',
      basis: 'all_in',
      value: i => formatEurosPerMonth(i.evaluation.metrics.effort),
    },
    {
      key: 'verdict',
      label: 'Verdict',
      best: 'score',
      value: i => VERDICT_LABELS[i.evaluation.metrics.verdict],
    },
    {
      key: 'rental',
      label: 'Phase 2',
      value: i => RENTAL_VERDICT_LABELS[i.evaluation.rental.verdict],
    },
    {
      key: 'targetPrice',
      label: 'Prix cible',
      basis: 'price',
      value: i =>
        i.evaluation.targetPrice.targetPrice === null
          ? '—'
          : `${formatEuros(i.evaluation.targetPrice.targetPrice)}${
              i.evaluation.targetPrice.bindingCriterion
                ? ` (${TARGET_CRITERION_LABELS[i.evaluation.targetPrice.bindingCriterion].toLowerCase()})`
                : ''
            }`,
    },
    {
      key: 'discount',
      label: 'Décote nécessaire',
      best: 'discount',
      basis: 'price',
      value: i =>
        i.evaluation.targetPrice.discount === null ||
        !i.evaluation.targetPrice.discountClass
          ? '—'
          : `${formatPercent(i.evaluation.targetPrice.discount)} · ${DISCOUNT_CLASS_LABELS[i.evaluation.targetPrice.discountClass]}`,
    },
    {
      key: 'tasks',
      label: 'Tâches à faire',
      value: i => String(i.tasks.filter(t => !t.done).length),
    },
    {
      key: 'opinions',
      label: 'Avis',
      value: i => {
        const rated = i.opinions.filter(o => o.rating > 0)
        return rated.length ? rated.map(o => `${o.rating}★`).join(' · ') : '—'
      },
    },
  ])

  const isBest = (row: Row, item: CompareItem): boolean =>
    row.best !== undefined &&
    props.result.best[row.best] === item.listing.id &&
    props.result.items.length > 1
</script>

<template>
  <div
    class="relative overflow-x-auto rounded-xl border border-line bg-surface"
  >
    <table class="w-full text-sm" data-testid="compare-table">
      <thead class="bg-surface-2 text-left text-xs text-muted">
        <tr>
          <th scope="col" class="px-3 py-2 font-medium">Indicateur</th>
          <th
            v-for="item in result.items"
            :key="item.listing.id"
            scope="col"
            class="px-3 py-2 font-medium"
          >
            <button
              type="button"
              class="text-left font-display text-sm font-semibold text-fg hover:text-accent"
              @click="emit('open', item.listing.id)"
            >
              {{ item.listing.title }}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.key"
          class="border-t border-line"
          :data-row="row.key"
        >
          <th scope="row" class="px-3 py-2 text-left font-medium text-muted">
            <span class="inline-flex items-center gap-1.5"
              >{{ row.label }}
              <CostBasisBadge v-if="row.basis" :basis="row.basis" compact
            /></span>
          </th>
          <td
            v-for="item in result.items"
            :key="item.listing.id"
            class="px-3 py-2 tabular-nums"
            :class="isBest(row, item) ? 'font-semibold text-good' : ''"
            :data-best="isBest(row, item) ? 'true' : undefined"
          >
            <PrecisionBadge
              v-if="row.key === 'precision'"
              :location="item.listing.location"
            />
            <template v-else>{{ row.value(item) }}</template>
            <span v-if="isBest(row, item)" aria-label="meilleure">★</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
