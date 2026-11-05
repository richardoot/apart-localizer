import { describe, expect, it } from 'vitest'
import {
  CriteriaFiltersSchema,
  DEFAULT_CRITERIA_TOLERANCE,
} from '@apart/contracts'
import type { SearchCriteria as SearchCriteriaRow } from '../generated/prisma'
import {
  countedStatuses,
  criteriaCandidateOf,
  criteriaFiltersOf,
  fitRuleOf,
  measuresOf,
  stableJson,
} from '../listings/criteria-match.service'
import { perimeterOf, toSearchCriteriaDto } from './search-criteria.mapper'
import { draftOf } from './search-criteria.service'

const polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-0.6, 44.8],
      [-0.59, 44.8],
      [-0.59, 44.81],
      [-0.6, 44.8],
    ],
  ],
}

function row(over: Partial<SearchCriteriaRow> = {}): SearchCriteriaRow {
  const now = new Date('2026-11-03T10:00:00.000Z')
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    createdById: null,
    name: 'Talence',
    active: true,
    filters: { priceMax: 200_000 },
    perimeterType: null,
    centerLatitude: null,
    centerLongitude: null,
    radiusMeters: null,
    perimeterGeoJson: null,
    isochroneParams: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  } as SearchCriteriaRow
}

describe('critères : colonnes vers contrat', () => {
  it('filtres complétés par les défauts ; un JSON illisible vaut « aucun filtre »', () => {
    expect(criteriaFiltersOf({ priceMax: 1 }).priceMax).toBe(1)
    expect(criteriaFiltersOf({ priceMax: 'cher' })).toEqual(
      CriteriaFiltersSchema.parse({})
    )
    expect(criteriaFiltersOf(null).statuses).toEqual([])
  })

  it('périmètre reconstruit selon son type, null s’il est incomplet', () => {
    expect(perimeterOf(row())).toBeNull()
    expect(
      perimeterOf(
        row({
          perimeterType: 'point_radius',
          centerLongitude: -0.59,
          centerLatitude: 44.8,
          radiusMeters: 500,
        })
      )
    ).toEqual({
      type: 'point_radius',
      longitude: -0.59,
      latitude: 44.8,
      radiusMeters: 500,
    })
    expect(
      perimeterOf(row({ perimeterType: 'polygon', perimeterGeoJson: polygon }))
    ).toEqual({ type: 'polygon', polygon })
    const iso = perimeterOf(
      row({
        perimeterType: 'isochrone',
        perimeterGeoJson: polygon,
        isochroneParams: {
          origin: { type: 'Point', coordinates: [-0.59, 44.8] },
          mode: 'walking',
          durationMinutes: 10,
        },
      })
    )
    expect(iso?.type).toBe('isochrone')
    expect(perimeterOf(row({ perimeterType: 'polygon' }))).toBeNull()
    const dto = toSearchCriteriaDto(
      row({ perimeterType: 'polygon', perimeterGeoJson: polygon })
    )
    expect(dto.filters.priceMax).toBe(200_000)
    expect(dto.perimeter?.type).toBe('polygon')
  })

  it('brouillon géographique pour l’aperçu', () => {
    expect(draftOf(null)).toEqual({
      perimeterType: null,
      center: null,
      polygon: null,
    })
    expect(
      draftOf({
        type: 'point_radius',
        longitude: 1,
        latitude: 2,
        radiusMeters: 3,
      }).center
    ).toEqual({ longitude: 1, latitude: 2, radiusMeters: 3 })
    expect(
      draftOf({ type: 'polygon', polygon: polygon as never }).polygon
    ).toEqual(polygon)
  })

  it('lot 14 : marge enregistrée, défauts pour un JSON incomplet', () => {
    expect(toSearchCriteriaDto(row()).tolerance).toEqual(
      DEFAULT_CRITERIA_TOLERANCE
    )
    expect(
      toSearchCriteriaDto(row({ tolerance: { priceMaxShare: 0 } })).tolerance
        .priceMaxShare
    ).toBe(0)
    expect(
      toSearchCriteriaDto(row({ tolerance: { priceMaxShare: 'x' } })).tolerance
    ).toEqual(DEFAULT_CRITERIA_TOLERANCE)
    const rule = fitRuleOf(
      row({ filters: { statuses: ['to_visit'] }, perimeterType: 'polygon' })
    )
    expect(rule).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Talence',
      perimeterType: 'polygon',
      statuses: ['to_visit'],
    })
    expect(countedStatuses(rule)).toEqual(['to_visit'])
    expect(countedStatuses({ statuses: [] })).toContain('to_study')
  })

  it('une annonce vue devient un candidat des filtres', () => {
    const candidate = criteriaCandidateOf({
      listing: {
        price: 1,
        surface: 2,
        rooms: 3,
        dpeClass: 'D',
        status: 'to_study',
        location: { commune: 'Talence' },
      },
      evaluation: { metrics: { verdict: 'target' } },
    } as never)
    // Lot 14 : le statut ne fait pas partie de l'adéquation.
    expect(candidate).toEqual({
      price: 1,
      surface: 2,
      rooms: 3,
      dpeClass: 'D',
      commune: 'Talence',
      verdict: 'target',
    })
  })

  it('lot 14 : comparaison des JSON enregistrés indépendante de l’ordre des clés', () => {
    expect(stableJson([{ b: 1, a: { d: 2, c: 3 } }])).toBe(
      stableJson([{ a: { c: 3, d: 2 }, b: 1 }])
    )
    expect(stableJson(['x'])).not.toBe(stableJson(['y']))
  })

  it('lot 14 : mesures PostGIS à la forme de domain', () => {
    expect(
      measuresOf({
        listing_id: 'l',
        criteria_id: 'c',
        has_point: true,
        precision: 'district',
        has_area: true,
        point_distance: 900,
        area_covered: false,
        area_distance: 0,
        area_share: 0.4,
        tram_point_distance: 1200,
        tram_area_distance: 350,
      })
    ).toEqual({
      hasPoint: true,
      precision: 'district',
      hasArea: true,
      pointDistanceMeters: 900,
      areaCovered: false,
      areaDistanceMeters: 0,
      areaInsideShare: 0.4,
      tramPointDistanceMeters: 1200,
      tramAreaDistanceMeters: 350,
    })
  })
})
