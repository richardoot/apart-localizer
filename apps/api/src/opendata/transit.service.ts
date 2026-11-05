import { Injectable } from '@nestjs/common'
import type {
  LocationApproximation,
  NearestStop,
  Point,
  TransitContext,
} from '@apart/contracts'
import { approximationReason } from '@apart/domain'
import { GeoService } from '../geo/geo.service'
import type { NearestStop as NearestStopRow } from '../geo/geo.service'

/** Distance maximale de recherche d'un arrêt, en mètres. */
export const TRANSIT_SEARCH_METERS = 2000

/** Desserte TBM (besoin D4) : arrêt de tram et arrêt tous modes les plus proches. */
@Injectable()
export class TransitService {
  constructor(private readonly geo: GeoService) {}

  /**
   * Les arrêts les plus proches du point ; lot 12 : avec la réserve d'un
   * repère approché (centre du quartier ou de la commune).
   */
  async at(
    point: Point | null,
    approximation: LocationApproximation | null = null
  ): Promise<TransitContext> {
    if (!point) {
      return {
        nearestTram: null,
        nearestStop: null,
        approximate: false,
        reasons: [],
      }
    }
    const [tram, any] = await Promise.all([
      this.geo.nearestTransitStop(point, TRANSIT_SEARCH_METERS, 'tram'),
      this.geo.nearestTransitStop(point, TRANSIT_SEARCH_METERS),
    ])
    const reason = approximation
      ? approximationReason('transit', approximation)
      : null
    return {
      nearestTram: toStop(tram),
      nearestStop: toStop(any),
      approximate: reason !== null,
      reasons: reason ? [reason] : [],
    }
  }
}

export function toStop(row: NearestStopRow | null): NearestStop | null {
  if (!row) return null
  return {
    name: row.name,
    mode: row.mode,
    lines: row.line
      ? row.line
          .split(',')
          .map(l => l.trim())
          .filter(Boolean)
      : [],
    distanceMeters: Math.round(row.distance_meters),
    point: { type: 'Point', coordinates: [row.longitude, row.latitude] },
  }
}
