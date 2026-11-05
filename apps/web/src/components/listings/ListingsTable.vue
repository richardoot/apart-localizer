<script setup lang="ts">
  import { computed, h, ref } from 'vue'
  import {
    FlexRender,
    createColumnHelper,
    createSortedRowModel,
    rowSortingFeature,
    sortFn_basic,
    tableFeatures,
    useTable,
  } from '@tanstack/vue-table'
  import type { ColumnDef } from '@tanstack/vue-table'
  import type { EvaluatedListing } from '@apart/contracts'
  import { rankValues } from '@apart/domain'
  import {
    formatEuros,
    formatEurosPerM2,
    formatEurosPerMonth,
    formatPercent,
    formatSurface,
  } from '@/lib/format'
  import { DISCOUNT_CLASS_CLASSES, DISCOUNT_CLASS_LABELS } from '@/lib/labels'
  import type { CostBasis } from '@/lib/labels'
  import CostBasisBadge from './CostBasisBadge.vue'
  import DpeBadge from './DpeBadge.vue'
  import CriteriaBadges from './CriteriaBadges.vue'
  import NewBadge from './NewBadge.vue'
  import PrecisionBadge from './PrecisionBadge.vue'
  import RentalPill from './RentalPill.vue'
  import StatusBadge from './StatusBadge.vue'
  import VerdictPill from './VerdictPill.vue'

  const props = defineProps<{ items: EvaluatedListing[] }>()
  const emit = defineEmits<{ open: [id: string]; compare: [ids: string[]] }>()

  /** Au plus six annonces côte à côte. */
  const COMPARE_MAX = 6
  const selected = ref<string[]>([])
  function toggle(id: string, checked: boolean): void {
    selected.value = checked
      ? selected.value.includes(id)
        ? selected.value
        : [...selected.value, id].slice(0, COMPARE_MAX)
      : selected.value.filter(s => s !== id)
  }

  /** Rang par décote nécessaire croissante parmi les annonces affichées. */
  const ranks = computed(() =>
    rankValues(
      props.items.map(item => ({
        id: item.listing.id,
        value: item.evaluation.targetPrice.discount,
      })),
      'asc'
    )
  )

  const features = tableFeatures({
    rowSortingFeature,
    sortedRowModel: createSortedRowModel(),
    sortFns: { basic: sortFn_basic },
  })
  const helper = createColumnHelper<typeof features, EvaluatedListing>()

  /** Un nombre NaN (surface inconnue) descend en bas quel que soit le sens. */
  const num = (value: number | null | undefined): number =>
    value == null || Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value

  const estimated = (flag: boolean): string => (flag ? '≈ ' : '')

  /** Un en-tête marqué de sa base de calcul (lot 9) : sur le prix ou tout compris. */
  const withBasis = (label: string, basis: CostBasis) => () =>
    h('span', { class: 'inline-flex items-center gap-1' }, [
      label,
      h(CostBasisBadge, { basis, compact: true }),
    ])

  const averageRating = (item: EvaluatedListing): number => {
    const rated = item.opinions.filter(o => o.rating > 0)
    return rated.length
      ? rated.reduce((s, o) => s + o.rating, 0) / rated.length
      : Number.NEGATIVE_INFINITY
  }

  // Les accesseurs rendent des types différents (texte, nombre) : la liste
  // est rapportée au type de colonne générique que `useTable` attend.
  const columns = [
    helper.display({
      id: 'select',
      header: () =>
        h('span', { class: 'sr-only' }, 'Sélectionner pour comparer'),
      cell: ctx =>
        h('input', {
          type: 'checkbox',
          class: 'size-4 accent-[var(--accent)]',
          checked: selected.value.includes(ctx.row.original.listing.id),
          'aria-label': `Sélectionner ${ctx.row.original.listing.title} pour comparer`,
          onClick: (event: Event) => event.stopPropagation(),
          onChange: (event: Event) =>
            toggle(
              ctx.row.original.listing.id,
              (event.target as HTMLInputElement).checked
            ),
        }),
    }),
    helper.accessor(row => row.listing.title, {
      id: 'title',
      header: 'Annonce',
      cell: ctx =>
        h('div', { class: 'grid gap-0.5' }, [
          h('div', { class: 'flex items-center gap-2' }, [
            h('span', { class: 'font-medium' }, ctx.row.original.listing.title),
            h(NewBadge, { isNew: ctx.row.original.isNewForMe }),
            h(CriteriaBadges, { matches: ctx.row.original.criteriaMatches }),
          ]),
          h('div', { class: 'flex flex-wrap items-center gap-1.5' }, [
            h(StatusBadge, { status: ctx.row.original.listing.status }),
            h(
              'span',
              { class: 'text-xs text-muted' },
              [
                ctx.row.original.listing.location.commune,
                ctx.row.original.listing.location.district,
              ]
                .filter(Boolean)
                .join(' · ')
            ),
            h(PrecisionBadge, {
              location: ctx.row.original.listing.location,
              compact: true,
            }),
          ]),
        ]),
      sortFn: 'basic',
    }),
    helper.accessor(row => row.evaluation.metrics.score, {
      id: 'score',
      header: 'Verdict',
      cell: ctx =>
        h(VerdictPill, {
          verdict: ctx.row.original.evaluation.metrics.verdict,
        }),
      sortFn: 'basic',
    }),
    helper.accessor(row => row.listing.price, {
      id: 'price',
      header: withBasis('Prix', 'price'),
      cell: ctx => formatEuros(ctx.getValue()),
      sortFn: 'basic',
    }),
    helper.accessor(row => num(row.listing.surface), {
      id: 'surface',
      header: 'm²',
      cell: ctx => formatSurface(ctx.row.original.listing.surface),
      sortFn: 'basic',
    }),
    helper.accessor(row => num(row.evaluation.metrics.pricePerM2), {
      id: 'pricePerM2',
      header: withBasis('€/m²', 'price'),
      cell: ctx =>
        formatEurosPerM2(ctx.row.original.evaluation.metrics.pricePerM2),
      sortFn: 'basic',
    }),
    helper.accessor(row => row.listing.dpeClass ?? 'Z', {
      id: 'dpe',
      header: 'DPE',
      cell: ctx => h(DpeBadge, { dpe: ctx.row.original.listing.dpeClass }),
      sortFn: 'basic',
    }),
    helper.accessor(row => row.evaluation.metrics.rent, {
      id: 'rent',
      header: 'Loyer HC',
      cell: ctx => formatEurosPerMonth(ctx.getValue()),
      sortFn: 'basic',
    }),
    helper.accessor(row => row.evaluation.metrics.totalCost, {
      id: 'totalCost',
      header: withBasis('Coût tout compris', 'all_in'),
      cell: ctx => formatEuros(ctx.getValue()),
      sortFn: 'basic',
    }),
    helper.accessor(row => num(row.listing.annualCharges), {
      id: 'charges',
      header: 'Charges/an',
      cell: ctx =>
        ctx.row.original.listing.annualCharges == null
          ? '—'
          : formatEuros(ctx.row.original.listing.annualCharges),
      sortFn: 'basic',
    }),
    helper.accessor(row => row.evaluation.metrics.renovationTotal, {
      id: 'renovation',
      header: 'Travaux',
      cell: ctx => (ctx.getValue() > 0 ? formatEuros(ctx.getValue()) : '—'),
      sortFn: 'basic',
    }),
    helper.accessor(row => num(row.evaluation.metrics.grossYield), {
      id: 'grossYield',
      header: withBasis('Brut', 'all_in'),
      cell: ctx =>
        formatPercent(ctx.row.original.evaluation.metrics.grossYield),
      sortFn: 'basic',
    }),
    helper.accessor(row => num(row.evaluation.metrics.netYield), {
      id: 'netYield',
      header: withBasis('Net', 'all_in'),
      cell: ctx =>
        `${estimated(ctx.row.original.evaluation.metrics.propertyTaxEstimated)}${formatPercent(ctx.row.original.evaluation.metrics.netYield)}`,
      sortFn: 'basic',
    }),
    helper.accessor(row => row.evaluation.metrics.effort, {
      id: 'effort',
      header: withBasis('Effort/mois', 'all_in'),
      cell: ctx => formatEurosPerMonth(ctx.getValue()),
      sortFn: 'basic',
    }),
    helper.accessor(row => num(row.evaluation.targetPrice.targetPrice), {
      id: 'targetPrice',
      header: withBasis('Prix cible', 'price'),
      cell: ctx => {
        const t = ctx.row.original.evaluation.targetPrice
        return t.targetPrice === null ? '—' : formatEuros(t.targetPrice)
      },
      sortFn: 'basic',
    }),
    helper.accessor(
      // Une décote inconnue descend en bas, quel que soit le sens.
      row =>
        row.evaluation.targetPrice.discount === null
          ? Number.NEGATIVE_INFINITY
          : -row.evaluation.targetPrice.discount,
      {
        id: 'discount',
        header: withBasis('Décote', 'price'),
        cell: ctx => {
          const t = ctx.row.original.evaluation.targetPrice
          if (t.discount === null || !t.discountClass) return '—'
          return h(
            'span',
            {
              class: `inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${DISCOUNT_CLASS_CLASSES[t.discountClass]}`,
              title: DISCOUNT_CLASS_LABELS[t.discountClass],
              'data-discount-class': t.discountClass,
            },
            t.discount > 0
              ? `−${formatPercent(t.discount)}`
              : `+${formatPercent(-t.discount)}`
          )
        },
        sortFn: 'basic',
      }
    ),
    helper.accessor(
      row => {
        const rank = ranks.value.get(row.listing.id) ?? null
        return rank === null ? Number.NEGATIVE_INFINITY : -rank
      },
      {
        id: 'rank',
        header: 'Classement',
        cell: ctx => {
          const rank = ranks.value.get(ctx.row.original.listing.id) ?? null
          return rank === null ? '—' : `${rank}/${ranks.value.size}`
        },
        sortFn: 'basic',
      }
    ),
    helper.accessor(row => row.evaluation.rental.rank, {
      id: 'rental',
      header: 'Phase 2',
      cell: ctx =>
        h(RentalPill, { verdict: ctx.row.original.evaluation.rental.verdict }),
      sortFn: 'basic',
    }),
    helper.accessor(row => row.tasks.filter(t => !t.done).length, {
      id: 'tasks',
      header: 'À faire',
      cell: ctx => {
        const open = ctx.getValue()
        const total = ctx.row.original.tasks.length
        return total === 0 ? '—' : `${open}/${total}`
      },
      sortFn: 'basic',
    }),
    helper.accessor(row => averageRating(row), {
      id: 'opinion',
      header: 'Avis',
      cell: ctx => {
        const rated = ctx.row.original.opinions.filter(o => o.rating > 0)
        return rated.length ? rated.map(o => `${o.rating}★`).join(' · ') : '—'
      },
      sortFn: 'basic',
    }),
  ] as unknown as ColumnDef<typeof features, EvaluatedListing, unknown>[]

  const data = computed(() => props.items)

  // L'état de tri vit dans la table (atomes réactifs de l'adaptateur Vue).
  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row: EvaluatedListing) => row.listing.id,
  })

  function arrow(sorted: false | 'asc' | 'desc'): string {
    return sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'
  }
