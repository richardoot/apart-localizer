import { describe, expect, it, vi } from 'vitest'
import type { GeoService } from '../geo/geo.service'
import {
  PlacementService,
  listingAreaRef,
  metropoleInseeOf,
} from './placement.service'

/** Lot 12 : orchestration du placement au quartier, module geo factice, noms publics, surfaces inventées. */
const AT = new Date('2026-11-05T10:00:00.000Z')

function fakeGeo(over: Partial<Record<keyof GeoService, unknown>> = {}) {
  return {
    neighbourhoodsOfCommune: vi.fn(() =>
      Promise.resolve([
        {
          kind: 'quartier',
          code: 'S1',
          name: 'Queyries, Niel',
          parent: 'La Bastide',
          commune: 'Bordeaux',
          insee_code: '33063',
          source: 'Secteurs (fictif)',
        },
      ])
    ),
    placementAreaFacts: vi.fn((_t: string, areas: readonly { key: string }[]) =>
      Promise.resolve({
        facts: areas.map(a => ({
          key: a.key,
          area_square_meters: a.key.startsWith('parent') ? 5e6 : 3e6,
          longitude: -0.62,
          latitude: 44.85,
        })),
        overlaps:
          areas.length === 2
            ? [{ a: areas[0]?.key ?? '', b: areas[1]?.key ?? '', ratio: 1 }]
            : [],
      })
    ),
    placesOfCommune: vi.fn(() =>
      Promise.resolve([
        {
          source: 'osm',
          external_id: 'node/1',
          name: 'Lieu-Fictif',
          place_type: 'neighbourhood',
          commune: 'Bordeaux',
          insee_code: '33063',
          longitude: -0.6,
          latitude: 44.86,
        },
      ])
    ),
    ...over,
  }
}

describe('PlacementService', () => {
  it('place au centre du secteur reconnu, dans la commune de l’annonce', async () => {
    const geo = fakeGeo()
    const service = new PlacementService(geo as unknown as GeoService)
    const result = await service.locateDistrict(
      { district: 'La Bastide, secteur Niel (bus 9)', commune: 'Bordeaux' },
      AT
    )
    expect(geo.neighbourhoodsOfCommune).toHaveBeenCalledWith(
      'bordeaux_metropole',
      '33063'
    )
    expect(result.located?.point.coordinates).toEqual([-0.62, 44.85])
    expect(result.located?.placement).toMatchObject({
      method: 'neighbourhood_match',
      precision: 'district',
      matchedText: 'secteur Niel',
      area: { level: 'sector', name: 'Queyries, Niel', codes: ['S1'] },
      computedAt: AT.toISOString(),
    })
    expect(result.located?.area).toEqual({
      kind: 'codes',
      territory: 'bordeaux_metropole',
      codes: ['S1'],
    })
    expect(geo.placesOfCommune).not.toHaveBeenCalled()
  })

  it('repli sur un lieu-dit, puis rien de reconnu', async () => {
    const geo = fakeGeo()
    const service = new PlacementService(geo as unknown as GeoService)
    const place = await service.locateDistrict(
      { district: 'Lieu-Fictif', commune: 'Bordeaux', inseeCode: '33063' },
      AT
    )
    expect(place.located?.placement.method).toBe('osm_place')
    expect(place.located?.area).toBeNull()
    expect(place.located?.point.coordinates).toEqual([-0.6, 44.86])
    const none = await service.locateDistrict(
      { district: 'Inconnu, x', commune: 'Bordeaux' },
      AT
    )
    expect(none.located).toBeNull()
    expect(none.reasons).toEqual([
      '« Inconnu » : aucun quartier ni lieu-dit de ce nom à Bordeaux.',
    ])
    expect(none.inseeCode).toBe('33063')
  })

  it('sans commune connue ni texte : rien, sans lire la base', async () => {
    const geo = fakeGeo()
    const service = new PlacementService(geo as unknown as GeoService)
    expect(
      (
        await service.locateDistrict({
          district: 'La Bastide',
          commune: 'Paris',
        })
      ).located
    ).toBeNull()
    expect(
      (await service.locateDistrict({ district: null, commune: 'Bordeaux' }))
        .located
    ).toBeNull()
    expect(geo.neighbourhoodsOfCommune).not.toHaveBeenCalled()
  })

  it('code INSEE d’une commune de la métropole et zone d’une annonce', () => {
    expect(metropoleInseeOf('le bouscat')).toBe('33069')
    expect(metropoleInseeOf('Mérignac')).toBe('33281')
    expect(metropoleInseeOf('Paris')).toBeNull()
    expect(metropoleInseeOf(null)).toBeNull()
    const area = {
      level: 'sector' as const,
      name: 'S',
      codes: ['S1'],
      commune: 'Bordeaux',
      inseeCode: '33063',
      source: 's',
      areaSquareMeters: 1,
    }
    const placement = {
      method: 'neighbourhood_match' as const,
      precision: 'district' as const,
      matchedText: 'S',
      area,
      toVerify: false,
      reasons: [],
      computedAt: AT.toISOString(),
    }
    expect(
      listingAreaRef({ precision: 'district', inseeCode: null, placement })
    ).toEqual({ kind: 'codes', territory: 'bordeaux_metropole', codes: ['S1'] })
    expect(
      listingAreaRef({
        precision: 'district',
        inseeCode: null,
        placement: { ...placement, area: { ...area, codes: [] } },
      })
    ).toBeNull()
    expect(
      listingAreaRef({
        precision: 'commune',
        inseeCode: '33063',
        placement: null,
      })
    ).toEqual({
      kind: 'commune',
      territory: 'bordeaux_metropole',
      inseeCode: '33063',
    })
    expect(
      listingAreaRef({ precision: 'commune', inseeCode: null, placement: null })
    ).toBeNull()
    expect(
      listingAreaRef({
        precision: 'exact',
        inseeCode: '33063',
        placement: null,
      })
    ).toBeNull()
  })
})
