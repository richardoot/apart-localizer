import { normalizeUrl } from '@apart/contracts'
import type { ExplorationPortal, ListingPortal } from '@apart/contracts'

/**
 * Les liens d'annonce (lots 16 et 18) : reconnaître le portail d'après
 * l'hôte, réduire un lien à ce qui identifie l'annonce, pour reconnaître une
 * annonce déjà vue sur n'importe lequel de ses liens. Pur, sans réseau : un
 * lien n'est jamais ouvert par le serveur.
 */

/** Les hôtes des portails, du plus précis au plus large. */
const PORTAL_HOSTS: readonly [Exclude<ExplorationPortal, 'other'>, RegExp][] = [
  ['leboncoin', /(^|\.)leboncoin\.fr$/],
  ['seloger', /(^|\.)seloger\.com$/],
  ['bienici', /(^|\.)(bienici|bien-ici)\.com$/],
  ['pap', /(^|\.)pap\.fr$/],
  ['logicimmo', /(^|\.)logic-immo\.com$/],
]

/** Paramètres de suivi retirés en plus de ceux de `normalizeUrl` (préfixes compris). */
const EXTRA_TRACKING = new Set([
  'xtor',
  'msclkid',
  'gclsrc',
  'dclid',
  'yclid',
  'ttclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_gl',
  'srsltid',
  'cmp',
  'campaign',
])
const TRACKING_PREFIXES = ['utm_', 'at_', 'mtm_', 'pk_']

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.hostname.toLowerCase()
      : null
  } catch {
    return null
  }
}

/** Le portail d'un lien d'annonce, d'après son hôte ; « other » ailleurs. */
export function portalFromUrl(
  url: string | null | undefined
): ExplorationPortal {
  const host = hostOf(url)
  if (!host) return 'other'
  for (const [portal, pattern] of PORTAL_HOSTS) {
    if (pattern.test(host)) return portal
  }
  return 'other'
}

/**
 * Le lien d'une annonce réduit à ce qui l'identifie, pour reconnaître une
 * annonce déjà vue : `normalizeUrl` (https, hôte sans `www.`, chemin sans
 * barre finale, paramètres de suivi retirés, fragment ôté), puis, sur un
 * portail connu, aucun paramètre de requête (l'annonce y est désignée par
 * son chemin ; la requête porte la recherche d'où l'on vient), et sur
 * Leboncoin la forme `/ad/<catégorie>/<numéro>` (l'ancienne forme
 * `/<catégorie>/<numéro>.htm` y revient). Ailleurs, les paramètres de suivi
 * courants sont aussi retirés. Null si ce n'est pas un lien http(s).
 */
export function normalizeListingUrl(
  value: string | null | undefined
): string | null {
  const base = normalizeUrl(value)
  if (!base) return null
  const url = new URL(base)
  const portal = portalFromUrl(base)
  if (portal !== 'other') {
    url.search = ''
    if (portal === 'leboncoin') {
      const match = /^\/(?:ad\/)?([a-z_]+)\/(\d{6,})(?:\.htm)?$/.exec(
        url.pathname
      )
      if (match) url.pathname = `/ad/${match[1]}/${match[2]}`
    }
  } else {
    const kept = [...url.searchParams.entries()].filter(([key]) => {
      const lower = key.toLowerCase()
      return (
        !EXTRA_TRACKING.has(lower) &&
        !TRACKING_PREFIXES.some(prefix => lower.startsWith(prefix))
      )
    })
    url.search = new URLSearchParams(kept).toString()
  }
  return url.toString().replace(/\?$/, '')
}

/**
 * La clé d'un lien (lot 18) : le lien normalisé (`normalizeListingUrl`), ou,
 * pour un lien qui n'est pas http(s), le lien tel quel sans espaces. Elle est
 * unique dans l'espace (`listing_links.normalized_url`) ; null pour un lien
 * vide.
 */
export function linkKey(url: string | null | undefined): string | null {
  if (url === null || url === undefined) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  return normalizeListingUrl(trimmed) ?? trimmed
}

/** Le portail d'un lien (lot 18), s'il est reconnu d'après l'hôte ; null pour un autre site. */
export function linkPortalFromUrl(
  url: string | null | undefined
): ListingPortal | null {
  const portal = portalFromUrl(url)
  return portal === 'other' ? null : portal
}

/**
 * Le portail d'un lien : celui de l'hôte s'il est reconnu, sinon celui donné
 * (site d'agence choisi par le membre), sinon « autre ».
 */
export function detectLinkPortal(
  url: string | null | undefined,
  fallback: ListingPortal | null = null
): ListingPortal {
  return linkPortalFromUrl(url) ?? fallback ?? 'autre'
}
