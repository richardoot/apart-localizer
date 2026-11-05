import { Injectable } from '@nestjs/common'
import { BORDEAUX_INSEE_CODE, RentReferenceTableSchema } from '@apart/contracts'
import type {
  LeaseType,
  ListingPlacement,
  LocationPrecision,
  Point,
  RentControl,
  RentControlLookup,
  RentReferenceTable,
} from '@apart/contracts'
import {
  approximateAreaLabel,
  isRentControlled,
  lookupRentReference,
} from '@apart/domain'
import { GeoService } from '../geo/geo.service'
import type { ListingAreaRef } from '../geo/geo.service'
import { ReferenceCacheService } from './reference-cache.service'

/** Sorte de `ReferenceData` des arrêtés de loyers de référence. */
export const RENT_REFERENCE_KIND = 'rent_reference'
/** Territoire du zonage importé. */
export const RENT_CONTROL_TERRITORY = 'bordeaux'
/** Distance sous laquelle une autre zone rend l'adresse ambiguë, en mètres. */
export const RENT_ZONE_TOLERANCE_METERS = 10
/**
 * Lot 12 : part d'une zone de quartier hors du zonage au-delà de laquelle
 * elle « sort du zonage » (5 000 m², pas les liserés dus aux écarts de tracé).
 */
export const RENT_AREA_OUTSIDE_SQUARE_METERS = 5000

export interface RentControlTarget {
  point: Point | null
  precision: LocationPrecision | null
  inseeCode: string | null
  commune: string | null
  rentControl: RentControl
  rooms: number | null
  constructionYear: number | null
  constructionPeriod: string | null
  leaseType: LeaseType | null
  surface: number | null
  rentalYear: number | null
  /**
   * Lot 12 : la zone où le bien se trouve (quartier retenu ou commune),
   * comparée au zonage quand le repère est approché, et son placement.
   */
  area?: ListingAreaRef | null
  placement?: ListingPlacement | null
}

/**
 * Plafond d'encadrement automatique (besoins D3, L2) : la zone vient de
 * PostGIS (zonage importé, module geo), l'arrêté de `ReferenceData`, le
 * calcul de `domain`. Commune de Bordeaux seulement ; `rentControl` « yes »
 * ou « no » de la phase 2 force la réponse.
 */
@Injectable()
export class RentControlService {
  constructor(
    private readonly geo: GeoService,
    private readonly cache: ReferenceCacheService
  ) {}

  /** Les arrêtés importés, du plus ancien au plus récent ; une entrée illisible est ignorée. */
  async tables(): Promise<RentReferenceTable[]> {
    const rows = await this.cache.all<unknown>(RENT_REFERENCE_KIND)
    return rows
      .map(row => RentReferenceTableSchema.safeParse(row.payload))
      .filter(parsed => parsed.success)
      .map(parsed => parsed.data)
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom))
  }

  async lookup(
    target: RentControlTarget,
    at: Date = new Date()
  ): Promise<RentControlLookup> {
    const applicable =
      target.rentControl === 'yes'
        ? true
        : target.rentControl === 'no'
          ? false
          : target.inseeCode
            ? target.inseeCode === BORDEAUX_INSEE_CODE
            : target.commune
              ? isRentControlled(target.commune)
              : // Un point seul : encadré s'il tombe dans le zonage de Bordeaux.
                target.point !== null &&
                (await this.geo.rentControlZonesNear(target.point, 0)).length >
                  0
    const approximate =
      target.precision === 'district' || target.precision === 'commune'
    const [tables, zones, inArea] = await Promise.all([
      applicable ? this.tables() : Promise.resolve([]),
      applicable && target.point
        ? this.geo.rentControlZonesNear(
            target.point,
            RENT_ZONE_TOLERANCE_METERS
          )
        : Promise.resolve([]),
      applicable && approximate && target.point && target.area
        ? this.geo.rentControlZonesInArea(target.area, RENT_CONTROL_TERRITORY)
        : Promise.resolve(null),
    ])
    const label = approximateAreaLabel({
      precision: target.precision,
      point: target.point,
      placement: target.placement ?? null,
      commune: target.commune,
    })
    return lookupRentReference({
      area:
        inArea && label
          ? {
              label,
              zones: inArea.zones,
              outsideZoning:
                inArea.outsideSquareMeters > RENT_AREA_OUTSIDE_SQUARE_METERS,
            }
          : null,
      applicable,
      zones: zones.map(z => ({
        zone: z.zone,
        label: z.label,
        irisCode: z.iris_code,
        inseeCode: z.insee_code,
      })),
      boundaryToleranceMeters: RENT_ZONE_TOLERANCE_METERS,
      // La zone retenue doit contenir le point, pas seulement le frôler.
      zoneContainsPoint: zones.length === 0 || zones[0]?.distance_meters === 0,
      precision: target.point ? target.precision : null,
      rooms: target.rooms,
      constructionYear: target.constructionYear,
      constructionPeriod: target.constructionPeriod,
      leaseType: target.leaseType,
      surface: target.surface,
      rentalYear: target.rentalYear,
      tables,
      at,
    })
  }
}
