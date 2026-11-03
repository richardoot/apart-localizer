import { Injectable } from '@nestjs/common'
import type { NearestStop, Point, TransitContext } from '@apart/contracts'
import { GeoService } from '../geo/geo.service'
import type { NearestStop as NearestStopRow } from '../geo/geo.service'

/** Distance maximale de recherche d'un arrêt, en mètres. */
export const TRANSIT_SEARCH_METERS = 2000

/** Desserte TBM (besoin D4) : arrêt de tram et arrêt tous modes les plus proches. */
@Injectable()
export class TransitService {
  constructor(private readonly geo: GeoService) {}

  async at(point: Point | null): Promise<TransitContext> {
    if (!point) return { nearestTram: null, nearestStop: null }
    const [tram, any] = await Promise.all([
      this.geo.nearestTransitStop(point, TRANSIT_SEARCH_METERS, 'tram'),
      this.geo.nearestTransitStop(point, TRANSIT_SEARCH_METERS),
    ])
    return { nearestTram: toStop(tram), nearestStop: toStop(any) }
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
