import { listingSourceFromUrl, normalizeUrl } from './normalize.js'
import type { ListingSource } from './enums.js'

/**
 * Partage depuis le mobile et alertes e-mail (besoin C9) : ce que le système
 * de partage ou l'e-mail transmet, et rien d'autre. Aucune page n'est
 * téléchargée ; on lit le lien, le titre et le texte donnés. Fonctions pures.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"'()[\]{}]+/gi
/** Sans drapeau `g` : `test` ne garde pas d'état entre deux appels. */
const HAS_URL = /https?:\/\//i

/** Les URL http(s) d'un texte, sans ponctuation finale, dans l'ordre, sans doublon. */
export function extractUrls(text: string | null | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const match of text.matchAll(URL_PATTERN)) {
    const cleaned = match[0].replace(/[.,;:!?…»]+$/u, '')
    const key = normalizeUrl(cleaned)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
  }
  return result
}

/** Ce que la feuille de partage du téléphone donne à la PWA (`share_target`). */
export interface SharedPayload {
  title?: string | null
  text?: string | null
  url?: string | null
}

export interface SharedListing {
  /** Le lien de l'annonce : `url`, sinon le premier lien du texte ou du titre. */
  url: string | null
  /** Le texte à analyser : titre et texte partagés, sans le lien répété. */
  text: string
  title: string | null
  source: ListingSource
}

/**
 * Le partage d'une annonce depuis Leboncoin, SeLoger ou le navigateur : les
 * applications mettent le lien tantôt dans `url`, tantôt dans `text`
 * (« Regarde cette annonce : https://… »).
 */
export function parseSharedListing(payload: SharedPayload): SharedListing {
  const title = payload.title?.trim() || null
  const rawText = payload.text?.trim() ?? ''
  const direct = payload.url?.trim() || null
  const url =
    (direct && normalizeUrl(direct) ? direct : null) ??
    extractUrls(rawText)[0] ??
    extractUrls(title)[0] ??
    null
  const parts = [title, rawText]
    .filter((part): part is string => Boolean(part))
    .map(part => (url ? part.split(url).join(' ').trim() : part))
    .filter(Boolean)
  const text = [...new Set(parts)].join('\n').trim()
  return { url, text, title, source: listingSourceFromUrl(url) }
}

/** Le texte lisible d'un HTML d'e-mail : balises retirées, liens gardés à côté de leur texte. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(
      /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, inner: string) => ` ${inner} ${href} `
    )
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/td)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&euro;/gi, '€')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/** Hôtes des portails d'annonces reconnus dans une alerte. */
const LISTING_HOSTS = [
  'leboncoin.fr',
  'seloger.com',
  'pap.fr',
  'bienici.com',
  'logic-immo.com',
  'figaroimmo.fr',
  'immobilier.lefigaro.fr',
  'ouestfrance-immo.com',
  'paruvendu.fr',
  'superimmo.com',
  'avendrealouer.fr',
  'meilleursagents.com',
]

/** Segments d'URL qui ne désignent jamais une annonce (désabonnement, aide, réglages). */
const NON_LISTING_HINTS =
  /(unsubscribe|desabonn|desinscri|preferences|parametres|settings|aide|help|faq|cgu|conditions|privacy|confidentialite|mon-compte|account|login|connexion|app-store|play\.google|apple\.com|facebook|twitter|instagram|linkedin|youtube)/i

/** Vrai si le lien ressemble à une page d'annonce d'un portail connu. */
export function isListingUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (!LISTING_HOSTS.some(h => host === h || host.endsWith(`.${h}`)))
    return false
  if (NON_LISTING_HINTS.test(url)) return false
  // Une page d'annonce porte un identifiant numérique dans son chemin.
  return /\d{5,}/.test(parsed.pathname + parsed.search)
}

/** Une annonce repérée dans un e-mail d'alerte, avant toute extraction. */
export interface AlertCandidate {
  url: string
  source: ListingSource
  /** Le texte autour du lien : la matière de l'extraction. */
  snippet: string
  title: string | null
  price: number | null
  surface: number | null
  rooms: number | null
  commune: string | null
}

const PRICE_PATTERN =
  /(\d{1,3}(?:[ \u00a0\u202f.]\d{3})+|\d{4,7})(?:,\d{1,2})?\s?(?:€|euros?\b|EUR\b)/i
const SURFACE_PATTERN = /(\d{1,4}(?:[,.]\d{1,2})?)\s?(?:m²|m2|m\b)/i
const ROOMS_PATTERN =
  /(\d{1,2})\s?(?:pièces?|pieces?|p\.?\b)|\b[TF](\d{1,2})\b/i
