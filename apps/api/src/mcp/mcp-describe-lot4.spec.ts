import { describe, expect, it } from 'vitest'
import { CriteriaFiltersSchema } from '@apart/contracts'
import type {
  MarketContext,
  RentControlLookup,
  SearchCriteriaSummary,
} from '@apart/contracts'
import {
  describeContext,
  describeCriteria,
  describeCriteriaChanges,
  describeMarket,
  describeMarketReport,
  describeRentControl,
  describeTransit,
} from './mcp-tools'
import { surroundingsOf } from '@apart/domain'

const rent: RentControlLookup = {
  status: 'ok',
  applicable: true,
  zone: { zone: 2, label: 'Z', irisCode: '1', inseeCode: '33063' },
  rooms: 2,
  epoch: 'before_1946',
  furnished: false,
  row: null,
  referenceRentPerM2: 17.5,
  monthlyCap: 700,
  decree: {
    decreeDate: '2026-07-06',
    validFrom: '2026-07-15',
    validUntil: '2026-11-24',
    sourceUrl: null,
  },
  reasons: [],
  notes: [],
}

const market: MarketContext = {
  status: 'ok',
  point: null,
  radiusMeters: 500,
  surface: 40,
  surfaceRange: [30, 50],
  period: { from: '2023-11-03', to: '2026-11-03' },
  stats: {
    count: 8,
    medianPricePerM2: 4500,
    p25PricePerM2: 4000,
    p75PricePerM2: 5000,
    minPricePerM2: 3000,
    maxPricePerM2: 6000,
    dispersion: 0.22,
  },
  comparables: [],
  marketPrice: 180_000,
  listingPricePerM2: 4000,
  gapToMarket: -0.11,
  reasons: [],
  dataYears: [2024],
}

