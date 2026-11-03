<script setup lang="ts">
  import { computed, h } from 'vue'
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
  import {
    formatEuros,
    formatEurosPerM2,
    formatEurosPerMonth,
    formatPercent,
    formatSurface,
  } from '@/lib/format'
  import DpeBadge from './DpeBadge.vue'
  import NewBadge from './NewBadge.vue'
  import RentalPill from './RentalPill.vue'
  import StatusBadge from './StatusBadge.vue'
  import VerdictPill from './VerdictPill.vue'

  const props = defineProps<{ items: EvaluatedListing[] }>()
  const emit = defineEmits<{ open: [id: string] }>()

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

  const averageRating = (item: EvaluatedListing): number => {
    const rated = item.opinions.filter(o => o.rating > 0)
    return rated.length
      ? rated.reduce((s, o) => s + o.rating, 0) / rated.length
      : Number.NEGATIVE_INFINITY
  }

  // Les accesseurs rendent des types différents (texte, nombre) : la liste
  // est rapportée au type de colonne générique que `useTable` attend.
  const columns = [
    helper.accessor(row => row.listing.title, {
      id: 'title',
      header: 'Annonce',
      cell: ctx =>
        h('div', { class: 'grid gap-0.5' }, [
          h('div', { class: 'flex items-center gap-2' }, [
            h('span', { class: 'font-medium' }, ctx.row.original.listing.title),
            h(NewBadge, { isNew: ctx.row.original.isNewForMe }),
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
      header: 'Prix',
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
      header: '€/m²',
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
      header: 'Coût total',
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
      header: 'Brut',
      cell: ctx =>
        formatPercent(ctx.row.original.evaluation.metrics.grossYield),
      sortFn: 'basic',
    }),
    helper.accessor(row => num(row.evaluation.metrics.netYield), {
      id: 'netYield',
      header: 'Net',
      cell: ctx =>
        `${estimated(ctx.row.original.evaluation.metrics.propertyTaxEstimated)}${formatPercent(ctx.row.original.evaluation.metrics.netYield)}`,
      sortFn: 'basic',
    }),
    helper.accessor(row => row.evaluation.metrics.effort, {
      id: 'effort',
      header: 'Effort/mois',
      cell: ctx => formatEurosPerMonth(ctx.getValue()),
      sortFn: 'basic',
    }),
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
  <div class="overflow-x-auto rounded-xl border border-line bg-surface">
    <table class="w-full min-w-[1100px] text-sm">
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
