import type { LocationQuery, LocationQueryRaw } from 'vue-router'

/**
 * Les onglets de la fiche annonce (lot 9). L'onglet actif vit dans l'URL
 * (`?onglet=negocier`), comme les filtres : le retour arrière et un lien
 * partagé rouvrent le même onglet. La synthèse, onglet par défaut, n'écrit
 * rien dans l'URL.
 */
export const LISTING_TABS = [
  { id: 'synthese', label: 'Synthèse', short: 'Synthèse' },
  { id: 'negocier', label: 'Négocier', short: 'Négocier' },
  { id: 'financer', label: 'Financer et louer', short: 'Financer' },
  { id: 'quartier', label: 'Quartier', short: 'Quartier' },
  { id: 'suivi', label: 'Suivi', short: 'Suivi' },
] as const

export type ListingTab = (typeof LISTING_TABS)[number]['id']

export const DEFAULT_LISTING_TAB: ListingTab = 'synthese'

/** Le paramètre de requête de l'onglet. */
export const LISTING_TAB_QUERY_KEY = 'onglet'

const TAB_IDS: readonly string[] = LISTING_TABS.map(t => t.id)

export function isListingTab(value: unknown): value is ListingTab {
  return typeof value === 'string' && TAB_IDS.includes(value)
}

/** L'onglet lu dans la requête ; une valeur inconnue rend la synthèse. */
export function listingTabFromQuery(
  query: LocationQuery | LocationQueryRaw
): ListingTab {
  const raw = query[LISTING_TAB_QUERY_KEY]
  const value = Array.isArray(raw) ? raw[0] : raw
  return isListingTab(value) ? value : DEFAULT_LISTING_TAB
}

/** La requête sans l'onglet : ce que les filtres de la liste comparent et gardent. */
export function withoutListingTab<T extends LocationQuery | LocationQueryRaw>(
  query: T
): T {
  const { [LISTING_TAB_QUERY_KEY]: _tab, ...rest } = query
  return rest as T
}

/** Le morceau de requête d'un onglet : vide pour la synthèse. */
export function listingTabQuery(tab: ListingTab): LocationQueryRaw {
  return tab === DEFAULT_LISTING_TAB ? {} : { [LISTING_TAB_QUERY_KEY]: tab }
}
