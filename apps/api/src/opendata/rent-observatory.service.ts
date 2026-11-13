import { Injectable } from '@nestjs/common'
import {
  NEIGHBOURHOOD_TERRITORY,
  RentObservatoryTableSchema,
} from '@apart/contracts'
import type {
  LeaseType,
  LocationPrecision,
  Point,
  RentObservatoryLookup,
  RentObservatoryTable,
} from '@apart/contracts'
import { estimateTargetRent, lookupRentObservatory } from '@apart/domain'
import type { RentObservatoryInput, TargetRentEstimate } from '@apart/domain'
import { GeoService } from '../geo/geo.service'
import { ReferenceCacheService } from './reference-cache.service'

/** Sorte de `ReferenceData` des résultats de l'observatoire local des loyers. */
export const RENT_OBSERVATORY_KIND = 'rent_observatory'

export interface RentObservatoryTarget {
  point: Point | null
  precision: LocationPrecision | null
  inseeCode: string | null
  rooms: number | null
  surface: number | null
  targetRent: number | null
  leaseType: LeaseType | null
}

/**
 * Lot 28 (ADR 0038) : le loyer médian observé par l'observatoire local des
 * loyers dans la zone d'une annonce. La table vient de `ReferenceData`
 * (import `import:rent-observatory`), l'IRIS du repère des contours importés
 * au lot 11 (module geo), le calcul de `domain`. Un indicateur, jamais un
 * plafond ; seule exception, il estime le loyer visé d'une annonce qui n'en
 * a pas (ADR 0046, `ListingEnrichmentService`).
 */
@Injectable()
export class RentObservatoryService {
  constructor(
    private readonly geo: GeoService,
    private readonly cache: ReferenceCacheService
  ) {}

  /** Les années d'enquête importées ; une entrée illisible est ignorée. */
  async tables(): Promise<RentObservatoryTable[]> {
    const rows = await this.cache.all<unknown>(RENT_OBSERVATORY_KIND)
    return rows
      .map(row => RentObservatoryTableSchema.safeParse(row.payload))
      .filter(parsed => parsed.success)
      .map(parsed => parsed.data)
  }

  async lookup(target: RentObservatoryTarget): Promise<RentObservatoryLookup> {
    return lookupRentObservatory(await this.input(target))
  }

  /**
   * ADR 0046 : le loyer visé estimé d'une annonce (zone de l'adresse, du
   * centre du quartier, sinon les zones de la commune) ; null sans estimation.
   */
  async estimate(
    target: Omit<RentObservatoryTarget, 'targetRent'>
  ): Promise<TargetRentEstimate | null> {
    return estimateTargetRent(await this.input({ ...target, targetRent: null }))
  }

  private async input(
    target: RentObservatoryTarget
  ): Promise<RentObservatoryInput> {
    const tables = await this.tables()
    // Les contours qui contiennent le repère (distance nulle), pas ses voisins.
    const hits =
      target.point && tables.length > 0
        ? (
            await this.geo.neighbourhoodsNear(
              target.point,
              0,
              NEIGHBOURHOOD_TERRITORY
            )
          ).filter(hit => hit.distance_meters === 0)
        : []
    // Aucun contour au repère : hors du territoire, ou contours pas importés.
    const contoursImported =
      hits.length > 0 || !target.point || tables.length === 0
        ? true
        : Object.values(
            await this.geo.neighbourhoodCounts(NEIGHBOURHOOD_TERRITORY)
          ).some(count => count > 0)
    return {
      tables,
      contoursImported,
      hasPoint: target.point !== null,
      precision: target.point ? target.precision : null,
      inseeCode: target.inseeCode ?? hits[0]?.insee_code ?? null,
      irisCodes: hits.filter(hit => hit.kind === 'iris').map(hit => hit.code),
      rooms: target.rooms,
      surface: target.surface,
      targetRent: target.targetRent,
      furnished:
        target.leaseType === 'furnished' || target.leaseType === 'shared',
    }
  }
}
