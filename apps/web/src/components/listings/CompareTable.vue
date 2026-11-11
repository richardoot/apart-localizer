<script setup lang="ts">
  import type { RouteLocationRaw } from 'vue-router'
  import UiButton from '@/components/ui/UiButton.vue'
  import { computed } from 'vue'
  import { CRITERIA_FIT_LEVEL_LABELS, JUDGEMENT_LABELS } from '@apart/contracts'
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
  import { bestCommonIndexes, precisionBadge } from '@apart/domain'
  import {
    commonScoreText,
    compareCell,
    disagreementsText,
  } from '@/lib/opinions'
  import CostBasisBadge from './CostBasisBadge.vue'
  import PrecisionBadge from './PrecisionBadge.vue'

  const props = withDefaults(
    defineProps<{
      result: CompareResult
      /** Lot 20 : le membre connecté (« à toi de noter »). */
      meId?: string | null
      /** Lot 26 : le lien de la fiche (le titre est un vrai lien) ; sans lui, un bouton. */
      linkOf?: ((id: string) => RouteLocationRaw) | null
    }>(),
    { meId: null, linkOf: null }
  )
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
    // Lot 25 : les trois jugements, étiquetés et dans leur ordre.
    {
      key: 'verdict',
      label: JUDGEMENT_LABELS.profitability,
      best: 'score',
      value: i => VERDICT_LABELS[i.evaluation.metrics.verdict],
    },
    {
      key: 'fit',
      label: JUDGEMENT_LABELS.search,
      value: i =>
        i.criteriaFit.activeCriteria > 0
          ? CRITERIA_FIT_LEVEL_LABELS[i.criteriaFit.level]
          : '—',
    },
    {
      key: 'rental',
      label: JUDGEMENT_LABELS.rental,
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
  ])

  /**
   * Lot 20 : nos avis côte à côte, une ligne par critère (« 4 / 2 » dans
   * l'ordre des membres, « masqué » à l'aveugle) ; en gras, la meilleure
   * note commune de la ligne (critère noté par tous, avis visibles).
   */
  interface OpinionCompareRow {
    key: string
    label: string
    cells: string[]
    best: number[]
  }
  const reference = computed(
    () => props.result.items.find(i => i.opinionSummary)?.opinionSummary ?? null
  )
  const memberNames = computed(() =>
    (reference.value?.members ?? []).map(m => m.displayName)
  )
  const opinionRows = computed<OpinionCompareRow[]>(() => {
    const ref0 = reference.value
    if (!ref0) return []
    const items = props.result.items
    const summaries = items.map(i => i.opinionSummary)
    const global: OpinionCompareRow = {
      key: 'opinion-global',
      label: 'Notes globales',
      cells: summaries.map(s =>
        s && s.members.length
          ? s.members
              .map(m =>
                m.state === 'masked'
                  ? 'masqué'
                  : m.state === 'rated' && m.rating
                    ? `${m.rating}/5`
                    : '—'
              )
              .join(' / ')
          : '—'
      ),
      best: [],
    }
    const criteria = ref0.rows.map(row => {
      const means = summaries.map(s => {
        const r = s?.rows.find(x => x.key === row.key)
        return r && r.common ? r.mean : null
      })
      return {
        key: `opinion-${row.key}`,
        label: row.label,
        cells: summaries.map(s => compareCell(s, row.key)),
        best: bestCommonIndexes(means),
      }
    })
    const common: OpinionCompareRow = {
      key: 'opinion-common',
      label: 'Note commune',
      cells: summaries.map(s => commonScoreText(s)),
      best: bestCommonIndexes(summaries.map(s => s?.commonScore ?? null)),
    }
    const disagreements: OpinionCompareRow = {
      key: 'opinion-disagreements',
      label: 'Désaccords',
      cells: summaries.map(s => disagreementsText(s, props.meId)),
      best: [],
    }
    return [global, ...criteria, common, disagreements]
  })

  const isBest = (row: Row, item: CompareItem): boolean =>
    row.best !== undefined &&
    props.result.best[row.best] === item.listing.id &&
    props.result.items.length > 1
</script>

<template>
  <div
    class="relative overflow-x-auto rounded-2xl border border-line bg-surface"
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
            <UiButton
              v-if="linkOf"
              :to="linkOf(item.listing.id)"
              variant="link"
              size="sm"
              class="justify-start text-left font-display font-bold text-fg no-underline hover:text-accent"
              data-testid="compare-title"
            >
              {{ item.listing.title }}
            </UiButton>
            <UiButton
              v-else
              variant="link"
              size="sm"
              class="justify-start text-left font-display font-bold text-fg no-underline hover:text-accent"
              data-testid="compare-title"
              @click="emit('open', item.listing.id)"
            >
              {{ item.listing.title }}
            </UiButton>
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
        <template v-if="opinionRows.length">
          <tr class="border-t-2 border-line bg-surface-2">
            <th
              scope="colgroup"
              :colspan="result.items.length + 1"
              class="px-3 py-2 text-left text-xs font-semibold text-muted"
            >
              Nos avis côte à côte
            </th>
          </tr>
          <tr
            v-for="row in opinionRows"
            :key="row.key"
            class="border-t border-line"
            :data-row="row.key"
          >
            <th scope="row" class="px-3 py-2 text-left font-medium text-muted">
              {{ row.label }}
            </th>
            <td
              v-for="(cell, index) in row.cells"
              :key="index"
              class="px-3 py-2 tabular-nums"
              :class="row.best.includes(index) ? 'font-bold text-fg' : ''"
              :data-best="row.best.includes(index) ? 'true' : undefined"
            >
              {{ cell }}
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <p
      v-if="opinionRows.length && memberNames.length"
      class="border-t border-line px-3 py-2 text-xs text-muted"
      data-testid="compare-opinions-legend"
    >
      Chaque case : {{ memberNames.join(' / ') }} ; en gras, la meilleure note
      commune de la ligne.
    </p>
  </div>
</template>