const COMMUNE_PATTERN =
  /\b(Bordeaux|Talence|Mérignac|Merignac|Pessac|Bègles|Begles|Le Bouscat|Villenave[- ]d['’]Ornon|Gradignan|Cenon|Floirac|Lormont|Eysines|Bruges|Caudéran|Cauderan|Le Haillan|Bassens|Blanquefort|Saint-Médard-en-Jalles|Ambarès-et-Lagrave|Artigues-près-Bordeaux|Bouliac|Carbon-Blanc|Le Taillan-Médoc|Martignas-sur-Jalle|Parempuyre|Saint-Aubin-de-Médoc|Saint-Louis-de-Montferrand|Saint-Vincent-de-Paul|Ambès)\b/i

function parseFrenchNumber(raw: string): number {
  return Number(raw.replace(/[ \u00a0\u202f.]/g, '').replace(',', '.'))
}

/** Prix, surface, pièces et commune lus dans un extrait, sans rien deviner. */
export function readAlertFacts(
  snippet: string
): Pick<AlertCandidate, 'price' | 'surface' | 'rooms' | 'commune'> {
  const price = snippet.match(PRICE_PATTERN)
  const surface = snippet.match(SURFACE_PATTERN)
  const rooms = snippet.match(ROOMS_PATTERN)
  const commune = snippet.match(COMMUNE_PATTERN)
  const priceValue = price?.[1] ? parseFrenchNumber(price[1]) : null
  const surfaceValue = surface?.[1] ? parseFrenchNumber(surface[1]) : null
  const roomsValue = rooms ? Number(rooms[1] ?? rooms[2]) : null
  return {
    // Un prix d'achat plausible ; un loyer ou des charges n'en sont pas un.
    price:
      priceValue !== null && priceValue >= 10_000 && priceValue <= 10_000_000
        ? priceValue
        : null,
    surface:
      surfaceValue !== null && surfaceValue >= 8 && surfaceValue <= 1000
        ? surfaceValue
        : null,
    rooms:
      roomsValue !== null && roomsValue >= 1 && roomsValue <= 20
        ? roomsValue
        : null,
    commune: commune?.[1] ? normalizeCommuneName(commune[1]) : null,
  }
}

function normalizeCommuneName(raw: string): string {
  const known: Record<string, string> = {
    merignac: 'Mérignac',
    begles: 'Bègles',
    cauderan: 'Bordeaux',
    caudéran: 'Bordeaux',
  }
  const lower = raw.toLowerCase().replace(/’/g, "'")
  if (known[lower]) return known[lower]
  if (lower.startsWith('villenave')) return "Villenave-d'Ornon"
  return raw
    .split(/([ -])/)
    .map(part =>
      part.length > 1 && !['de', 'en', 'sur', 'et', 'près'].includes(part)
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : part
    )
    .join('')
}

/** Le nombre de lettres d'une ligne : la ligne la plus « parlante » fait le titre. */
function letterCount(line: string): number {
  return (line.match(/\p{L}/gu) ?? []).length
}

/**
 * Les annonces d'un e-mail d'alerte (SeLoger, Leboncoin, PAP, Bien'ici…) :
 * chaque lien d'annonce avec le texte qui l'accompagne (le bloc qui le
 * précède depuis le lien précédent, ou à défaut celui qui le suit) et ce
 * qu'on peut en lire sans IA (prix, surface, pièces, commune). Au plus
 * `max` annonces.
 */
export function parseAlertEmail(
  email: {
    subject?: string | null
    text?: string | null
    html?: string | null
  },
  max = 10
): AlertCandidate[] {
  const body = [email.text ?? '', email.html ? htmlToText(email.html) : '']
    .filter(Boolean)
    .join('\n')
    // Un lien termine sa ligne : deux annonces sur une ligne se séparent.
    .replace(URL_PATTERN, match => `${match}\n`)
  const lines = body
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const links: Array<{ index: number; url: string }> = []
  const seen = new Set<string>()
  lines.forEach((line, index) => {
    const url = extractUrls(line)[0]
    if (!url || links.length >= max) return
    const key = normalizeUrl(url)
    if (!key || seen.has(key) || !isListingUrl(url)) return
    seen.add(key)
    links.push({ index, url })
  })
  const strip = (block: string[]): string =>
    block
      .map(line =>
        line
          .replace(URL_PATTERN, ' ')
          .replace(/[ ]{2,}/g, ' ')
          .trim()
      )
      .filter(Boolean)
      .join('\n')
  // Toute ligne qui porte un lien (annonce, désabonnement, aide…) borne un bloc.
  const urlLines = lines
    .map((line, index) => (HAS_URL.test(line) ? index : -1))
    .filter(index => index >= 0)
  return links.map(link => {
    const previous = Math.max(-1, ...urlLines.filter(i => i < link.index))
    const next = Math.min(lines.length, ...urlLines.filter(i => i > link.index))
    const before = lines.slice(
      Math.max(previous + 1, link.index - 6),
      link.index + 1
    )
    const after = lines.slice(link.index + 1, Math.min(next, link.index + 7))
    const beforeText = strip(before)
    const beforeFacts = readAlertFacts(beforeText)
    const useAfter =
      beforeFacts.price === null &&
      beforeFacts.surface === null &&
      after.length > 0
    const block = useAfter ? [...before.slice(-1), ...after] : before
    const snippet = strip(block)
    const title =
      snippet
        .split('\n')
        .filter(line => line.length >= 6 && !HAS_URL.test(line))
        .reduce<string | null>(
          (best, line) =>
            best === null || letterCount(line) > letterCount(best)
              ? line
              : best,
          null
        ) ?? null
    return {
      url: link.url,
      source: listingSourceFromUrl(link.url),
      snippet: snippet.slice(0, 4000),
      title: title ? title.slice(0, 200) : null,
      ...(useAfter ? readAlertFacts(snippet) : beforeFacts),
    }
  })
}
