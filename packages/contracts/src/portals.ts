import { z } from 'zod'
import type { ListingSource } from './enums.js'

/**
 * Les portails d'annonces parcourus par une exploration (lot 16, ADR 0026) :
 * leur énumération, les portails cochés d'un critère et les modèles de
 * recherche datés. Les liens de recherche sont fabriqués sans réseau par
 * `domain` (`portalSearchUrls`) ; le serveur ne télécharge jamais une page.
 */

// ---------------------------------------------------------------------------
// Portails
// ---------------------------------------------------------------------------

export const ExplorationPortalSchema = z
  .enum(['leboncoin', 'seloger', 'bienici', 'pap', 'logicimmo', 'other'])
  .describe(
    'Portail où l’annonce a été lue : leboncoin, seloger, bienici, pap, logicimmo, other (autre site)'
  )
export type ExplorationPortal = z.infer<typeof ExplorationPortalSchema>

export const EXPLORATION_PORTAL_LABELS: Record<ExplorationPortal, string> = {
  leboncoin: 'Leboncoin',
  seloger: 'SeLoger',
  bienici: 'Bien’ici',
  pap: 'PAP',
  logicimmo: 'Logic-Immo',
  other: 'Autre portail',
}

/** Les portails qu'une exploration parcourt, dans l'ordre du brief. */
export const SearchPortalSchema = z
  .enum(['leboncoin', 'seloger', 'bienici', 'pap', 'logicimmo'])
  .describe('Portail à parcourir : leboncoin, seloger, bienici, pap, logicimmo')
export type SearchPortal = z.infer<typeof SearchPortalSchema>

export const SEARCH_PORTALS: readonly SearchPortal[] =
  SearchPortalSchema.options

/**
 * Les portails cochés d'un critère (`search_criteria.portals`) ; absent ou
 * vide = tous. Sans doublon.
 */
export const CriteriaPortalsSchema = z
  .array(SearchPortalSchema)
  .max(SEARCH_PORTALS.length)
  .refine(list => new Set(list).size === list.length, {
    message: 'Un portail ne se coche qu’une fois',
  })
  .describe(
    'Portails à parcourir pour ce critère (leboncoin, seloger, bienici, pap, logicimmo) ; null = tous'
  )

/** Les portails cochés d'un critère enregistré : null, vide ou illisible = tous. */
export function criteriaPortalsOf(value: unknown): SearchPortal[] {
  const parsed = CriteriaPortalsSchema.safeParse(value)
  return parsed.success && parsed.data.length > 0
    ? SEARCH_PORTALS.filter(p => parsed.data.includes(p))
    : [...SEARCH_PORTALS]
}

/** La source d'une annonce créée depuis un portail (énumération des annonces). */
export const PORTAL_LISTING_SOURCE: Record<
  ExplorationPortal,
  { source: ListingSource; sourceLabel: string | null }
> = {
  leboncoin: { source: 'leboncoin', sourceLabel: null },
  seloger: { source: 'seloger', sourceLabel: null },
  bienici: { source: 'bienici', sourceLabel: null },
  pap: { source: 'pap', sourceLabel: null },
  logicimmo: { source: 'autre', sourceLabel: 'Logic-Immo' },
  other: { source: 'autre', sourceLabel: null },
}

// ---------------------------------------------------------------------------
// Portail d'un lien d'annonce (lot 18, ADR 0028)
// ---------------------------------------------------------------------------

/**
 * Le portail d'un lien d'annonce (`listing_links.portal`) : les cinq portails
 * reconnus, le site d'une agence ou d'un réseau de mandataires, ou un autre
 * site. Plus riche que la source d'une annonce (`ListingSource`, gardée pour
 * le lien principal et l'export de version 1) : Logic-Immo y a sa valeur.
 */
export const ListingPortalSchema = z
  .enum([
    'leboncoin',
    'seloger',
    'bienici',
    'pap',
    'logicimmo',
    'agence',
    'autre',
  ])
  .describe(
    'Portail du lien : leboncoin, seloger, bienici, pap, logicimmo, agence (site d’une agence ou d’un réseau de mandataires), autre (autre site)'
  )
export type ListingPortal = z.infer<typeof ListingPortalSchema>

export const LISTING_PORTAL_LABELS: Record<ListingPortal, string> = {
  leboncoin: 'Leboncoin',
  seloger: 'SeLoger',
  bienici: 'Bien’ici',
  pap: 'PAP',
  logicimmo: 'Logic-Immo',
  agence: 'Site d’agence',
  autre: 'Autre site',
}

/** Les pastilles courtes de la liste et du téléphone. */
export const LISTING_PORTAL_SHORT_LABELS: Record<ListingPortal, string> = {
  leboncoin: 'LBC',
  seloger: 'SL',
  bienici: 'BI',
  pap: 'PAP',
  logicimmo: 'LI',
  agence: 'Ag.',
  autre: 'Autre',
}

/**
 * Le champ `source` d'une annonce tiré du portail de son lien principal :
 * Logic-Immo n'a pas de valeur dans `ListingSource` (version 1 de l'export),
 * il reste « autre » avec le libellé « Logic-Immo ».
 */