describe('réponses MCP du lot 4', () => {
  it('entrées et sorties de critères', () => {
    expect(describeCriteriaChanges(null)).toBeNull()
    expect(
      describeCriteriaChanges({ entered: [], left: [], current: [] })
    ).toBeNull()
    expect(
      describeCriteriaChanges({
        entered: [
          {
            criteriaId: 'a',
            name: 'Talence',
            matchedAt: '2026-11-03T10:00:00.000Z',
            approximate: true,
          },
        ],
        left: [{ criteriaId: 'b', name: 'Bègles' }],
        current: [],
      })
    ).toBe(
      'Entre dans le critère « Talence » (sous réserve : localisation imprécise). Sort du critère « Bègles ».'
    )
  })

  it('desserte, encadrement, marché', () => {
    expect(describeTransit({ nearestTram: null, nearestStop: null })).toContain(
      'Aucun arrêt'
    )
    expect(
      describeTransit({
        nearestTram: {
          name: 'Forum',
          mode: 'tram',
          lines: ['B'],
          distanceMeters: 120,
          point: { type: 'Point', coordinates: [0, 0] },
        },
        nearestStop: null,
      })
    ).toBe('Tram le plus proche : Forum (ligne B) à 120 m')
    expect(describeRentControl(rent)).toContain(
      'loyer de référence majoré 17.5 €/m²'
    )
    expect(
      describeRentControl({ ...rent, status: 'not_applicable' })
    ).toContain('hors Bordeaux')
    expect(
      describeRentControl({
        ...rent,
        status: 'unavailable',
        reasons: ['Aucun arrêté'],
      })
    ).toContain('Aucun arrêté')
    expect(
      describeRentControl({
        ...rent,
        status: 'to_verify',
        referenceRentPerM2: null,
        reasons: ['Zone ?'],
      })
    ).toContain('À vérifier')
    expect(describeMarket(market)).toContain('médiane 4')
    expect(describeMarket(market)).toContain('−11,0 %')
    expect(describeMarket({ ...market, stats: null, reasons: [] })).toContain(
      'aucune vente'
    )
  })

  it('contexte de fiche et contexte de marché', () => {
    const text = describeContext({
      listingId: '11111111-1111-4111-8111-111111111111',
      point: null,
      precision: null,
      transit: { nearestTram: null, nearestStop: null },
      rentControl: rent,
      dpe: {
        verified: false,
        validity: {
          level: 'ok',
          messages: ['DPE valable.'],
          auditRequired: false,
        },
        search: {
          status: 'multiple',
          method: 'ban_id',
          query: {},
          candidates: [
            {
              number: 'x',
              issuedAt: '2024-01-01',
              validUntil: null,
              dpeClass: 'D',
              gesClass: null,
              consumption: null,
              emissions: null,
              surface: null,
              floor: null,
              address: null,
              complement: null,
              banId: null,
              buildingType: null,
              matchScore: 0.5,
            },
          ],
          total: 1,
          searchedAt: '2026-11-03T10:00:00.000Z',
          message: null,
        },
      },
      market,
      surroundings: surroundingsOf({
        point: null,
        precision: null,
        sources: {
          neighbourhoods: 0,
          athleticsTracks: 0,
          supermarketDrives: 0,
          fitnessParks: 0,
        },
        neighbourhoodHits: [],
        nearestTrack: null,
        nearestFitnessPark: null,
        supermarketCandidates: [],
        computedAt: '2026-11-03T10:00:00.000Z',
      }),
      computedAt: '2026-11-03T10:00:00.000Z',
    })
    expect(text).toContain('DPE non vérifié')
    expect(text).toContain('Quartier : Annonce sans point')
    expect(text).toContain('1 DPE candidat(s)')
    expect(
      describeMarketReport({
        location: {
          point: { type: 'Point', coordinates: [-0.58, 44.84] },
          label: null,
          precision: 'exact',
          commune: null,
          inseeCode: null,
        },
        market,
        rentControl: rent,
        transit: { nearestTram: null, nearestStop: null },
      })
    ).toContain('-0.58, 44.84')
  })

  it('un critère en une ligne', () => {
    const base: SearchCriteriaSummary = {
      id: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      createdById: null,
      name: 'Talence',
      active: false,
      filters: CriteriaFiltersSchema.parse({
        priceMax: 200_000,
        priceMin: 100_000,
        surfaceMin: 40,
        roomsMin: 2,
        dpeMax: 'D',
        maxTramDistanceMeters: 500,
        communes: ['Talence'],
        verdicts: ['target'],
        statuses: ['to_visit'],
      }),
      perimeterType: 'isochrone',
      perimeter: {
        type: 'isochrone',
        polygon: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
        params: {
          origin: { type: 'Point', coordinates: [0, 0] },
          originLabel: null,
          mode: 'cycling',
          durationMinutes: 12,
          computedAt: null,
          provider: null,
          approximation: null,
        },
      },
      createdAt: '2026-11-03T10:00:00.000Z',
      updatedAt: '2026-11-03T10:00:00.000Z',
      listingCount: 3,
      newCount: 1,
      approximateCount: 1,
    }
    const line = describeCriteria(base)
    expect(line).toContain('(archivé)')
    expect(line).toContain('isochrone 12 min à vélo')
    expect(line).toContain('tram à 500 m au plus')
    expect(line).toContain('1 sous réserve')
    expect(
      describeCriteria({
        ...base,
        perimeter: null,
        perimeterType: null,
        active: true,
        approximateCount: 0,
      })
    ).toContain('sans périmètre')
    expect(
      describeCriteria({
        ...base,
        perimeter: {
          type: 'point_radius',
          longitude: 0,
          latitude: 0,
          radiusMeters: 800,
        },
      })
    ).toContain('Point et rayon 800 m')
    expect(
      describeCriteria({
        ...base,
        perimeter: {
          type: 'polygon',
          polygon:
            base.perimeter?.type === 'isochrone'
              ? base.perimeter.polygon
              : (null as never),
        },
      })
    ).toContain('Polygone dessiné')
  })
})
