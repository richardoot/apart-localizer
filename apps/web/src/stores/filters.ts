import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  COMPARE_MAX,
  CriteriaFitLevelSchema,
  ListingFiltersSchema,
  ListingListQuerySchema,
  listingFiltersFromQuery,
  listingFiltersToQuery,
} from '@apart/contracts'
import type {
  ListingFilters,
  ListingFiltersInput,
  PointRadius,
  SellerType,
  WorkflowStage,
} from '@apart/contracts'
import {
  activeFilterChips,
  isWorkflowStage,
  statusesOfStage,
  withoutChip,
} from '@apart/domain'
import type { FilterChip } from '@apart/domain'
import type { LocationQueryRaw } from 'vue-router'

/** Liste (lignes de l'étape, par défaut), cartes, carte, tableau complet (lot 26 : dans le choix de la vue). */
export type ListingView = 'list' | 'table' | 'cards' | 'map'

/**
 * Lot 21 (ADR 0031) : la page Annonces par étapes (`?etape=`). Les anciens
 * liens (`?vue=a-valider`, `?fit=`, `?status=`) sont redirigés
 * (`legacyStageRedirect`) ; `filters.status` et `filters.fit` restent lus
 * pour cela, l'étape les remplace à l'écran.
 */

export const LISTING_VIEWS: readonly ListingView[] = [
  'list',
  'cards',
  'map',
  'table',
]

/**
 * Lot 18 : le filtre « Vendeur » de la liste, en quatre choix ; chacun est
 * une liste de types (`sellerType` de l'API et de l'URL).
 */
export type SellerFilterChoice = 'all' | 'pro' | 'private' | 'unknown'

export const SELLER_FILTER_CHOICES: readonly {
  choice: SellerFilterChoice
  label: string
  types: SellerType[] | undefined
}[] = [
  { choice: 'all', label: 'Tous', types: undefined },
  {
    choice: 'pro',
    label: 'Agence ou mandataire',
    types: ['agency', 'mandatary'],
  },
  { choice: 'private', label: 'Particulier', types: ['private'] },
  { choice: 'unknown', label: 'À relever', types: ['unknown'] },
]

/** Le choix affiché pour une liste de types (une liste hors des quatre : la plus proche). */
export function sellerChoiceOf(
  types: readonly SellerType[] | undefined
): SellerFilterChoice {
  if (!types?.length) return 'all'
  const set = new Set(types)
  const match = SELLER_FILTER_CHOICES.find(
    c =>
      c.types !== undefined &&
      c.types.length === set.size &&
      c.types.every(t => set.has(t))
  )
  if (match) return match.choice
  if (set.has('agency') || set.has('mandatary')) return 'pro'
  return set.has('private') ? 'private' : 'unknown'
}

/** Les filtres sans tri ni pagination, tels que l'écran les manipule. */
export type FilterState = Omit<ListingFilters, 'page' | 'limit'>

/** La forme de `route.query` de vue-router, ou un simple dictionnaire. */
type Query = Record<string, string | null | undefined | (string | null)[]>

function firstValue(
  value: string | null | undefined | (string | null)[]
): string | undefined {
  if (Array.isArray(value)) return value[0] ?? undefined
  return value ?? undefined
}

/**
 * Les filtres lus depuis la chaîne de requête de la page (mêmes noms que
 * l'API : status, commune, dpe, verdict, lng, lat, radius, search, sort...).
 * Une valeur illisible est ignorée plutôt que de casser la page.
 */
export function filtersFromQuery(query: Query): FilterState {
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    const v = firstValue(value)
    if (v !== undefined) flat[key] = v
  }
  const parsed = ListingListQuerySchema.safeParse(flat)
  const filters = parsed.success
    ? listingFiltersFromQuery(parsed.data)
    : ListingFiltersSchema.parse({})
  const { page: _page, limit: _limit, ...rest } = filters
  return rest
}

/** Lot 21 : l'étape de l'URL (`?etape=`), ou null si elle n'y est pas. */
export function stageFromQuery(query: Query): WorkflowStage | null {
  const stage = firstValue(query.etape)
  return isWorkflowStage(stage) ? stage : null
}

/**
 * Lot 26 : la sélection à comparer (`?comparer=a,b,c`), dans l'ordre choisi,
 * sans doublon, `COMPARE_MAX` au plus ; un identifiant illisible est ignoré.
 */
export function compareFromQuery(query: Query): string[] {
  const raw = firstValue(query.comparer) ?? ''
  return [
    ...new Set(
      raw
        .split(',')
        .map(s => s.trim())
        .filter(s => /^[0-9a-f-]{36}$/i.test(s))
    ),
  ].slice(0, COMPARE_MAX)
}

