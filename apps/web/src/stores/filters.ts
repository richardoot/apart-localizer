import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  ListingFiltersSchema,
  ListingListQuerySchema,
  listingFiltersFromQuery,
  listingFiltersToQuery,
} from '@apart/contracts'
import type {
  ListingFilters,
  ListingFiltersInput,
  ListingStatus,
  PointRadius,
} from '@apart/contracts'
import type { LocationQueryRaw } from 'vue-router'

export type ListingView = 'table' | 'cards' | 'map'
export const LISTING_VIEWS: readonly ListingView[] = ['table', 'cards', 'map']

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

export function viewFromQuery(query: Query): ListingView {
  const view = firstValue(query.view)
  return LISTING_VIEWS.includes(view as ListingView)
    ? (view as ListingView)
    : 'table'
}

/** L'inverse : la chaîne de requête de la page, vue comprise, défauts omis. */
export function queryFromFilters(
  filters: FilterState,
  view: ListingView
): LocationQueryRaw {
  const query: LocationQueryRaw = listingFiltersToQuery(filters)
  if (view !== 'table') query.view = view
  return query
}

/**
 * Les filtres partagés par le tableau, les cartes et la carte, et la vue
 * courante. La page les synchronise avec l'URL (`queryFromFilters`) pour
 * qu'un lien reproduise exactement ce qu'on voit.
 */
export const useFiltersStore = defineStore('filters', () => {
  const filters = ref<FilterState>(filtersFromQuery({}))
  const view = ref<ListingView>('table')

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

  function toggleStatus(status: ListingStatus): void {
    const current = filters.value.status ?? []
    const next = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status]
    patch({ status: next.length ? next : undefined })
  }

  function setNear(near: PointRadius | undefined): void {
    patch({ near })
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
  }

  const routeQuery = computed(() => queryFromFilters(filters.value, view.value))

  return {
    filters,
    view,
    activeCount,
    routeQuery,
    apiFilters,
    patch,
    toggleStatus,
    setNear,
    setSort,
    reset,
    loadFromQuery,
  }
})
