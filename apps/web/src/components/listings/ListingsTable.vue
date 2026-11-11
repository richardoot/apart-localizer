<script setup lang="ts">
  import { computed, h } from 'vue'
  import { RouterLink } from 'vue-router'
  import type { RouteLocationRaw } from 'vue-router'
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
  import { DISCOUNT_CLASS_LABELS, DISCOUNT_CLASS_TONES } from '@/lib/labels'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import {
    commonScoreText,
    disagreementsText,
    memberCell,
    memberSortValue,
  } from '@/lib/opinions'
  import type { CostBasis } from '@/lib/labels'
  import CostBasisBadge from './CostBasisBadge.vue'
  import DpeBadge from './DpeBadge.vue'
  import { JUDGEMENT_LABELS } from '@apart/contracts'
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
      /** Lot 26 : les annonces cochées pour comparer (la sélection vit dans l'URL). */
      selected?: readonly string[]
      /** Lot 26 : la sélection est pleine (six au plus). */
      selectionFull?: boolean
      /** Lot 26 : le lien de la fiche ; le titre est un vrai lien. */
      linkOf?: ((id: string) => RouteLocationRaw) | null
    }>(),
    {
      outTab: false,
      members: () => [],
      meId: null,
      selected: () => [],
      selectionFull: false,
      linkOf: null,
    }
  )
  const emit = defineEmits<{
    open: [id: string]
    select: [id: string, checked: boolean]
  }>()

  /**
   * Lot 26 : un clic sur la ligne ouvre la fiche (souris), sauf s'il vise un
   * lien, une case ou un bouton, ou s'il porte une touche (nouvel onglet) :
   * au clavier, seul le lien du titre ouvre la fiche.
   */
  function onRowClick(event: MouseEvent, id: string): void {
    const target = event.target as Element | null
    if (target?.closest('a,button,input,label,select,textarea')) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    emit('open', id)
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
      // La case ne doit pas ouvrir la fiche : le clic s'arrête à la cellule.
      cell: ctx =>
        h(
          'span',
          {
            class: 'inline-flex',
            onClick: (event: Event) => event.stopPropagation(),
          },
          [
            h(UiCheckbox, {
              class: '-my-2.5 sm:-my-1.5',
              modelValue: props.selected.includes(ctx.row.original.listing.id),
              disabled:
                props.selectionFull &&
                !props.selected.includes(ctx.row.original.listing.id),
              'aria-label': `Comparer « ${ctx.row.original.listing.title} »`,
              'onUpdate:modelValue': (checked: unknown) =>
                emit('select', ctx.row.original.listing.id, checked === true),
            }),
          ]
        ),
    }),
    helper.accessor(row => row.listing.title, {
      id: 'title',
      header: 'Annonce',
      cell: ctx =>
        h('div', { class: 'grid gap-0.5' }, [
          h('div', { class: 'flex items-center gap-2' }, [
            // Lot 26 : le titre est un vrai lien (nouvel onglet, clic du milieu).
            props.linkOf
              ? h(
                  RouterLink,
                  {
                    to: props.linkOf(ctx.row.original.listing.id),
                    class:
                      'font-medium text-fg underline-offset-2 hover:text-accent hover:underline',
                    'data-testid': 'table-title',
                  },
                  () => ctx.row.original.listing.title
                )
              : h(
                  'span',
                  { class: 'font-medium' },
                  ctx.row.original.listing.title
                ),
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
    // Lot 25 : les trois jugements, étiquetés et dans leur ordre :
    // rentabilité, recherche (l'adéquation du lot 14), location (phase 2).
    helper.accessor(row => row.evaluation.metrics.score, {
      id: 'score',
      header: JUDGEMENT_LABELS.profitability,
      cell: ctx =>
        h(VerdictPill, {
          verdict: ctx.row.original.evaluation.metrics.verdict,
        }),
      sortFn: 'basic',
    }),
    // Lot 14 : l'adéquation aux critères actifs, sa raison, depuis quand.
    helper.accessor(row => fitRank(row.criteriaFit.level), {
      id: 'fit',
      header: () =>
        props.outTab ? 'Pourquoi hors critères' : JUDGEMENT_LABELS.search,
      cell: ctx =>
        h(FitSummary, {
          fit: ctx.row.original.criteriaFit,
          since: props.outTab,
          hideKept: true,
        }),
      sortFn: 'basic',
    }),
    helper.accessor(row => row.evaluation.rental.rank, {
      id: 'rental',
      header: JUDGEMENT_LABELS.rental,
      cell: ctx =>
        h(RentalPill, { verdict: ctx.row.original.evaluation.rental.verdict }),
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
          const discount = t.discount
          if (discount === null || !t.discountClass) return '—'
          return h(
            UiBadge,
            {
              tone: DISCOUNT_CLASS_TONES[t.discountClass],
              title: DISCOUNT_CLASS_LABELS[t.discountClass],
              'data-discount-class': t.discountClass,
            },
            () =>
              discount > 0
                ? `−${formatPercent(discount)}`
                : `+${formatPercent(-discount)}`
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

  /** Le sens de tri d'une colonne, pour les lecteurs d'écran (`aria-sort`). */
  function ariaSort(
    sorted: false | 'asc' | 'desc',
    sortable = true
  ): 'ascending' | 'descending' | 'none' | undefined {
    if (!sortable) return undefined
    return sorted === 'asc'
      ? 'ascending'
      : sorted === 'desc'
        ? 'descending'
        : 'none'
  }
</script>

<template>
  <div
    class="relative overflow-x-auto rounded-2xl border border-line bg-surface"
  >
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
            class="px-3 py-1 font-medium whitespace-nowrap"
            :class="header.column.getIsSorted() ? 'text-accent' : ''"
            :aria-sort="
              ariaSort(
                header.column.getIsSorted(),
                header.column.id !== 'select'
              )
            "
          >
            <UiButton
              v-if="header.column.id !== 'select'"
              variant="ghost"
              size="sm"
              class="-mx-2.5 font-medium"
              :class="header.column.getIsSorted() ? 'text-accent' : ''"
              :data-sort="header.column.getIsSorted() || undefined"
              @click="header.column.getToggleSortingHandler()?.($event)"
            >
              <FlexRender :header="header" />
              <UiIcon
                v-if="header.column.getIsSorted()"
                :name="
                  header.column.getIsSorted() === 'asc'
                    ? 'chevron-up'
                    : 'chevron-down'
                "
              />
            </UiButton>
            <FlexRender v-else :header="header" />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in table.getRowModel().rows"
          :key="row.id"
          class="cursor-pointer border-t border-line align-top hover:bg-surface-2"
          :class="
            row.original.listing.status === 'discarded' ? 'bg-surface-2' : ''
          "
          :data-id="row.original.listing.id"
          @click="onRowClick($event, row.original.listing.id)"
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
      Aucune annonce ne correspond dans cette étape : change d’étape ou élargis
      les filtres.
    </p>
  </div>
</template>