</script>

<template>
  <div
    class="relative overflow-x-auto rounded-xl border border-line bg-surface"
  >
    <div
      v-if="selected.length > 0"
      class="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-accent-soft px-3 py-2 text-sm"
      data-testid="compare-bar"
    >
      <span>{{ selected.length }} annonce(s) sélectionnée(s) (6 au plus)</span>
      <span class="flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-line px-3 py-1 text-xs hover:bg-surface"
          @click="selected = []"
        >
          Tout désélectionner
        </button>
        <button
          type="button"
          class="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg disabled:opacity-60"
          :disabled="selected.length < 2"
          @click="emit('compare', selected)"
        >
          Comparer ({{ selected.length }})
        </button>
      </span>
    </div>
    <table class="w-full min-w-[1300px] text-sm">
      <thead class="bg-surface-2 text-left text-xs text-muted">
        <tr
          v-for="headerGroup in table.getHeaderGroups()"
          :key="headerGroup.id"
        >
          <th
            v-for="header in headerGroup.headers"
            :key="header.id"
            scope="col"
            class="px-3 py-2 font-medium whitespace-nowrap"
            :class="header.column.getIsSorted() ? 'text-accent' : ''"
          >
            <button
              type="button"
              class="inline-flex items-center gap-1 hover:text-fg"
              @click="header.column.getToggleSortingHandler()?.($event)"
            >
              <FlexRender :header="header" />
              <span aria-hidden="true">{{
                arrow(header.column.getIsSorted())
              }}</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in table.getRowModel().rows"
          :key="row.id"
          class="cursor-pointer border-t border-line align-top hover:bg-surface-2"
          :class="
            row.original.listing.status === 'discarded' ? 'opacity-60' : ''
          "
          tabindex="0"
          :data-id="row.original.listing.id"
          @click="emit('open', row.original.listing.id)"
          @keydown.enter="emit('open', row.original.listing.id)"
        >
          <td
            v-for="cell in row.getAllCells()"
            :key="cell.id"
            class="px-3 py-2 tabular-nums whitespace-nowrap"
          >
            <FlexRender :cell="cell" />
          </td>
        </tr>
      </tbody>
    </table>
    <p
      v-if="items.length === 0"
      class="px-4 py-8 text-center text-sm text-muted"
    >
      Aucune annonce ne correspond : élargissez les filtres de statut ou de
      commune.
    </p>
  </div>
</template>
