import { z } from 'zod'
import { PolygonSchema } from '@apart/contracts'
import type {
  IsochroneMode,
  IsochroneProviderParams,
  Point,
  Polygon,
  Position,
} from '@apart/contracts'
import type { FetchLike } from './geoplateforme'

/**
 * Client du service d'isochrones de la Géoplateforme IGN, sans état : une
 * requête, un polygone. Paramètres vérifiés sur les capacités du service
 * (`https://data.geopf.fr/navigation/getcapabilities`, relevées le
 * 3 novembre 2026) : ressource `bdtopo-valhalla`, profils `car` et
 * `pedestrian` seulement, coût `time` (minutes) ou `distance` (mètres).
 * Il n'existe pas de profil vélo : une isochrone à vélo est approchée par
 * une isodistance sur le réseau piéton à 15 km/h (ADR 0010).
 */

export const ISOCHRONE_ENDPOINT = 'https://data.geopf.fr/navigation/isochrone'
export const ISOCHRONE_RESOURCE = 'bdtopo-valhalla'
/** Vitesse retenue pour approcher le vélo : 15 km/h, soit 250 m par minute. */
export const CYCLING_METERS_PER_MINUTE = 250
export const CYCLING_APPROXIMATION =
  'Pas de profil vélo à la Géoplateforme : isodistance sur le réseau piéton à 15 km/h (250 m par minute).'

/** Les paramètres du service pour un mode et une durée. */
export function isochroneProviderParams(
  mode: IsochroneMode,
  minutes: number,
  endpoint: string = ISOCHRONE_ENDPOINT
): { provider: IsochroneProviderParams; approximation: string | null } {
  if (mode === 'cycling') {
    return {
      provider: {
        service: endpoint,
        resource: ISOCHRONE_RESOURCE,
        profile: 'pedestrian',
        costType: 'distance',
        costValue: minutes * CYCLING_METERS_PER_MINUTE,
        unit: 'meter',
      },
      approximation: CYCLING_APPROXIMATION,
    }
  }
  return {
    provider: {
      service: endpoint,
      resource: ISOCHRONE_RESOURCE,
      profile: mode === 'driving' ? 'car' : 'pedestrian',
      costType: 'time',
      costValue: minutes,
      unit: 'minute',
    },
    approximation: null,
  }
}

/** L'URL de la requête GET. */
export function isochroneUrl(
  origin: Point,
  provider: IsochroneProviderParams
): string {
  const [lng, lat] = origin.coordinates
  const params = new URLSearchParams({
    resource: provider.resource,
    point: `${lng},${lat}`,
    costType: provider.costType,
    costValue: String(provider.costValue),
    profile: provider.profile,
    direction: 'departure',
    geometryFormat: 'geojson',
    crs: 'EPSG:4326',
  })
  if (provider.unit === 'minute') params.set('timeUnit', 'minute')
  else params.set('distanceUnit', 'meter')
  return `${provider.service}?${params.toString()}`
}

const IsochroneResponse = z.object({
  geometry: z.union([
    z.object({
      type: z.literal('Polygon'),
      coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
    }),
    z.object({
      type: z.literal('MultiPolygon'),
      coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))),
    }),
  ]),
})

/** Aire plane approchée d'un anneau (degrés², formule du lacet), pour comparer des polygones. */
export function ringArea(ring: readonly Position[]): number {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i] as Position
    const b = ring[i + 1] as Position
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(sum) / 2
}

/** Ferme un anneau si sa dernière position n'est pas la première. */
export function closeRing(ring: readonly Position[]): Position[] {
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (!first || !last) return [...ring]
  return first[0] === last[0] && first[1] === last[1]
    ? [...ring]
    : [...ring, [first[0], first[1]]]
}

/**
 * Un polygone à partir de la réponse : un MultiPolygon (îlots séparés par
 * une rivière, un échangeur) est réduit à son plus grand polygone, signalé.
 */
export function polygonOfResponse(body: unknown): {
  polygon: Polygon
  warnings: string[]
} {
  const parsed = IsochroneResponse.safeParse(body)
  if (!parsed.success) {
    throw new Error('Réponse du service d’isochrones inexploitable')
  }
  const geometry = parsed.data.geometry
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const warnings: string[] = []
  const ranked = [...polygons].sort(
    (a, b) => ringArea(b[0] ?? []) - ringArea(a[0] ?? [])
  )
  if (polygons.length > 1) {
    warnings.push(
      `Isochrone en ${polygons.length} morceaux : seul le plus grand est retenu.`
    )
  }
  const chosen = ranked[0]
  if (!chosen) throw new Error('Isochrone vide')
  const polygon = PolygonSchema.parse({
    type: 'Polygon',
    coordinates: chosen.map(ring => closeRing(ring)),
  })
  return { polygon, warnings }
}

/** Un appel au service ; lance sur un échec HTTP ou une réponse illisible. */
export async function fetchIsochrone(
  fetchImpl: FetchLike,
  origin: Point,
  mode: IsochroneMode,
  minutes: number,
  options: { endpoint?: string; signal?: AbortSignal } = {}
): Promise<{
  polygon: Polygon
  provider: IsochroneProviderParams
  approximation: string | null
  warnings: string[]
}> {
  const { provider, approximation } = isochroneProviderParams(
    mode,
    minutes,
    options.endpoint
  )
  const response = await fetchImpl(
    isochroneUrl(origin, provider),
    options.signal ? { signal: options.signal } : undefined
  )
  if (!response.ok) {
    throw new Error(`Isochrone : HTTP ${response.status}`)
  }
  const { polygon, warnings } = polygonOfResponse(await response.json())
  return { polygon, provider, approximation, warnings }
}
