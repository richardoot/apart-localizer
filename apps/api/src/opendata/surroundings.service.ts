import { Injectable } from '@nestjs/common'
import {
  AMENITY_SEARCH_METERS,
  NEIGHBOURHOOD_BORDER_METERS,
  NEIGHBOURHOOD_TERRITORY,
} from '@apart/contracts'
import type {
  LocationPrecision,
  NearbyAmenity,
  Point,
  Surroundings,
  SurroundingsSources,
} from '@apart/contracts'
import { surroundingsOf } from '@apart/domain'
import { GeoService } from '../geo/geo.service'
import type { AmenityHit } from '../geo/geo.service'

/**
 * Quartier et équipements les plus proches d'un point (lot 11, besoins D8 à
 * D11) : contours et équipements importés par les scripts, lus dans le
 * module geo (distances à vol d'oiseau, PostGIS), règles dans `domain`
 * (quartier indicatif, drive signalé d'abord, « non disponible » sans
 * import). Aucun appel réseau.
 */
@Injectable()
export class SurroundingsService {
  constructor(private readonly geo: GeoService) {}

  /** Ce qui est importé, par source (une source vide rend « non disponible »). */
  async sources(): Promise<SurroundingsSources> {
    const [amenities, neighbourhoods] = await Promise.all([
      this.geo.amenityCounts(),
      this.geo.neighbourhoodCounts(NEIGHBOURHOOD_TERRITORY),
    ])
    return {
      neighbourhoods:
        neighbourhoods.quartier + neighbourhoods.iris + neighbourhoods.commune,
      athleticsTracks: amenities.athletics_track,
      supermarketDrives: amenities.supermarket_drive,
      fitnessParks: amenities.fitness_park,
    }
  }

  async at(
    point: Point | null,
    precision: LocationPrecision | null,
    at: Date = new Date()
  ): Promise<Surroundings> {
    const computedAt = at.toISOString()
    const sources = await this.sources()
    if (!point) {
      return surroundingsOf({
        point,
        precision,
        sources,
        neighbourhoodHits: [],
        nearestTrack: null,
        nearestFitnessPark: null,
        supermarketCandidates: [],
        computedAt,
      })
    }
    const radius = AMENITY_SEARCH_METERS
    const [hits, tracks, fitness, drives] = await Promise.all([
      sources.neighbourhoods
        ? this.geo.neighbourhoodsNear(
            point,
            NEIGHBOURHOOD_BORDER_METERS,
            NEIGHBOURHOOD_TERRITORY
          )
        : Promise.resolve([]),
      sources.athleticsTracks
        ? this.geo.amenitiesNear(point, 'athletics_track', radius, 1)
        : Promise.resolve([]),
      sources.fitnessParks
        ? this.geo.amenitiesNear(point, 'fitness_park', radius, 1)
        : Promise.resolve([]),
      sources.supermarketDrives
        ? this.geo.nearestAmenityPerBrand(point, 'supermarket_drive', radius)
        : Promise.resolve([]),
    ])
    return surroundingsOf({
      point,
      precision,
      sources,
      neighbourhoodHits: hits.map(hit => ({
        name: hit.name,
        kind: hit.kind,
        code: hit.code,
        parent: hit.parent,
        commune: hit.commune,
        inseeCode: hit.insee_code,
        source: hit.source,
        distanceMeters: hit.distance_meters,
      })),
      nearestTrack: tracks[0] ? toNearbyAmenity(tracks[0]) : null,
      nearestFitnessPark: fitness[0] ? toNearbyAmenity(fitness[0]) : null,
      supermarketCandidates: drives.map(toNearbyAmenity),
      computedAt,
      radiusMeters: radius,
    })
  }
}

/** Une ligne du module geo en équipement proche (distance arrondie au mètre). */
export function toNearbyAmenity(hit: AmenityHit): NearbyAmenity {
  return {
    kind: hit.kind,
    name: hit.name,
    brand: hit.brand,
    brandGroup: hit.brand_group,
    drive: hit.drive,
    address: hit.address,
    commune: hit.commune,
    distanceMeters: Math.round(hit.distance_meters),
    point: { type: 'Point', coordinates: [hit.longitude, hit.latitude] },
    source: hit.source,
    externalId: hit.external_id,
    details: hit.details,
  }
}
