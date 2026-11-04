import { describe, expect, it } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { MockMap } from '@/test/setup'
import { OVERLAY_METADATA_KEY } from './base-maps'
import {
  CRITERIA_LAYERS,
  EMPTY_COLLECTION,
  HALO_COLOR,
  RENT_ZONE_COLORS,
  RENT_ZONE_LAYERS,
  layerFeaturePopupHtml,
  perimeterLayers,
  pointLayer,
  upsertGeoJsonLayer,
} from './map-layers'

const point = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.58, 44.84] },
      properties: {},
    },
  ],
}

describe('upsertGeoJsonLayer (MapLibre mocké)', () => {
  it('pose la source et ses couches une fois, puis ne remplace que les données', () => {
    const map = new MockMap({})
    const asMap = map as unknown as MapLibreMap
    upsertGeoJsonLayer(
      asMap,
      'stops',
      point,
      pointLayer('stops-points', '#000', 3)
    )
    expect(map.sources.get('stops')?.data).toEqual(point)
    expect(map.layers).toEqual([
      expect.objectContaining({
        id: 'stops-points',
        type: 'circle',
        source: 'stops',
        paint: expect.objectContaining({
          'circle-color': '#000',
          'circle-radius': 3,
          'circle-stroke-color': HALO_COLOR,
        }),
        // Marquée : un changement de fond la recopie (lib/base-maps.ts).
        metadata: { [OVERLAY_METADATA_KEY]: true },
      }),
    ])
    upsertGeoJsonLayer(
      asMap,
      'stops',
      null,
      pointLayer('stops-points', '#000', 3)
    )
    expect(map.sources.get('stops')?.data).toEqual(EMPTY_COLLECTION)
    expect(map.layers).toHaveLength(1)
  })

  it('les styles des périmètres et des zones : remplissage et contour', () => {
    // Remplissage, liseré clair (lisible sur la photo aérienne), contour.
    expect(CRITERIA_LAYERS.map(l => l.type)).toEqual(['fill', 'line', 'line'])
    expect(CRITERIA_LAYERS[1]?.paint['line-color']).toBe(HALO_COLOR)
    expect(RENT_ZONE_LAYERS.map(l => l.type)).toEqual(['fill', 'line'])
    expect(Object.keys(RENT_ZONE_COLORS)).toEqual(['1', '2', '3', '4'])
    const map = new MockMap({})
    upsertGeoJsonLayer(
      map as unknown as MapLibreMap,
      'zones',
      undefined,
      RENT_ZONE_LAYERS
    )
    expect(map.layers.map(l => (l as { id: string }).id)).toEqual([
      'rent-zones-fill',
      'rent-zones-line',
    ])
  })
})

describe('perimeterLayers', () => {
  it('un périmètre simple : contour plein ; sélectionnable : épaisseur selon `selected`', () => {
    const plain = perimeterLayers('radius', '#0e6b63')
    expect(plain.map(l => l.id)).toEqual([
      'radius-fill',
      'radius-halo',
      'radius-line',
    ])
    expect(plain[2]?.paint['line-width']).toBe(3)
    expect(plain[2]?.paint['line-dasharray']).toBeUndefined()
    expect(plain[1]?.layout).toEqual({ 'line-join': 'round' })
    const selectable = perimeterLayers('c', '#000', {
      dashed: true,
      selectable: true,
    })
    expect(selectable[2]?.paint['line-width']).toEqual([
      'case',
      ['get', 'selected'],
      3,
      1.5,
    ])
    expect(selectable[2]?.paint['line-dasharray']).toEqual([2, 1])
    const map = new MockMap({})
    upsertGeoJsonLayer(map as unknown as MapLibreMap, 'c', null, selectable)
    expect(
      (map.layers[1] as { layout: Record<string, string> }).layout
    ).toEqual({ 'line-join': 'round' })
    expect((map.layers[0] as { layout?: unknown }).layout).toBeUndefined()
  })
})

describe('layerFeaturePopupHtml', () => {
  it('une vente DVF : date, prix, surface, prix au m², adresse échappée', () => {
    const html = layerFeaturePopupHtml({
      layer: { id: 'dvf-sales-points' },
      properties: {
        date: '2024-06-12',
        price: 190000,
        surface: 44,
        pricePerM2: 4318,
        rooms: 2,
        address: '3 rue <Fictive>',
      },
    })
    expect(html).toContain('Vente DVF du 12 juin 2024')
    expect(html).toContain('2 p.')
    expect(html).toContain('3 rue &#60;Fictive&#62;')
    expect(html).not.toContain('<Fictive>')
  })

  it('une vente sans détail ni adresse', () => {
    expect(
      layerFeaturePopupHtml({
        layer: { id: 'dvf-sales-points' },
        properties: { date: '2024-06-12', price: null },
      })
    ).toBe('<strong>Vente DVF du 12 juin 2024</strong>')
  })

  it('un arrêt : nom, mode, lignes ; repli lisible sans propriété', () => {
    expect(
      layerFeaturePopupHtml({
        layer: { id: 'tram-stops-points' },
        properties: { name: 'Arrêt fictif', mode: 'tram', lines: 'A, C' },
      })
    ).toBe('<strong>Arrêt fictif</strong><br>Tram · A, C')
    expect(layerFeaturePopupHtml({ properties: null })).toBe(
      '<strong>Arrêt</strong><br>Arrêt'
    )
  })
})
