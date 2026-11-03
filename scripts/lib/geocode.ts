import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { LocationPrecision, Point } from '@apart/contracts'

/**
 * Géocodage par la Géoplateforme IGN (successeur de l'API Adresse), avec un
 * cache sur disque : une requête déjà posée ne repart jamais sur le réseau,
 * et le mode « cache seul » (`--no-geocode`) n'appelle rien du tout.
 */

export const GEOCODE_ENDPOINT = 'https://data.geopf.fr/geocodage/search/'

export interface GeocodeResult {
  point: Point
  precision: LocationPrecision
  label: string
  city: string | null
  citycode: string | null
  banId: string | null
  score: number
}

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

export type FetchLike = (
  url: string
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export interface GeocoderOptions {
  cacheFile: string
  /** Faux = cache seul, aucun appel réseau. */
  online: boolean
  fetch?: FetchLike
  /** Score minimal pour retenir un résultat (0 à 1). */
  minScore?: number
}

type CacheEntry = GeocodeResult | null

export class Geocoder {
  private readonly cache: Record<string, CacheEntry>
  private readonly fetchImpl: FetchLike
  private readonly minScore: number
  public calls = 0

  constructor(private readonly options: GeocoderOptions) {
    this.cache = loadCache(options.cacheFile)
    this.fetchImpl = options.fetch ?? (url => fetch(url))
    this.minScore = options.minScore ?? 0.4
  }

  /** `municipality` restreint la recherche aux communes (centroïde). */
  async geocode(
    query: string,
    kind: 'address' | 'municipality' = 'address'
  ): Promise<GeocodeResult | null> {
    const key = `${kind}:${query.trim().toLowerCase()}`
    if (key in this.cache) return this.cache[key] ?? null
    if (!this.options.online) return null

    const params = new URLSearchParams({
      q: query,
      limit: '1',
      index: 'address',
    })
    if (kind === 'municipality') params.set('type', 'municipality')
    this.calls++
    const response = await this.fetchImpl(
      `${GEOCODE_ENDPOINT}?${params.toString()}`
    )
    if (!response.ok) {
      throw new Error(`Géocodage « ${query} » : HTTP ${response.status}`)
    }
    const parsed = FeatureCollection.safeParse(await response.json())
    const feature = parsed.success ? parsed.data.features[0] : undefined
    const score = feature?.properties.score ?? 0
    const result: CacheEntry =
      feature && score >= this.minScore
        ? {
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
        : null
    this.cache[key] = result
    this.save()
    return result
  }

  private save(): void {
    mkdirSync(path.dirname(this.options.cacheFile), { recursive: true })
    writeFileSync(
      this.options.cacheFile,
      JSON.stringify(this.cache, null, 2) + '\n'
    )
  }
}

function loadCache(file: string): Record<string, CacheEntry> {
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, CacheEntry>
  } catch {
    return {}
  }
}
