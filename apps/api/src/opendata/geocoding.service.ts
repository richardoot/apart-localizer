import { Injectable, Logger, Optional } from '@nestjs/common'
import { NEIGHBOURHOOD_TERRITORY } from '@apart/contracts'
import type {
  ListingPlacement,
  LocationPrecision,
  Point,
} from '@apart/contracts'
import { addressPlacement, communePlacement } from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import type { Prisma } from '../generated/prisma'
import type { ListingAreaRef } from '../geo/geo.service'
import {
  GEOCODE_ENDPOINT,
  addressQuery,
  geocodeCacheKey,
  geocodeOnce,
} from './geoplateforme'
import type { FetchLike, GeocodeKind, GeocodeResult } from './geoplateforme'
import { PlacementService } from './placement.service'
import type { DistrictLookup } from './placement.service'

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
  /** Comment le repère a été placé (lot 12). */
  placement: ListingPlacement
  /** La zone à écrire avec le point quand le repère est approché (quartier, commune). */
  area: ListingAreaRef | null
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

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly placement?: PlacementService
  ) {}

  /** Un appel, mis en cache ; les erreurs HTTP remontent sans être mises en cache. */
  async geocode(
    query: string,
    kind: GeocodeKind = 'address',
    options: { fresh?: boolean } = {}
  ): Promise<GeocodeResult | null> {
    const key = geocodeCacheKey(query, kind)
    const cached = options.fresh
      ? null
      : await this.prisma.referenceData.findUnique({
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
   * Localise une annonce (lot 12, ADR 0022) : l'adresse géocodée au numéro
   * ou à la rue d'abord ; sinon le quartier reconnu dans le champ
   * « quartier » parmi les contours importés de la commune (repère au centre
   * du quartier), ou un lieu-dit OpenStreetMap ; sinon le centre de la
   * commune. Ne lance jamais : un géocodeur muet ou en panne rend `null` (ou
   * le quartier, qui ne demande pas de réseau) et l'annonce s'enregistre
   * sans point.
   */
  async locate(
    location: {
      addressRaw?: string | null | undefined
      commune?: string | null | undefined
      district?: string | null | undefined
      inseeCode?: string | null | undefined
    },
    options: { fresh?: boolean; at?: Date } = {}
  ): Promise<LocatedAddress | null> {
    const at = options.at ?? new Date()
    const computedAt = at.toISOString()
    let insee = location.inseeCode ?? null
    try {
      const query = addressQuery(location.addressRaw, location.commune)
      if (query) {
        const result = await this.geocode(query, 'address', options)
        if (result && result.precision !== 'commune') {
          return {
            point: result.point,
            precision: result.precision,
            addressNormalized: result.label,
            banId: result.banId,
            commune: result.city,
            inseeCode: result.citycode,
            score: result.score,
            placement: addressPlacement(
              result.precision,
              result.label,
              computedAt
            ),
            area: null,
          }
        }
        insee = insee ?? result?.citycode ?? null
      }
    } catch (error) {
      this.warn(error)
    }
    const district = await this.locateDistrict(location, insee, at)
    if (district.located) {
      const d = district.located
      return {
        point: d.point,
        precision: 'district',
        addressNormalized: null,
        banId: null,
        commune: d.commune ?? location.commune ?? null,
        inseeCode: d.inseeCode,
        score: 1,
        placement: d.placement,
        area: d.area,
      }
    }
    try {
      const commune = location.commune?.trim()
      if (!commune) return null
      const result = await this.geocode(commune, 'municipality', options)
      if (!result) return null
      const inseeCode = result.citycode ?? district.inseeCode
      return {
        point: result.point,
        precision: 'commune',
        addressNormalized: null,
        banId: null,
        commune: result.city ?? commune,
        inseeCode,
        score: result.score,
        placement: communePlacement({
          commune: result.city ?? commune,
          inseeCode,
          district: location.district,
          reasons: district.reasons,
          computedAt,
        }),
        area: inseeCode
          ? { kind: 'commune', territory: NEIGHBOURHOOD_TERRITORY, inseeCode }
          : null,
      }
    } catch (error) {
      this.warn(error)
      return null
    }
  }

  /** Le quartier du champ « quartier » (sans réseau) ; une erreur de base rend « rien de reconnu ». */
  private async locateDistrict(
    location: {
      commune?: string | null | undefined
      district?: string | null | undefined
      inseeCode?: string | null | undefined
    },
    insee: string | null,
    at: Date
  ): Promise<DistrictLookup> {
    const none: DistrictLookup = {
      located: null,
      reasons: [],
      inseeCode: insee,
    }
    if (!this.placement || !location.district?.trim()) return none
    try {
      return await this.placement.locateDistrict(
        {
          district: location.district,
          commune: location.commune,
          inseeCode: insee,
        },
        at
      )
    } catch (error) {
      this.warn(error)
      return none
    }
  }

  private warn(error: unknown): void {
    this.logger.warn(
      `Géocodage impossible : ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
