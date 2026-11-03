import { z } from 'zod'
import type { LocationPrecision, Point } from '@apart/contracts'

/**
 * Client du géocodeur de la Géoplateforme IGN (successeur de l'API Adresse),
 * sans état ni cache : une requête, un résultat. Le service Nest y ajoute le
 * cache en base ; le script d'import y ajoute son cache sur disque. `fetch`
 * est injecté pour que les tests n'atteignent jamais le réseau.
 */

export const GEOCODE_ENDPOINT = 'https://data.geopf.fr/geocodage/search/'

export type GeocodeKind = 'address' | 'municipality'

export interface GeocodeResult {
  point: Point
  precision: LocationPrecision
  label: string
  city: string | null
  citycode: string | null
  banId: string | null
  score: number
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

const FeatureCollection = z.object({
  features: z.array(
    z.object({
      geometry: z.object({
        type: z.literal('Point'),
        coordinates: z.tuple([z.number(), z.number()]),
      }),
      properties: z.object({
        label: z.string(),
        score: z.number().optional(),
        type: z.string().optional(),
        city: z.string().optional(),
        citycode: z.string().optional(),
        id: z.string().optional(),
      }),
    })
  ),
})

/** La précision selon le type de résultat de l'API Adresse. */
export function precisionOf(type: string | undefined): LocationPrecision {
  switch (type) {
    case 'housenumber':
      return 'exact'
    case 'street':
      return 'street'
    case 'locality':
      return 'district'
    default:
      return 'commune'
  }
}

/** Score minimal pour retenir un résultat (0 à 1). */
export const GEOCODE_MIN_SCORE = 0.4

export interface GeocodeOptions {
  endpoint?: string
  minScore?: number
  signal?: AbortSignal
}

/**
 * Un appel au géocodeur. `municipality` restreint la recherche aux communes
 * (centroïde). Rend `null` quand rien de crédible ne revient ; lance une
 * erreur sur un échec HTTP pour que l'appelant décide de ne pas la mettre en
 * cache.
 */
export async function geocodeOnce(
  fetchImpl: FetchLike,
  query: string,
  kind: GeocodeKind = 'address',
  options: GeocodeOptions = {}
): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({ q: query, limit: '1', index: 'address' })
  if (kind === 'municipality') params.set('type', 'municipality')
  const endpoint = options.endpoint ?? GEOCODE_ENDPOINT
  const response = await fetchImpl(
    `${endpoint}?${params.toString()}`,
    options.signal ? { signal: options.signal } : undefined
  )
  if (!response.ok) {
    throw new Error(`Géocodage « ${query} » : HTTP ${response.status}`)
  }
  const parsed = FeatureCollection.safeParse(await response.json())
  const feature = parsed.success ? parsed.data.features[0] : undefined
  const score = feature?.properties.score ?? 0
  const minScore = options.minScore ?? GEOCODE_MIN_SCORE
  if (!feature || score < minScore) return null
  return {
    point: { type: 'Point', coordinates: feature.geometry.coordinates },
    precision:
      kind === 'municipality'
        ? 'commune'
        : precisionOf(feature.properties.type),
    label: feature.properties.label,
    city: feature.properties.city ?? null,
    citycode: feature.properties.citycode ?? null,
    banId: feature.properties.id ?? null,
    score,
  }
}

/** La clé de cache d'une requête : sorte et texte normalisé. */
export function geocodeCacheKey(query: string, kind: GeocodeKind): string {
  return `${kind}:${query.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

/** La requête à poser pour une adresse : adresse puis commune, si l'adresse ne la contient pas. */
export function addressQuery(
  addressRaw: string | null | undefined,
  commune: string | null | undefined
): string | null {
  const address = addressRaw?.trim()
  if (!address) return null
  const city = commune?.trim()
  if (city && !address.toLowerCase().includes(city.toLowerCase())) {
    return `${address}, ${city}`
  }
  return address
}
