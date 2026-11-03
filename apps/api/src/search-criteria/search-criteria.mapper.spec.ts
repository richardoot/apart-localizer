import { describe, expect, it } from 'vitest'
import { CriteriaFiltersSchema } from '@apart/contracts'
import type { SearchCriteria as SearchCriteriaRow } from '../generated/prisma'
import {
  criteriaCandidateOf,
  criteriaFiltersOf,
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
    const filters = CriteriaFiltersSchema.parse({ maxTramDistanceMeters: 300 })
    expect(draftOf(null, filters)).toEqual({
      perimeterType: null,
      center: null,
      polygon: null,
      filters,
    })
    expect(
      draftOf(
        { type: 'point_radius', longitude: 1, latitude: 2, radiusMeters: 3 },
        filters
      ).center
    ).toEqual({ longitude: 1, latitude: 2, radiusMeters: 3 })
    expect(
      draftOf({ type: 'polygon', polygon: polygon as never }, filters).polygon
    ).toEqual(polygon)
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
    expect(candidate).toEqual({
      price: 1,
      surface: 2,
      rooms: 3,
      dpeClass: 'D',
      status: 'to_study',
      commune: 'Talence',
      verdict: 'target',
    })
  })
})
