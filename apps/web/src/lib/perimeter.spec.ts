import { describe, expect, it } from 'vitest'
import { fakeCriteria, SQUARE } from '@/test/criteria-fixtures'
import { criteriaChangesMessage } from './criteria'
import {
  criteriaFeatures,
  describePerimeter,
  drawnToPerimeter,
  perimeterBounds,
  perimeterPolygon,
} from './perimeter'

describe('périmètres côté carte', () => {
  it('le polygone affiché : tel quel, ou un cercle approché', () => {
    expect(perimeterPolygon({ type: 'polygon', polygon: SQUARE })).toBe(SQUARE)
    const circle = perimeterPolygon({
      type: 'point_radius',
      longitude: -0.59,
      latitude: 44.8,
      radiusMeters: 500,
    })
    expect(circle.coordinates[0]).toHaveLength(65)
  })

  it('l’emprise d’un périmètre, pour y cadrer la carte', () => {
    expect(perimeterBounds({ type: 'polygon', polygon: SQUARE })).toEqual([
      [-0.6, 44.8],
      [-0.58, 44.82],
    ])
    const [[west, south], [east, north]] = perimeterBounds({
      type: 'point_radius',
      longitude: -0.59,
      latitude: 44.8,
      radiusMeters: 1000,
    }) ?? [
      [0, 0],
      [0, 0],
    ]
    // Environ 1 km de part et d'autre du centre.
    expect(north - 44.8).toBeCloseTo(0.009, 3)
    expect(44.8 - south).toBeCloseTo(0.009, 3)
    expect(east + 0.59).toBeCloseTo(0.0127, 3)
    expect(-0.59 - west).toBeCloseTo(0.0127, 3)
    expect(
      perimeterBounds({
        type: 'polygon',
        polygon: { type: 'Polygon', coordinates: [] },
      })
    ).toBeNull()
  })

  it('les périmètres des critères en couche, le critère choisi repéré', () => {
    const fc = criteriaFeatures(
      [
        fakeCriteria(),
        fakeCriteria({ id: 'other', perimeter: null, perimeterType: null }),
      ],
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    )
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0]?.properties).toMatchObject({
      name: 'Talence fictif',
      selected: true,
    })
  })

  it('un polygone dessiné est fermé et arrondi ; un cercle devient point et rayon', () => {
    const open = drawnToPerimeter({
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-0.6, 44.8],
            [-0.58, 44.8],
            [-0.58, 44.82],
            [-0.6000001234, 44.8],
          ],
        ],
      },
      properties: { mode: 'polygon' },
    })
    expect(open).toEqual({
      type: 'polygon',
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [-0.6, 44.8],
            [-0.58, 44.8],
            [-0.58, 44.82],
            [-0.6, 44.8],
          ],
        ],
      },
    })
    const ring: [number, number][] = [
      [-0.59, 44.81],
      [-0.58, 44.8],
      [-0.59, 44.79],
      [-0.6, 44.8],
      [-0.59, 44.81],
    ]
    expect(
      drawnToPerimeter({
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { mode: 'circle', radiusKilometers: 1.2345 },
      })
    ).toEqual({
      type: 'point_radius',
      longitude: -0.59,
      latitude: 44.8,
      radiusMeters: 1235,
    })
    expect(
      drawnToPerimeter({ geometry: { type: 'Point', coordinates: [0, 0] } })
    ).toBeNull()
    expect(
      drawnToPerimeter({
        geometry: { type: 'Polygon', coordinates: [[[0, 0]]] },
      })
    ).toBeNull()
  })

  it('une ligne lisible par périmètre ; le message des critères après une écriture', () => {
    expect(describePerimeter(null)).toBe('Sans périmètre')
    expect(
      describePerimeter({
        type: 'point_radius',
        longitude: 0,
        latitude: 0,
        radiusMeters: 1500,
      })
    ).toContain('1')
    expect(describePerimeter({ type: 'polygon', polygon: SQUARE })).toBe(
      'Polygone dessiné'
    )
    expect(
      describePerimeter({
        type: 'isochrone',
        polygon: SQUARE,
        params: {
          origin: { type: 'Point', coordinates: [0, 0] },
          originLabel: '1 place Fictive',
          mode: 'cycling',
          durationMinutes: 12,
          computedAt: null,
          provider: null,
          approximation: null,
        },
      })
    ).toBe('Isochrone 12 min à vélo depuis 1 place Fictive')
    expect(criteriaChangesMessage(null)).toBeNull()
    expect(
      criteriaChangesMessage({
        entered: [],
        left: [],
        changed: [],
        current: [],
      })
    ).toBeNull()
    expect(
      criteriaChangesMessage({
        entered: [
          {
            criteriaId: 'a',
            name: 'Talence',
            matchedAt: '2026-11-03T10:00:00.000Z',
            approximate: false,
            level: 'in',
            reasons: [],
          },
          {
            criteriaId: 'b',
            name: 'Tram',
            matchedAt: '2026-11-03T10:00:00.000Z',
            approximate: true,
            level: 'to_confirm',
            reasons: [],
          },
        ],
        left: [{ criteriaId: 'c', name: 'Bègles', reasons: [] }],
        changed: [],
        current: [],
      })
    ).toBe(
      'Entre dans les critères « Talence », « Tram » (à confirmer). Sort du critère « Bègles » (hors critères).'
    )
  })
})
