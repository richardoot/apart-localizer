import type { ListingSource } from './enums.js'

/**
 * Normalisations partagées par la détection de doublons (API), le web et les
 * scripts : une URL d'annonce et une adresse comparées une fois nettoyées.
 * Fonctions pures.
 */

/** Paramètres de requête qui ne distinguent pas deux annonces (suivi, tri, pagination). */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'ref',
  'referrer',
  'from',
  'origin',
  'source',
  'page',
  'sort',
  'order',
  'tri',
])

/**
 * Une URL d'annonce réduite à ce qui identifie la page : schéma https,
 * hôte en minuscules sans `www.`, chemin sans barre finale, paramètres de
 * suivi retirés et restants triés, pas de fragment. Rend `null` si la chaîne
 * n'est pas une URL http(s).
 */
export function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
  const search = new URLSearchParams(params).toString()
  const path = url.pathname.replace(/\/+$/, '') || '/'
  return `https://${host}${path}${search ? `?${search}` : ''}`
}

/** Le portail, déduit du nom d'hôte de l'URL. */
export function listingSourceFromUrl(
  url: string | null | undefined
): ListingSource {
  if (!url) return 'autre'
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return 'autre'
  }
  if (host.includes('leboncoin')) return 'leboncoin'
  if (host.includes('seloger')) return 'seloger'
  if (host.includes('bienici') || host.includes('bien-ici')) return 'bienici'
  if (host.includes('pap.fr')) return 'pap'
  // Lot 18 : Logic-Immo n'a pas de valeur dans `ListingSource` (lien principal).
  if (host.includes('logic-immo')) return 'autre'
  return 'agence'
}

/** Abréviations courantes des adresses françaises, vers leur forme longue. */
const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  av: 'avenue',
  ave: 'avenue',
  bd: 'boulevard',
  bld: 'boulevard',
  boul: 'boulevard',
  r: 'rue',
  pl: 'place',
  imp: 'impasse',
  all: 'allee',
  chem: 'chemin',
  ch: 'chemin',
  crs: 'cours',
  rte: 'route',
  sq: 'square',
  st: 'saint',
  ste: 'sainte',
  fg: 'faubourg',
  res: 'residence',
  bat: 'batiment',
  appt: 'appartement',
  apt: 'appartement',
}

/** Mots qui ne distinguent pas deux adresses (compléments, « bis », « ter »...). */
const ADDRESS_NOISE = new Set([
  'bis',
  'ter',
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'l',
  'd',
  'et',
  'a',
  'au',
  'aux',
  'france',
])

/**
 * Une adresse comparable : minuscules, sans accents ni ponctuation,
 * abréviations développées, mots vides et code postal retirés, mots triés
 * pour que « 12 rue du Forum, Talence » et « Talence 12 r. du Forum »
 * coïncident. Rend `null` quand il ne reste rien à comparer.
 */
export function normalizeAddress(
  value: string | null | undefined
): string | null {
  if (!value) return null
  const words = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => ADDRESS_ABBREVIATIONS[word] ?? word)
    .filter(word => !ADDRESS_NOISE.has(word))
    .filter(word => !/^\d{5}$/.test(word))
  if (words.length === 0) return null
  return [...new Set(words)].sort().join(' ')
}

/** Une commune comparable : minuscules, sans accents, tirets et apostrophes neutralisés, « St » développé. */
export function normalizeCommune(
  value: string | null | undefined
): string | null {
  if (!value) return null
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(word => (word === 'st' ? 'saint' : word === 'ste' ? 'sainte' : word))
    .join(' ')
  return normalized || null
}

/** Vrai si `b` est à ±`tolerance` (fraction) de `a` ; faux si l'une des valeurs manque. */
export function withinPercent(
  a: number | null | undefined,
  b: number | null | undefined,
  tolerance: number
): boolean {
  if (a == null || b == null || a <= 0 || b <= 0) return false
  return Math.abs(a - b) / Math.max(a, b) <= tolerance
}
