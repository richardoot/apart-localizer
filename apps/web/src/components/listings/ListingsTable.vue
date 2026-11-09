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
  import type { EvaluatedListing, Member } from '@apart/contracts'
  import {
    fitRank,
    keptLabel,
    priceRangeText,
    rankValues,
    sellerListLabel,
  } from '@apart/domain'
  import {
    formatEuros,
    formatEurosPerM2,
    formatEurosPerMonth,
    formatPercent,
    formatSurface,
  } from '@/lib/format'
  import { DISCOUNT_CLASS_CLASSES, DISCOUNT_CLASS_LABELS } from '@/lib/labels'
  import {
    commonScoreText,
    disagreementsText,
    memberCell,
    memberSortValue,
  } from '@/lib/opinions'
  import type { CostBasis } from '@/lib/labels'
  import CostBasisBadge from './CostBasisBadge.vue'
  import DpeBadge from './DpeBadge.vue'
  import FitSummary from './FitSummary.vue'
  import CheckFreshnessBadge from './CheckFreshnessBadge.vue'
  import NewBadge from './NewBadge.vue'
  import PortalChips from './PortalChips.vue'
  import PrecisionBadge from './PrecisionBadge.vue'
  import RentalPill from './RentalPill.vue'
  import StatusBadge from './StatusBadge.vue'
  import VerdictPill from './VerdictPill.vue'

  const props = withDefaults(
    defineProps<{
      items: EvaluatedListing[]
      /** Lot 14 : l'onglet « Hors critères » (depuis quand). */
      outTab?: boolean
      /** Lot 20 : les membres actifs (une colonne d'avis chacun). */
      members?: readonly Member[]
      /** Lot 20 : le membre connecté (« à toi de noter »). */
      meId?: string | null
    }>(),
    { outTab: false, members: () => [], meId: null }
  )
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

  /** Lot 20 : la note commune pour le tri (en attente en bas). */
  const commonValue = (item: EvaluatedListing): number =>
    item.opinionSummary?.commonScore ?? Number.NEGATIVE_INFINITY

  /**
   * Lot 20 : nos avis, une colonne par membre actif (note globale · moyenne
   * des critères, « masqué » à l'aveugle), la note commune et les
   * désaccords ; à la place de l'ancienne colonne « Avis ».
   */
  const opinionColumns = computed(() => [
    ...props.members
      .filter(m => m.status === 'active')
      .map(member =>
        helper.accessor(row => memberSortValue(row.opinionSummary, member.id), {
          id: `opinion-${member.id}`,
          header: member.displayName,
          cell: ctx => {
            const text = memberCell(ctx.row.original.opinionSummary, member.id)
            return h(
              'span',
              {
                class: text === 'masqué' || text === '—' ? 'text-muted' : '',
                'data-testid': 'opinion-member',
              },
              text
            )
          },
          sortFn: 'basic',
        })
      ),
    helper.accessor(row => commonValue(row), {
      id: 'commonScore',
      header: 'Note commune',
      cell: ctx => {
        const text = commonScoreText(ctx.row.original.opinionSummary)
        return h(
          'strong',
          {
            class:
              text === 'en attente' || text === '—'
                ? 'font-normal text-muted'
                : 'font-display text-base',
            'data-testid': 'common-score',
          },
          text
        )
      },
      sortFn: 'basic',
    }),
    helper.accessor(row => row.opinionSummary?.maxGap ?? -1, {
      id: 'disagreements',
      header: 'Désaccords',
      cell: ctx => {
        const summary = ctx.row.original.opinionSummary
        const text = disagreementsText(summary, props.meId)
        return h(
          'span',
          {
            class: `whitespace-normal ${summary?.disagreementKeys.length ? 'text-warn' : 'text-muted'}`,
            'data-testid': 'disagreements',
          },
          text
        )
      },
      sortFn: 'basic',
    }),
  ])

  // Les accesseurs rendent des types différents (texte, nombre) : la liste
  // est rapportée au type de colonne générique que `useTable` attend.
  const baseColumns = [
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
            // Lot 15 : « Vérifiée il y a 3 j » ou « À revérifier ».
            h(CheckFreshnessBadge, {
              listing: ctx.row.original.listing,
              lastOutcome: ctx.row.original.lastCheck?.outcome ?? null,
            }),
          ]),
          // Lot 14 : une annonce hors critères gardée dans la liste.
          ctx.row.original.criteriaFit.kept && !props.outTab
            ? h(
                'span',
                {
                  class: 'text-xs font-medium text-fg',
                  'data-testid': 'fit-kept',
                },
                keptLabel(ctx.row.original.criteriaFit.kept)
              )
            : null,
        ]),
      sortFn: 'basic',
    }),
    // Lot 14 : l'adéquation aux critères actifs, sa raison, depuis quand.
    helper.accessor(row => fitRank(row.criteriaFit.level), {
      id: 'fit',
      header: () => (props.outTab ? 'Pourquoi hors critères' : 'Adéquation'),
      cell: ctx =>
        h(FitSummary, {
          fit: ctx.row.original.criteriaFit,
          since: props.outTab,
          hideKept: true,
        }),
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
      cell: ctx => {
        // Lot 18 : « jusqu'à 219 000 € selon le portail ».
        const range = priceRangeText(ctx.row.original.links)
        return range
          ? h('div', { class: 'grid gap-0.5' }, [
              h('span', formatEuros(ctx.getValue())),
              h(
                'span',
                {
                  class: 'text-xs whitespace-normal text-warn',
                  'data-testid': 'price-range',
                },
                range
              ),
            ])
          : formatEuros(ctx.getValue())
      },
      sortFn: 'basic',
    }),
    // Lot 18 : les portails (barrés : plus en ligne), le vendeur, la référence.
    helper.accessor(row => row.links.length, {
      id: 'portals',
      header: 'Portails',
      cell: ctx =>
        ctx.row.original.links.length
          ? h(PortalChips, { links: ctx.row.original.links, short: true })
          : '—',
      sortFn: 'basic',
    }),
    helper.accessor(row => sellerListLabel(row.listing.sellerType), {
      id: 'seller',
      header: 'Vendeur',
      cell: ctx =>
        h('div', { class: 'grid gap-0.5', 'data-testid': 'seller-cell' }, [
          h(
            'span',
            {
              class:
                ctx.row.original.listing.sellerType === 'unknown'
                  ? 'text-muted'
                  : '',
            },
            ctx.getValue()
          ),
          ctx.row.original.listing.sellerName &&
          ctx.row.original.listing.sellerType !== 'private'
            ? h(
                'span',
                { class: 'max-w-56 truncate text-xs text-muted' },
                ctx.row.original.listing.sellerName
              )
            : null,
        ]),
      sortFn: 'basic',
    }),
    helper.accessor(row => row.listing.sellerReference ?? '', {
      id: 'reference',
      header: 'Référence',
      cell: ctx =>
        ctx.row.original.listing.sellerReference
          ? h(
              'span',
              { class: 'font-mono text-xs' },
              ctx.row.original.listing.sellerReference
            )
          : ctx.row.original.listing.sellerType === 'private'
            ? '—'
            : h('span', { class: 'text-xs text-muted' }, 'à relever'),
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
  ]
  /** Les colonnes d'avis juste après le prix (maquette : prix, verdict, avis). */
  const priceIndex = baseColumns.findIndex(c => c.id === 'price')
  const columns = computed(
    () =>
      [
        ...baseColumns.slice(0, priceIndex + 1),
        ...opinionColumns.value,
        ...baseColumns.slice(priceIndex + 1),
      ] as unknown as ColumnDef<typeof features, EvaluatedListing, unknown>[]
  )

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
    <table class="w-full min-w-[1600px] text-sm">
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
