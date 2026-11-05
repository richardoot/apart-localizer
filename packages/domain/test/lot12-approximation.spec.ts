import { describe, expect, it } from 'vitest'
import type {
  ListingPlacement,
  NearbyAmenity,
  Point,
  RentReferenceTable,
} from '@apart/contracts'
import {
  communePlacement,
  describeActivity,
  listingChangedFields,
  lookupRentReference,
  manualPlacement,
  neighbourhoodLookup,
  surroundingsOf,
} from '../src/index.js'
import type { RentReferenceQuery } from '../src/index.js'

/** Lot 12 : réserves des calculs faits depuis un repère approché. Données inventées. */
const AT = '2026-11-05T10:00:00.000Z'
const POINT: Point = { type: 'Point', coordinates: [-0.6, 44.84] }

function placement(
  level: 'sector' | 'parent' | 'place',
  name: string
): ListingPlacement {
  return {
    method: level === 'place' ? 'osm_place' : 'neighbourhood_match',
    precision: 'district',
    matchedText: name,
    area: {
      level,
      name,
      codes: level === 'place' ? [] : ['C1'],
      commune: 'Commune fictive',
      inseeCode: '33999',
      source: 'Jeu fictif',
      areaSquareMeters: level === 'place' ? null : 1_000_000,
    },
    toVerify: false,
    reasons: [],
    computedAt: AT,
  }
}

const TRACK: NearbyAmenity = {
  kind: 'athletics_track',
  name: 'Piste fictive',
  brand: null,
  brandGroup: null,
  drive: null,
  address: null,
  commune: 'Commune fictive',
  distanceMeters: 800,
  point: POINT,
  source: 'res',
  externalId: 'E1',
  details: {
    facilityType: null,
    covered: null,
    lengthMeters: null,
    lanes: null,
    surfaceType: null,
    access: [],
    driveEvidence: null,
    sourceUrl: null,
  },
}
const DRIVE: NearbyAmenity = {
  ...TRACK,
  kind: 'supermarket_drive',
  name: 'Drive fictif',
  brandGroup: 'other',
  drive: 'yes',
  externalId: 'D1',
}

const HIT = {
  name: 'Quartier fictif',
  kind: 'quartier' as const,
  code: 'Q1',
  parent: 'Grand quartier fictif',
  commune: 'Commune fictive',
  inseeCode: '33999',
  source: 'Jeu fictif',
  distanceMeters: 0,
}

function surroundings(
  precision: 'exact' | 'district' | 'commune',
  where: ListingPlacement | null
) {
  return surroundingsOf({
    point: POINT,
    precision,
    sources: {
      neighbourhoods: 1,
      athleticsTracks: 1,
      supermarketDrives: 1,
      fitnessParks: 1,
    },
    neighbourhoodHits: [HIT],
    nearestTrack: TRACK,
    nearestFitnessPark: null,
    supermarketCandidates: [DRIVE],
    computedAt: AT,
    placement: where,
    commune: 'Commune fictive',
  })
}

describe('distances depuis un repère approché', () => {
  it('à l’adresse : aucune réserve', () => {
    const s = surroundings('exact', null)
    expect(s.athleticsTrack.approximate).toBe(false)
    expect(s.supermarkets.approximate).toBe(false)
    expect(s.athleticsTrack.reasons).toEqual([])
    expect(s.neighbourhood.status).toBe('ok')
  })

  it('au quartier : distances « ≈ » et quartier indicatif', () => {
    const s = surroundings('district', placement('sector', 'Secteur fictif'))
    expect(s.athleticsTrack.approximate).toBe(true)
    expect(s.athleticsTrack.reasons).toEqual([
      'Distance mesurée depuis le centre du secteur « Secteur fictif », repère approché : à lire « ≈ ».',
    ])
    expect(s.supermarkets.approximate).toBe(true)
    // Aucun Fitness Park dans le rayon : la réserve s'ajoute à la raison.
    expect(s.fitnessPark.approximate).toBe(true)
    expect(s.fitnessPark.reasons).toHaveLength(2)
    expect(s.neighbourhood.status).toBe('to_verify')
    expect(s.neighbourhood.reasons[0]).toBe(
      'Annonce placée au centre du secteur « Secteur fictif » d’après le texte de l’annonce : quartier indicatif.'
    )
  })

  it('au centre de la commune : distances « ≈ » depuis la commune', () => {
    const s = surroundings(
      'commune',
      communePlacement({
        commune: 'Commune fictive',
        inseeCode: '33999',
        computedAt: AT,
      })
    )
    expect(s.athleticsTrack.reasons[0]).toContain(
      'centre de la commune (Commune fictive)'
    )
    expect(s.neighbourhood.reasons[0]).toBe(
      'Annonce placée au centre de la commune : quartier indicatif.'
    )
  })

  it('le quartier d’un repère au quartier qui regroupe des secteurs, ou sur un lieu-dit', () => {
    const parent = neighbourhoodLookup({
      point: POINT,
      precision: 'district',
      imported: 1,
      hits: [HIT],
      placement: placement('parent', 'Grand quartier fictif'),
    })
    expect(parent.reasons[0]).toContain(
      'le bien peut être dans un autre secteur de Grand quartier fictif'
    )
    const place = neighbourhoodLookup({
      point: POINT,
      precision: 'district',
      imported: 1,
      hits: [HIT],
      placement: placement('place', 'Lieu fictif'),
    })
    expect(place.reasons[0]).toContain('lieu-dit « Lieu fictif »')
    const geocoder = neighbourhoodLookup({
      point: POINT,
      precision: 'district',
      imported: 1,
      hits: [HIT],
      placement: manualPlacement('district', AT),
    })
    expect(geocoder.reasons[0]).toContain('géocodeur')
  })
})

