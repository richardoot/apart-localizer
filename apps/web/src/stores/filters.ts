import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
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
import { isWorkflowStage, statusesOfStage } from '@apart/domain'
import type { LocationQueryRaw } from 'vue-router'

/** Liste (lignes de l'étape, par défaut), cartes, carte ; le tableau complet garde la comparaison. */
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
  stage: WorkflowStage | null = null
): LocationQueryRaw {
  const query: LocationQueryRaw = listingFiltersToQuery(filters)
  if (view !== 'list') query.view = view
  if (stage) query.etape = stage
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

  const activeCount = computed(() => {
    const f = filters.value
    let count = 0
    if (f.status?.length) count += 1
    if (f.commune?.length) count += 1
    if (f.dpe?.length) count += 1
    if (f.verdict?.length) count += 1
    if (f.precision?.length) count += 1
    if (f.priceMin !== undefined || f.priceMax !== undefined) count += 1
    if (f.surfaceMin !== undefined || f.surfaceMax !== undefined) count += 1
    if (f.roomsMin !== undefined) count += 1
    if (f.newForMe) count += 1
    if (f.staleDays !== undefined) count += 1
    if (f.near) count += 1
    if (f.criteriaId) count += 1
    if (f.search) count += 1
    if (f.sellerType?.length) count += 1
    if (f.multiPortal) count += 1
    if (f.reference) count += 1
    if (f.opinions) count += 1
    return count
  })

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

  function reset(): void {
    filters.value = filtersFromQuery({})
  }

  function loadFromQuery(query: Query): void {
    filters.value = filtersFromQuery(query)
    view.value = viewFromQuery(query)
    stage.value = stageFromQuery(query)
  }

  const routeQuery = computed(() =>
    queryFromFilters(filters.value, view.value, stage.value)
  )

  return {
    filters,
    view,
    stage,
    activeCount,
    routeQuery,
    apiFilters,
    patch,
    setNear,
    setSellerChoice,
    setStage,
    setSort,
    reset,
    loadFromQuery,
  }
})
