/**
 * Lot 11, équipements et quartiers : schémas ajoutés sans rupture (un
 * instantané d'avant le lot 11 se lit toujours), attributs d'un équipement
 * par défaut, genres de couche, enseignes préférées. Données inventées.
 */
import { describe, expect, it } from 'vitest'
import {
  AMENITY_KIND_LABELS,
  AMENITY_SEARCH_METERS,
  AmenityDetailsSchema,
  AmenityLayerQuerySchema,
  DRIVE_STATUS_LABELS,
  ListingOpenDataContextSchema,
  NEIGHBOURHOOD_KIND_LABELS,
  NearbyAmenitySchema,
  PREFERRED_SUPERMARKET_BRANDS,
  SUPERMARKET_BRAND_LABELS,
  SurroundingsSchema,
} from '../src/index.js'

const amenity = {
  kind: 'supermarket_drive',
  name: 'Drive fictif',
  brand: 'Enseigne fictive',
  brandGroup: 'other',
  drive: 'to_verify',
  address: null,
  commune: 'Commune fictive',
  distanceMeters: 420,
  point: { type: 'Point', coordinates: [-0.58, 44.84] },
  source: 'osm',
  externalId: 'node/1',
  details: {},
}

describe('Lot 11 : équipements et quartiers', () => {
  it('un instantané d’avant le lot 11 se lit, sans quartier ni équipements', () => {
    const before = ListingOpenDataContextSchema.parse({
      market: null,
      transit: null,
    })
    expect(before.surroundings).toBeNull()
  })

  it('les attributs d’un équipement ont des valeurs par défaut, jamais inventées', () => {
    expect(AmenityDetailsSchema.parse({})).toEqual({
      facilityType: null,
      covered: null,
      lengthMeters: null,
      lanes: null,
      surfaceType: null,
      access: [],
      driveEvidence: null,
      sourceUrl: null,
    })
    expect(() => AmenityDetailsSchema.parse({ lengthMeters: -1 })).toThrow()
    expect(NearbyAmenitySchema.parse(amenity).details.access).toEqual([])
    expect(() =>
      NearbyAmenitySchema.parse({ ...amenity, drive: 'peut-être' })
    ).toThrow()
  })

  it('le résultat d’une annonce : quartier, piste, drives par enseigne, Fitness Park', () => {
    const missing = { status: 'unavailable', nearest: null, reasons: ['x'] }
    const parsed = SurroundingsSchema.parse({
      neighbourhood: {
        status: 'ok',
        value: {
          name: 'IRIS Fictif',
          kind: 'iris',
          code: '339990101',
          parent: null,
          commune: 'Commune fictive',
          inseeCode: '33999',
          source: 'Contours fictifs',
        },
        reasons: [],
      },
      athleticsTrack: missing,
      supermarkets: {
        status: 'ok',
        preferred: { carrefour: null, auchan: null, intermarche: amenity },
        nearest: amenity,
        reasons: [],
      },
      fitnessPark: missing,
      searchRadiusMeters: AMENITY_SEARCH_METERS,
      computedAt: '2030-01-01T00:00:00.000Z',
    })
    expect(parsed.supermarkets.preferred.intermarche?.drive).toBe('to_verify')
    expect(() =>
      SurroundingsSchema.parse({
        ...parsed,
        neighbourhood: {
          ...parsed.neighbourhood,
          value: { ...parsed.neighbourhood.value, inseeCode: '339' },
        },
      })
    ).toThrow()
  })

  it('couche d’un genre connu seulement ; libellés en français', () => {
    expect(AmenityLayerQuerySchema.parse({ kind: 'fitness_park' })).toEqual({
      kind: 'fitness_park',
    })
    expect(() => AmenityLayerQuerySchema.parse({ kind: 'piscine' })).toThrow()
    expect(
      PREFERRED_SUPERMARKET_BRANDS.map(b => SUPERMARKET_BRAND_LABELS[b])
    ).toEqual(['Carrefour', 'Auchan', 'Intermarché'])
    expect(DRIVE_STATUS_LABELS.to_verify).toBe('Drive à vérifier')
    expect(AMENITY_KIND_LABELS.athletics_track).toBe('Piste d’athlétisme')
    expect(NEIGHBOURHOOD_KIND_LABELS.commune).toBe('Commune entière')
  })
})
