import { BORDEAUX_METROPOLE_COMMUNES } from '@apart/contracts'

/**
 * OpenStreetMap par l'API Overpass (lot 11) : la requête des 28 communes de
 * Bordeaux Métropole, la lecture d'une réponse JSON (`out center tags`) et
 * quelques étiquettes communes (nom, adresse, lien). Pur, sauf
 * `fetchOverpass` (réseau, à l'import seulement, jamais dans les tests).
 * Données © contributeurs OpenStreetMap, licence ODbL.
 */

/** Le point d'entrée public de l'API Overpass. */
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

/** La zone des 28 communes (relations administratives de niveau 8 par code INSEE), nommée `.bm`. */
export function metropoleArea(): string {
  const codes = BORDEAUX_METROPOLE_COMMUNES.map(c => c.inseeCode).join('|')
  return `rel["boundary"="administrative"]["admin_level"="8"]["ref:INSEE"~"^(${codes})$"];\nmap_to_area->.bm;`
}

/** Une requête Overpass JSON sur la métropole : les sélecteurs reçoivent `(area.bm)`. */
export function overpassQuery(selectors: readonly string[]): string {
  return [
    '[out:json][timeout:180];',
    metropoleArea(),
    '(',
    ...selectors.map(s => `  ${s}(area.bm);`),
    ');',
    'out center tags;',
  ].join('\n')
}

export type OsmTags = Record<string, string>

/** Un objet OSM ramené à un point (le centre d'une voie ou d'une relation). */
export interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  tags: OsmTags
  longitude: number
  latitude: number
}

export interface OverpassResult {
  elements: OsmElement[]
  /** La date de la base OSM servie (`osm3s.timestamp_osm_base`). */
  timestamp: string | null
  /** Objets sans position (ni `lat`/`lon` ni `center`), écartés. */
  withoutPosition: number
}

/** Lit une réponse Overpass (`[out:json]`, `out center tags`). */
export function parseOverpass(data: unknown): OverpassResult {
  const raw = data as {
    osm3s?: { timestamp_osm_base?: unknown }
    elements?: unknown
  }
  if (!raw || !Array.isArray(raw.elements)) {
    throw new Error('Réponse Overpass illisible : `elements` absent.')
  }
  const elements: OsmElement[] = []
  let withoutPosition = 0
  for (const item of raw.elements as Array<Record<string, unknown>>) {
    const type = item.type
    if (type !== 'node' && type !== 'way' && type !== 'relation') continue
    const center = item.center as { lat?: unknown; lon?: unknown } | undefined
    const lat = typeof item.lat === 'number' ? item.lat : center?.lat
    const lon = typeof item.lon === 'number' ? item.lon : center?.lon
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      withoutPosition++
      continue
    }
    const tags: OsmTags = {}
    for (const [key, value] of Object.entries(
      (item.tags as Record<string, unknown> | undefined) ?? {}
    )) {
      if (typeof value === 'string') tags[key] = value
    }
    elements.push({
      type,
      id: Number(item.id),
      tags,
      longitude: lon,
      latitude: lat,
    })
  }
  const timestamp = raw.osm3s?.timestamp_osm_base
  return {
    elements,
    timestamp: typeof timestamp === 'string' ? timestamp : null,
    withoutPosition,
  }
}

/** L'identifiant d'import d'un objet : `node/123`, `way/45`. */
export const osmId = (element: Pick<OsmElement, 'type' | 'id'>): string =>
  `${element.type}/${element.id}`

/** La fiche de l'objet sur openstreetmap.org. */
export const osmUrl = (element: Pick<OsmElement, 'type' | 'id'>): string =>
  `https://www.openstreetmap.org/${element.type}/${element.id}`

/**
 * Le nom affiché : `name`, complété de `branch` (« E.Leclerc Drive » +
 * « Relais Bordeaux Stalingrad ») quand le nom ne la contient pas, sinon
 * l'enseigne ; null si l'objet n'a ni nom ni enseigne.
 */
export function osmDisplayName(tags: OsmTags): string | null {
  const name = tags.name?.trim() || tags.brand?.trim() || null
  const branch = tags.branch?.trim()
  if (!name) return null
  if (branch && !name.toLowerCase().includes(branch.toLowerCase())) {
    return `${name} – ${branch}`
  }
  return name
}

/** L'adresse `addr:*` en une ligne (« 26 Avenue X, 33700 Mérignac »), null sans rue. */
export function osmAddress(tags: OsmTags): string | null {
  const street = tags['addr:street']?.trim()
  if (!street) return null
  const number = tags['addr:housenumber']?.trim()
  const city = [tags['addr:postcode']?.trim(), tags['addr:city']?.trim()]
    .filter(Boolean)
    .join(' ')
  return [number ? `${number} ${street}` : street, city]
    .filter(Boolean)
    .join(', ')
}

/** Distance approchée en mètres entre deux points (projection équirectangulaire locale). */
export function metersBetween(
  a: readonly [number, number],
  b: readonly [number, number]
): number {
  const kx = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180) * 111_320
  const dx = (a[0] - b[0]) * kx
  const dy = (a[1] - b[1]) * 110_540
  return Math.sqrt(dx * dx + dy * dy)
}

/** Une requête Overpass (import seulement). Le User-Agent ne porte aucune donnée personnelle. */
export async function fetchOverpass(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  const response = await fetchImpl(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'apart-localizer (import open data)',
    },
    body: new URLSearchParams({ data: query }).toString(),
  })
  if (!response.ok) {
    throw new Error(
      `Overpass a répondu ${response.status} : réessayez plus tard (serveur public très sollicité).`
    )
  }
  return response.json()
}

/** Un fichier JSON (GeoJSON, export) téléchargé tel quel, pour `--download`. */
export async function fetchJson(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'apart-localizer (import open data)' },
  })
  if (!response.ok) {
    throw new Error(`${url} a répondu ${response.status}.`)
  }
  return response.json()
}
