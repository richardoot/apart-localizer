import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  ListingFiltersSchema,
  MAIN_TAB_FIT_LEVELS,
  ListingListQuerySchema,
  listingFiltersFromQuery,
  listingFiltersToQuery,
} from '@apart/contracts'
import type {
  CriteriaFitLevel,
  ListingFilters,
  ListingFiltersInput,
  ListingStatus,
  PointRadius,
} from '@apart/contracts'
import type { LocationQueryRaw } from 'vue-router'

export type ListingView = 'table' | 'cards' | 'map'

/**
 * L'onglet de la liste : « Dans les critères » ou « Hors critères » (lot 14),
 * ou « À valider » (lot 16 : brouillons reçus par e-mail ou trouvés par
 * Claude, `?vue=a-valider`).
 */
export type FitTab = 'main' | 'out' | 'drafts'

/** Lot 16 : le paramètre de l'onglet « À valider ». */
export const DRAFTS_TAB_QUERY = { vue: 'a-valider' } as const

/** L'onglet d'un filtre `fit` : « Hors critères » dès que le niveau out est demandé. */
export function fitTabOf(fit: readonly CriteriaFitLevel[] | undefined): FitTab {
  return fit?.includes('out') ? 'out' : 'main'
}

/**
 * Les niveaux de l'onglet principal après une pastille cochée ou décochée :
 * tous (ou aucun) = pas de filtre, l'onglet par défaut avec les annonces
 * gardées.
 */
export function toggledFitLevels(
  current: readonly CriteriaFitLevel[] | undefined,
  level: CriteriaFitLevel
): CriteriaFitLevel[] | undefined {
  const base: CriteriaFitLevel[] = (current ?? MAIN_TAB_FIT_LEVELS).filter(
    l => l !== 'out'
  )
  const next = base.includes(level)
    ? base.filter(l => l !== level)
    : [...base, level]
  const all = MAIN_TAB_FIT_LEVELS.every(l => next.includes(l))
  return next.length === 0 || all
    ? undefined
    : MAIN_TAB_FIT_LEVELS.filter(l => next.includes(l))
}
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

/** Lot 16 : l'onglet « À valider » est ouvert (`?vue=a-valider`). */
export function inboxFromQuery(query: Query): boolean {
  return firstValue(query.vue) === DRAFTS_TAB_QUERY.vue
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
  view: ListingView,
  inbox = false
): LocationQueryRaw {
  const query: LocationQueryRaw = listingFiltersToQuery(filters)
  if (view !== 'table') query.view = view
  if (inbox) query.vue = DRAFTS_TAB_QUERY.vue
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
  /** Lot 16 : l'onglet « À valider » est ouvert. */
  const inbox = ref(false)

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

  const fitTab = computed<FitTab>(() =>
    inbox.value ? 'drafts' : fitTabOf(filters.value.fit)
  )

  /**
   * Lot 14 : change d'onglet ; « Hors critères » = le niveau out seulement.
   * Lot 16 : « À valider » garde les filtres de la liste pour le retour.
   */
  function setFitTab(tab: FitTab): void {
    if (tab === 'drafts') {
      inbox.value = true
      return
    }
    inbox.value = false
    patch({ fit: tab === 'out' ? ['out'] : undefined })
  }

  function toggleFitLevel(level: CriteriaFitLevel): void {
    patch({ fit: toggledFitLevels(filters.value.fit, level) })
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
    inbox.value = inboxFromQuery(query)
  }

  const routeQuery = computed(() =>
    queryFromFilters(filters.value, view.value, inbox.value)
  )

  return {
    filters,
    view,
    inbox,
    activeCount,
    routeQuery,
    apiFilters,
    patch,
    toggleStatus,
    setNear,
    fitTab,
    setFitTab,
    toggleFitLevel,
    setSort,
    reset,
    loadFromQuery,
  }
})