export function viewFromQuery(query: Query): ListingView {
  const view = firstValue(query.view)
  return LISTING_VIEWS.includes(view as ListingView)
    ? (view as ListingView)
    : 'list'
}

/** L'inverse : la chaîne de requête de la page, vue comprise, défauts omis. */
export function queryFromFilters(
  filters: FilterState,
  view: ListingView,
  stage: WorkflowStage | null = null,
  compare: readonly string[] = []
): LocationQueryRaw {
  const query: LocationQueryRaw = listingFiltersToQuery(filters)
  if (view !== 'list') query.view = view
  if (stage) query.etape = stage
  if (compare.length) query.comparer = compare.join(',')
  return query
}

/** Lot 21 : ce qu'une étape demande à l'API : ses statuts, toute l'adéquation. */
export function stageApiFilters(
  stage: WorkflowStage
): Pick<ListingFilters, 'status' | 'fit'> {
  return {
    status: statusesOfStage(stage),
    fit: [...CriteriaFitLevelSchema.options],
  }
}

/**
 * Les filtres partagés par le tableau, les cartes et la carte, et la vue
 * courante. La page les synchronise avec l'URL (`queryFromFilters`) pour
 * qu'un lien reproduise exactement ce qu'on voit.
 */
export const useFiltersStore = defineStore('filters', () => {
  const filters = ref<FilterState>(filtersFromQuery({}))
  const view = ref<ListingView>('list')
  /** Lot 21 : l'étape ouverte ; null tant que l'URL n'en dit rien. */
  const stage = ref<WorkflowStage | null>(null)
  /** Lot 26 : les annonces cochées pour comparer, dans l'URL (`comparer`). */
  const compare = ref<string[]>([])

  /** Lot 26 : un filtre actif = une puce (`activeFilterChips`, domain) : une seule règle. */
  const activeCount = computed(() => activeFilterChips(filters.value).length)

  /** Les filtres tels que l'API les attend, avec la page demandée. */
  function apiFilters(page = 1, limit = 200): ListingFiltersInput {
    return { ...filters.value, page, limit }
  }

  function patch(partial: Partial<FilterState>): void {
    const next: FilterState = { ...filters.value, ...partial }
    for (const key of Object.keys(partial) as (keyof FilterState)[]) {
      if (partial[key] === undefined) delete next[key]
    }
    filters.value = next
  }

  function setNear(near: PointRadius | undefined): void {
    patch({ near })
  }

  /** Lot 18 : « Vendeur » (Tous, Agence ou mandataire, Particulier, À relever). */
  function setSellerChoice(choice: SellerFilterChoice): void {
    const types = SELLER_FILTER_CHOICES.find(c => c.choice === choice)?.types
    patch({ sellerType: types ? [...types] : undefined })
  }

  /** Lot 21 : change d'étape, les filtres restent. */
  function setStage(next: WorkflowStage): void {
    stage.value = next
  }

  function setSort(
    sort: FilterState['sort'],
    order?: FilterState['order']
  ): void {
    patch({ sort, order: order ?? filters.value.order })
  }

  /** Efface les filtres ; le tri reste (il ne cache rien). */
  function reset(): void {
    const { sort, order } = filters.value
    filters.value = { ...filtersFromQuery({}), sort, order }
  }

  /** Lot 26 : retire le filtre d'une puce. */
  function removeChip(chip: Pick<FilterChip, 'clears'>): void {
    filters.value = withoutChip(filters.value, chip) as FilterState
  }

  /** Lot 26 : coche ou décoche une annonce à comparer (`COMPARE_MAX` au plus). */
  function toggleCompare(id: string, checked?: boolean): void {
    const has = compare.value.includes(id)
    const want = checked ?? !has
    if (want && !has && compare.value.length < COMPARE_MAX) {
      compare.value = [...compare.value, id]
    } else if (!want && has) {
      compare.value = compare.value.filter(c => c !== id)
    }
  }

  function clearCompare(): void {
    compare.value = []
  }

  function loadFromQuery(query: Query): void {
    filters.value = filtersFromQuery(query)
    view.value = viewFromQuery(query)
    stage.value = stageFromQuery(query)
    compare.value = compareFromQuery(query)
  }

  const routeQuery = computed(() =>
    queryFromFilters(filters.value, view.value, stage.value, compare.value)
  )

  return {
    filters,
    view,
    stage,
    compare,
    activeCount,
    routeQuery,
    apiFilters,
    patch,
    setNear,
    setSellerChoice,
    setStage,
    setSort,
    reset,
    removeChip,
    toggleCompare,
    clearCompare,
    loadFromQuery,
  }
})
