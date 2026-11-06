import type { LocationQuery, LocationQueryRaw } from 'vue-router'

/**
 * Les onglets de la fiche annonce. L'onglet actif vit dans l'URL
 * (`?onglet=negocier`), comme les filtres : le retour arrière et un lien
 * partagé rouvrent le même onglet. La synthèse, onglet par défaut, n'écrit
 * rien dans l'URL.
 *
 * Lot 19 (ADR 0029) : sept onglets, chacun répond à une question. Les
 * identifiants des lots 9 à 18 (`financer`, `suivi`, `echanges`) restent
 * lus et mènent au nouvel onglet : les liens partagés, les notifications et
 * les e-mails déjà envoyés continuent de marcher.
 */
export const LISTING_TABS = [
  { id: 'synthese', label: 'Synthèse', question: 'Faut-il y aller ?' },
  { id: 'bien', label: 'Le bien', question: 'Qu’est-ce qu’on achète ?' },
  {
    id: 'budget',
    label: 'Budget',
    question: 'Peut-on se le permettre, et après ?',
  },
  { id: 'negocier', label: 'Négocier', question: 'Combien proposer ?' },
  { id: 'quartier', label: 'Quartier', question: 'Comment on y vit ?' },
  {
    id: 'a-faire',
    label: 'À faire',
    question: 'Qu’est-ce qu’il reste à faire ?',
  },
  {
    id: 'historique',
    label: 'Historique',
    question: 'Que s’est-il passé ?',
  },
] as const

export type ListingTab = (typeof LISTING_TABS)[number]['id']

export const DEFAULT_LISTING_TAB: ListingTab = 'synthese'

/** Le paramètre de requête de l'onglet. */
export const LISTING_TAB_QUERY_KEY = 'onglet'

/** Les anciens identifiants (lots 9 à 18) et l'onglet qui les remplace. */
export const LEGACY_LISTING_TABS: Readonly<Record<string, ListingTab>> = {
  financer: 'budget',
  suivi: 'a-faire',
  echanges: 'a-faire',
}

const TAB_IDS: readonly string[] = LISTING_TABS.map(t => t.id)

export function isListingTab(value: unknown): value is ListingTab {
  return typeof value === 'string' && TAB_IDS.includes(value)
}

/** La question d'un onglet, affichée en tête de son panneau. */
export function listingTabQuestion(tab: ListingTab): string {
  return LISTING_TABS.find(t => t.id === tab)?.question ?? ''
}

function rawTab(query: LocationQuery | LocationQueryRaw): unknown {
  const raw = query[LISTING_TAB_QUERY_KEY]
  return Array.isArray(raw) ? raw[0] : raw
}

/**
 * L'onglet lu dans la requête : un ancien identifiant mène à son nouvel
 * onglet ; une valeur inconnue rend la synthèse.
 */
export function listingTabFromQuery(
  query: LocationQuery | LocationQueryRaw
): ListingTab {
  const value = rawTab(query)
  if (isListingTab(value)) return value
  if (typeof value === 'string' && value in LEGACY_LISTING_TABS) {
    return LEGACY_LISTING_TABS[value] as ListingTab
  }
  return DEFAULT_LISTING_TAB
}

/**
 * La requête à réécrire quand l'URL porte un ancien identifiant
 * (`?onglet=suivi` → `?onglet=a-faire`), sinon null.
 */
export function legacyTabRedirect<T extends LocationQuery | LocationQueryRaw>(
  query: T
): T | null {
  const value = rawTab(query)
  if (typeof value !== 'string' || !(value in LEGACY_LISTING_TABS)) return null
  return {
    ...withoutListingTab(query),
    ...listingTabQuery(LEGACY_LISTING_TABS[value] as ListingTab),
  } as T
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