export const LISTING_PORTAL_SOURCE: Record<
  ListingPortal,
  { source: ListingSource; sourceLabel: string | null }
> = {
  leboncoin: { source: 'leboncoin', sourceLabel: null },
  seloger: { source: 'seloger', sourceLabel: null },
  bienici: { source: 'bienici', sourceLabel: null },
  pap: { source: 'pap', sourceLabel: null },
  logicimmo: { source: 'autre', sourceLabel: 'Logic-Immo' },
  agence: { source: 'agence', sourceLabel: null },
  autre: { source: 'autre', sourceLabel: null },
}

/** Le portail d'un lien lu pendant une exploration (« other » : le lien le dira, sinon « autre »). */
export const EXPLORATION_LINK_PORTAL: Record<ExplorationPortal, ListingPortal> =
  {
    leboncoin: 'leboncoin',
    seloger: 'seloger',
    bienici: 'bienici',
    pap: 'pap',
    logicimmo: 'logicimmo',
    other: 'autre',
  }

/** Une plage de valeurs dans l'URL de recherche : `min-max`, une borne absente valant `min` ou `max`. */
export interface PortalRangeParameter {
  key: string
}

/**
 * Ce que l'on sait fabriquer pour un portail. `parameters` : la recherche
 * se pré-remplit par l'URL (paramètres relevés sur ses URL publiques de
 * recherche) ; `manual` : aucun paramètre n'est assez sûr, le lien ouvre la
 * page de recherche et le brief donne les « filtres à saisir ». Les
 * filtres non pris en charge par l'URL (zone, DPE…) sont toujours à saisir.
 */
export interface PortalSearchTemplate {
  portal: SearchPortal
  label: string
  /** La page de recherche (ou d'accueil, qui porte le formulaire de recherche). */
  searchPage: string
  mode: 'parameters' | 'manual'
  /** Paramètres fixes (catégorie « ventes immobilières », type « appartement »). */
  fixed: Readonly<Record<string, string>>
  price: PortalRangeParameter | null
  surface: PortalRangeParameter | null
  rooms: PortalRangeParameter | null
  note: string
}

/**
 * Les modèles de recherche par portail, datés et sourcés. Seuls les
 * paramètres de Leboncoin sont assez stables et connus pour être fabriqués
 * (`category=9` ventes immobilières, `real_estate_type=2` appartement, plages
 * `price`, `square`, `rooms` au format `min-max`) ; la zone reste à saisir
 * (les codes de lieu demandent les codes postaux, que l'application n'a
 * pas). SeLoger, Bien'ici, PAP et Logic-Immo ont changé de forme d'URL ces
 * dernières années (identifiants de lieu propres à chaque portail) : rien
 * n'est inventé, le lien ouvre le portail et les filtres sont à saisir. À
 * revoir avec sa date si un portail change.
 */
export const PORTAL_SEARCH_TEMPLATES: Readonly<
  Record<SearchPortal, PortalSearchTemplate>
> = {
  leboncoin: {
    portal: 'leboncoin',
    label: 'Leboncoin',
    searchPage: 'https://www.leboncoin.fr/recherche',
    mode: 'parameters',
    fixed: { category: '9', real_estate_type: '2' },
    price: { key: 'price' },
    surface: { key: 'square' },
    rooms: { key: 'rooms' },
    note: 'Ventes immobilières, appartements ; prix, surface et pièces dans le lien. Zone et DPE à saisir.',
  },
  seloger: {
    portal: 'seloger',
    label: 'SeLoger',
    searchPage: 'https://www.seloger.com/',
    mode: 'manual',
    fixed: {},
    price: null,
    surface: null,
    rooms: null,
    note: 'Filtres à saisir dans le formulaire de recherche (achat, appartement).',
  },
  bienici: {
    portal: 'bienici',
    label: 'Bien’ici',
    searchPage: 'https://www.bienici.com/',
    mode: 'manual',
    fixed: {},
    price: null,
    surface: null,
    rooms: null,
    note: 'Filtres à saisir ; Bien’ici permet aussi de dessiner la zone sur la carte.',
  },
  pap: {
    portal: 'pap',
    label: 'PAP',
    searchPage: 'https://www.pap.fr/',
    mode: 'manual',
    fixed: {},
    price: null,
    surface: null,
    rooms: null,
    note: 'Filtres à saisir (vente, appartement) ; annonces de particuliers.',
  },
  logicimmo: {
    portal: 'logicimmo',
    label: 'Logic-Immo',
    searchPage: 'https://www.logic-immo.com/',
    mode: 'manual',
    fixed: {},
    price: null,
    surface: null,
    rooms: null,
    note: 'Filtres à saisir dans le formulaire de recherche (achat, appartement).',
  },
}

/** La date et la source des modèles de recherche. */
export const PORTAL_SEARCH_TEMPLATES_SOURCE = {
  asOf: '2026-11-05',
  label:
    'URL publiques de recherche des portails, relevées pour le lot 16 (ADR 0026) ; seuls les paramètres de Leboncoin sont fabriqués, les autres portails ouvrent leur page de recherche avec les filtres à saisir',
} as const