describe('zone d’encadrement d’un repère approché', () => {
  const table: RentReferenceTable = {
    territory: 'bordeaux',
    inseeCodes: ['33999'],
    housingType: 'apartment',
    decreeDate: '2030-07-01',
    validFrom: '2030-07-15',
    validUntil: null,
    source: {
      url: null,
      file: 'arrete-fictif.xlsx',
      sha256: 'fictif',
      importedAt: '2030-07-01T00:00:00.000Z',
      crossCheck: null,
    },
    rows: [
      {
        zone: 2,
        rooms: 2,
        epoch: 'before_1946',
        furnished: false,
        referenceRent: 12,
        upperRent: 14.4,
        lowerRent: 8.4,
      },
    ],
  }
  function query(over: Partial<RentReferenceQuery>): RentReferenceQuery {
    return {
      applicable: true,
      zones: [
        {
          zone: 2,
          label: 'Secteur fictif',
          irisCode: '339990101',
          inseeCode: '33999',
        },
      ],
      precision: 'district',
      rooms: 2,
      constructionYear: 1900,
      constructionPeriod: null,
      leaseType: 'unfurnished',
      surface: 40,
      rentalYear: null,
      tables: [table],
      at: new Date('2030-09-01T12:00:00Z'),
      ...over,
    }
  }

  it('une seule zone sur tout le quartier : zone probable, toujours à vérifier', () => {
    const r = lookupRentReference(
      query({
        area: {
          label: 'le secteur « X »',
          zones: [2],
          outsideZoning: false,
        },
      })
    )
    expect(r.status).toBe('to_verify')
    expect(r.referenceRentPerM2).toBe(14.4)
    expect(r.reasons[0]).toBe(
      'Repère approché, le secteur « X » entièrement en zone 2 : zone probable, à confirmer avec l’adresse.'
    )
  })

  it('plusieurs zones, ou une zone et des secteurs hors zonage : à vérifier', () => {
    const many = lookupRentReference(
      query({
        precision: 'commune',
        area: {
          label: 'la commune de Bordeaux',
          zones: [3, 1, 2, 4],
          outsideZoning: true,
        },
      })
    )
    expect(many.reasons[0]).toBe(
      'Repère approché, la commune de Bordeaux chevauche les zones 1, 2, 3 et 4 : zone à vérifier ; zone 2 au repère.'
    )
    const outside = lookupRentReference(
      query({
        zones: [],
        area: { label: 'le secteur « X »', zones: [2], outsideZoning: true },
      })
    )
    expect(outside.reasons[0]).toBe(
      'Repère approché, le secteur « X » chevauche la zone 2 et des secteurs hors zonage : zone à vérifier.'
    )
    const none = lookupRentReference(
      query({ area: { label: 'x', zones: [], outsideZoning: true } })
    )
    expect(none.reasons[0]).toContain('ne peut pas être déterminée')
  })
})

describe('journal du rattrapage', () => {
  it('« repère replacé au quartier » et la précision changée', () => {
    const d = describeActivity({
      action: 'listing.relocated',
      channel: 'system',
      actorMemberId: null,
      before: { precision: 'commune' },
      after: { precision: 'district', area: 'Quartier fictif' },
    })
    expect(d.kind).toBe('listing')
    expect(d.summary).toBe('repère replacé au quartier « Quartier fictif »')
    expect(d.changes.map(c => c.field)).toEqual(['precision'])
    const bare = describeActivity({
      action: 'listing.relocated',
      channel: 'system',
      actorMemberId: null,
      before: { precision: 'commune' },
      after: { precision: 'commune' },
    })
    expect(bare.summary).toBe('repère de l’annonce replacé')
    expect(bare.changes).toEqual([])
  })

  it('« ce qui a changé » : la localisation', () => {
    expect(
      listingChangedFields(
        [
          {
            id: 'e1',
            action: 'listing.relocated',
            channel: 'system',
            actorMemberId: null,
            listingId: 'l1',
            before: null,
            after: null,
            createdAt: '2026-11-05T12:00:00.000Z',
          },
        ],
        'm1',
        '2026-11-05T09:00:00.000Z'
      )
    ).toEqual(['location'])
  })
})
