import { Injectable, Logger } from '@nestjs/common'
import type { LocationPrecision, Point } from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import type { Prisma } from '../generated/prisma'
import {
  GEOCODE_ENDPOINT,
  addressQuery,
  geocodeCacheKey,
  geocodeOnce,
} from './geoplateforme'
import type { FetchLike, GeocodeKind, GeocodeResult } from './geoplateforme'

/** Sorte de donnée de référence sous laquelle les réponses sont mises en cache. */
export const GEOCODE_CACHE_KIND = 'geocode'
/** Délai maximal d'un appel au géocodeur. */
export const GEOCODE_TIMEOUT_MS = 5000

/** Ce qu'une adresse localisée apporte à une annonce. */
export interface LocatedAddress {
  point: Point
  precision: LocationPrecision
  addressNormalized: string | null
  banId: string | null
  commune: string | null
  inseeCode: string | null
  score: number
}

/**
 * Géocodage par la Géoplateforme IGN, avec cache en base (`ReferenceData`,
 * sorte `geocode`) : une requête déjà posée ne repart jamais sur le réseau,
 * y compris quand elle n'avait rien donné. `fetchImpl` est injectable ; les
 * tests le remplacent et n'atteignent jamais le réseau.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name)
  fetchImpl: FetchLike = (url, init) => globalThis.fetch(url, init)
  readonly endpoint = process.env.GEOCODING_URL || GEOCODE_ENDPOINT

  constructor(private readonly prisma: PrismaService) {}

  /** Un appel, mis en cache ; les erreurs HTTP remontent sans être mises en cache. */
  async geocode(
    query: string,
    kind: GeocodeKind = 'address'
  ): Promise<GeocodeResult | null> {
    const key = geocodeCacheKey(query, kind)
    const cached = await this.prisma.referenceData.findUnique({
      where: { kind_key: { kind: GEOCODE_CACHE_KIND, key } },
    })
    if (cached) {
      const payload = cached.payload as { result: GeocodeResult | null }
      return payload.result ?? null
    }
    const result = await geocodeOnce(this.fetchImpl, query, kind, {
      endpoint: this.endpoint,
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    })
    await this.prisma.referenceData.upsert({
      where: { kind_key: { kind: GEOCODE_CACHE_KIND, key } },
      create: {
        kind: GEOCODE_CACHE_KIND,
        key,
        payload: { result } as unknown as Prisma.InputJsonValue,
      },
      update: {
        payload: { result } as unknown as Prisma.InputJsonValue,
        fetchedAt: new Date(),
      },
    })
    return result
  }

  /**
   * Localise une annonce : l'adresse exacte d'abord, sinon le centroïde de
   * la commune. Ne lance jamais : un géocodeur muet ou en panne rend `null`
   * et l'annonce s'enregistre sans point.
   */
  async locate(location: {
    addressRaw?: string | null | undefined
    commune?: string | null | undefined
  }): Promise<LocatedAddress | null> {
    try {
      const query = addressQuery(location.addressRaw, location.commune)
      if (query) {
        const result = await this.geocode(query, 'address')
        if (result && result.precision !== 'commune') {
          return {
            point: result.point,
            precision: result.precision,
            addressNormalized: result.label,
            banId: result.banId,
            commune: result.city,
            inseeCode: result.citycode,
            score: result.score,
          }
        }
      }
      const commune = location.commune?.trim()
      if (!commune) return null
      const result = await this.geocode(commune, 'municipality')
      if (!result) return null
      return {
        point: result.point,
        precision: 'commune',
        addressNormalized: null,
        banId: null,
        commune: result.city ?? commune,
        inseeCode: result.citycode,
        score: result.score,
      }
    } catch (error) {
      this.logger.warn(
        `Géocodage impossible : ${error instanceof Error ? error.message : String(error)}`
      )
      return null
    }
  }
}
