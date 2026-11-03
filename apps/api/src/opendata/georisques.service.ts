import { Injectable, Logger } from '@nestjs/common'
import type { GeorisquesReport, Point } from '@apart/contracts'
import type { FetchLike } from './geoplateforme'
import {
  GEORISQUES_REPORT_ENDPOINT,
  GeorisquesRawReportSchema,
  fetchGeorisquesReport,
  georisquesReportOf,
} from './georisques'
import type { GeorisquesRawReport } from './georisques'
import { ReferenceCacheService } from './reference-cache.service'

export const GEORISQUES_CACHE_KIND = 'georisques'
/** Les aléas changent peu : un rapport vaut trente jours. */
export const GEORISQUES_CACHE_MAX_AGE_MS = 30 * 24 * 3600 * 1000
export const GEORISQUES_TIMEOUT_MS = 8000

/**
 * Risques Géorisques à l'adresse (besoin D6) avec cache en base
 * (`ReferenceData`, sorte `georisques`, clé = point au mètre près). Ne lance
 * jamais : sans point, le rapport est « sans objet » ; une panne le rend
 * « indisponible » (jamais mis en cache), jamais un risque inventé.
 * `fetchImpl` est remplacé dans les tests.
 */
@Injectable()
export class GeorisquesService {
  private readonly logger = new Logger(GeorisquesService.name)
  fetchImpl: FetchLike = (url, init) => globalThis.fetch(url, init)
  readonly endpoint = process.env.GEORISQUES_URL || GEORISQUES_REPORT_ENDPOINT

  constructor(private readonly cache: ReferenceCacheService) {}

  static cacheKey(point: Point): string {
    const [lng, lat] = point.coordinates
    return `${lng.toFixed(5)},${lat.toFixed(5)}`
  }

  async report(point: Point | null): Promise<GeorisquesReport> {
    if (!point) {
      return {
        status: 'not_applicable',
        point: null,
        address: null,
        commune: null,
        inseeCode: null,
        reportUrl: null,
        hazards: [],
        fetchedAt: null,
        message: 'Adresse non localisée : risques Géorisques non consultés.',
      }
    }
    const key = GeorisquesService.cacheKey(point)
    try {
      const cached = await this.cache.get<GeorisquesRawReport>(
        GEORISQUES_CACHE_KIND,
        key,
        GEORISQUES_CACHE_MAX_AGE_MS
      )
      const parsedCache = cached
        ? GeorisquesRawReportSchema.safeParse(cached.payload)
        : null
      if (cached && parsedCache?.success) {
        return georisquesReportOf(parsedCache.data, point, cached.fetchedAt)
      }
      const raw = await fetchGeorisquesReport(this.fetchImpl, point, {
        endpoint: this.endpoint,
        signal: AbortSignal.timeout(GEORISQUES_TIMEOUT_MS),
      })
      await this.cache.set(GEORISQUES_CACHE_KIND, key, raw)
      return georisquesReportOf(raw, point, new Date())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Rapport Géorisques impossible : ${message}`)
      return {
        status: 'unavailable',
        point,
        address: null,
        commune: null,
        inseeCode: null,
        reportUrl: null,
        hazards: [],
        fetchedAt: null,
        message: `Géorisques indisponible (${message}) : risques à l’adresse à vérifier sur georisques.gouv.fr.`,
      }
    }
  }
}
