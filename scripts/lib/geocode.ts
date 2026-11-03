import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  GEOCODE_ENDPOINT,
  GEOCODE_MIN_SCORE,
  geocodeCacheKey,
  geocodeOnce,
  precisionOf,
} from '../../apps/api/src/opendata/geoplateforme.js'
import type {
  FetchLike,
  GeocodeKind,
  GeocodeResult,
} from '../../apps/api/src/opendata/geoplateforme.js'

export { GEOCODE_ENDPOINT, precisionOf }
export type { FetchLike, GeocodeResult }

/**
 * Géocodage pour le script d'import : le même client Géoplateforme que l'API
 * (`apps/api/src/opendata/geoplateforme.ts`), avec un cache sur disque au
 * lieu du cache en base. Une requête déjà posée ne repart jamais sur le
 * réseau, et le mode « cache seul » (`--no-geocode`) n'appelle rien du tout.
 */

export interface GeocoderOptions {
  cacheFile: string
  /** Faux = cache seul, aucun appel réseau. */
  online: boolean
  /** Faux = le cache sur disque est lu mais jamais réécrit (simulation). */
  persist?: boolean
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
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init))
    this.minScore = options.minScore ?? GEOCODE_MIN_SCORE
  }

  /** `municipality` restreint la recherche aux communes (centroïde). */
  async geocode(
    query: string,
    kind: GeocodeKind = 'address'
  ): Promise<GeocodeResult | null> {
    const key = geocodeCacheKey(query, kind)
    if (key in this.cache) return this.cache[key] ?? null
    if (!this.options.online) return null
    this.calls++
    const result = await geocodeOnce(this.fetchImpl, query, kind, {
      minScore: this.minScore,
    })
    this.cache[key] = result
    if (this.options.persist !== false) this.save()
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
