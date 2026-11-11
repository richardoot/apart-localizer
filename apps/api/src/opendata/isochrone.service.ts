import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import type {
  IsochroneMode,
  IsochroneProviderParams,
  Point,
  Polygon,
} from '@apart/contracts'
import type { FetchLike } from './geoplateforme'
import { ISOCHRONE_ENDPOINT, fetchIsochrone } from './isochrone'
import { ReferenceCacheService } from './reference-cache.service'

export const ISOCHRONE_CACHE_KIND = 'isochrone'
export const ISOCHRONE_TIMEOUT_MS = 10_000

export interface IsochroneResult {
  polygon: Polygon
  provider: IsochroneProviderParams
  approximation: string | null
  warnings: string[]
  computedAt: string
}

/**
 * Isochrones de la Géoplateforme avec cache en base (`ReferenceData`, sorte
 * `isochrone`) : un même point (à 1 m près), un même mode et une même durée
 * ne repartent pas sur le réseau. Une panne répond 503, jamais un polygone
 * inventé. `fetchImpl` est remplacé dans les tests.
 */
@Injectable()
export class IsochroneService {
  private readonly logger = new Logger(IsochroneService.name)
  fetchImpl: FetchLike = (url, init) => globalThis.fetch(url, init)
  readonly endpoint = process.env.ISOCHRONE_URL || ISOCHRONE_ENDPOINT

  constructor(private readonly cache: ReferenceCacheService) {}

  static cacheKey(origin: Point, mode: IsochroneMode, minutes: number): string {
    const [lng, lat] = origin.coordinates
    return `${mode}:${minutes}:${lng.toFixed(5)},${lat.toFixed(5)}`
  }

  async compute(
    origin: Point,
    mode: IsochroneMode,
    minutes: number
  ): Promise<IsochroneResult> {
    const key = IsochroneService.cacheKey(origin, mode, minutes)
    const cached = await this.cache.get<IsochroneResult>(
      ISOCHRONE_CACHE_KIND,
      key
    )
    if (cached) return cached.payload
    try {
      const result = await fetchIsochrone(
        this.fetchImpl,
        origin,
        mode,
        minutes,
        {
          endpoint: this.endpoint,
          signal: AbortSignal.timeout(ISOCHRONE_TIMEOUT_MS),
        }
      )
      const payload: IsochroneResult = {
        ...result,
        computedAt: new Date().toISOString(),
      }
      await this.cache.set(ISOCHRONE_CACHE_KIND, key, payload)
      return payload
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Isochrone impossible : ${message}`)
      throw new ServiceUnavailableException(
        `Service d'isochrones de la Géoplateforme indisponible (${message}) : réessaie, ou dessine le périmètre.`
      )
    }
  }
}
