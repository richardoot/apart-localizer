import { describe, expect, it } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { MockMap } from '@/test/setup'
import { OVERLAY_METADATA_KEY } from './base-maps'
import {
  AMENITY_COLORS,
  DRIVE_LAYERS,
  NEIGHBOURHOOD_HOVER_SOURCE,
  NEIGHBOURHOOD_LAYERS,
  POPUP_LAYER_IDS,
  SURROUNDINGS_ATTRIBUTIONS,
  amenityPopupHtml,
  bindNeighbourhoodHover,
  surroundingsFrame,
  neighbourhoodLabel,
  neighbourhoodPopupHtml,
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

describe('lot 11 : équipements et quartiers', () => {
  it('drives : enseignes préférées en disque plein, autres en cercle creux', () => {
    const [other, preferred] = DRIVE_LAYERS
    expect(preferred?.filter).toEqual([
      'in',
      ['get', 'brandGroup'],
      ['literal', ['carrefour', 'auchan', 'intermarche']],
    ])
    expect(other?.filter).toEqual(['!', preferred?.filter])
    expect(preferred?.paint['circle-color']).toBe(AMENITY_COLORS.drives)
    expect(other?.paint['circle-color']).toBe(HALO_COLOR)
    expect(other?.paint['circle-stroke-color']).toBe(AMENITY_COLORS.drives)
    expect(Number(preferred?.paint['circle-radius'])).toBeGreaterThan(
      Number(other?.paint['circle-radius'])
    )
    expect(POPUP_LAYER_IDS).toContain('drives-preferred-points')
    // Le filtre passe à MapLibre avec la couche.
    const map = new MockMap({})
    upsertGeoJsonLayer(
      map as unknown as MapLibreMap,
      'drives',
      null,
      DRIVE_LAYERS,
      SURROUNDINGS_ATTRIBUTIONS.osm
    )
    expect(map.sources.get('drives')?.spec.attribution).toBe('© OpenStreetMap')
    expect((map.layers[1] as { filter: unknown }).filter).toEqual(
      preferred?.filter
    )
    expect((map.layers[0] as { metadata: unknown }).metadata).toEqual({
      [OVERLAY_METADATA_KEY]: true,
    })
  })

  it('contours : trait fin et sombre, liseré clair, remplissage presque invisible', () => {
    const [fill, halo, line] = NEIGHBOURHOOD_LAYERS
    expect(fill?.paint['fill-opacity']).toBeLessThan(0.05)
    expect(halo?.paint['line-color']).toBe(HALO_COLOR)
    expect(line?.paint['line-width']).toBe(1)
  })

  it('fenêtre d’un équipement : nom, genre, enseigne, drive, nature, adresse, source', () => {
    const html = amenityPopupHtml({
      kind: 'supermarket_drive',
      name: 'Drive <fictif>',
      brand: 'Auchan Drive',
      brandGroup: 'auchan',
      drive: 'yes',
      address: '1 rue Fictive',
      commune: 'Bordeaux',
      source: 'osm',
    })
    expect(html).toContain('<strong>Drive &#60;fictif&#62;</strong>')
    expect(html).toContain(
      'Supermarché avec drive · Auchan Drive · Drive · enseigne préférée'
    )
    expect(html).toContain('1 rue Fictive, Bordeaux')
    expect(html).toContain('Source : © contributeurs OpenStreetMap (ODbL)')
    const track = amenityPopupHtml({
      kind: 'athletics_track',
      name: 'Stade fictif',
      facilityType: 'Stade d’athlétisme',
      covered: false,
      lengthMeters: 400,
      access: 'Clubs',
      source: 'res',
    })
    expect(track).toContain('Stade d’athlétisme · découverte · 400 m · Clubs')
    expect(track).toContain('Source : Ministère des Sports, Data ES')
    expect(amenityPopupHtml({ covered: true, brandGroup: 'inconnu' })).toBe(
      '<strong>Équipement</strong><br>couverte'
    )
    expect(amenityPopupHtml(null)).toBe('<strong>Équipement</strong>')
    // Par la fenêtre générique des couches.
    expect(
      layerFeaturePopupHtml({
        layer: { id: 'fitness-points' },
        properties: { kind: 'fitness_park', name: 'Fitness Park fictif' },
      })
    ).toContain('Salle Fitness Park')
  })

  it('fenêtre et nom d’un quartier', () => {
    const props = {
      name: 'Secteur fictif',
      parent: 'Quartier parent',
      commune: 'Bordeaux',
      kind: 'quartier',
      source: 'Source fictive',
      partial: false,
    }
    expect(neighbourhoodLabel(props)).toBe('Secteur fictif (Bordeaux)')
    expect(neighbourhoodLabel({ name: 'Ambès', commune: 'Ambès' })).toBe(
      'Ambès'
    )
    expect(neighbourhoodLabel(null)).toBe('Quartier')
    const html = neighbourhoodPopupHtml(props)
    expect(html).toContain('<strong>Secteur fictif</strong>')
    expect(html).toContain('Quartier Quartier parent')
    expect(html).toContain('Bordeaux · Quartier')
    expect(html).toContain('Source : Source fictive')
    expect(
      neighbourhoodPopupHtml({
        name: 'IRIS Fictif',
        kind: 'iris',
        partial: true,
      })
    ).toContain('IRIS · part hors des quartiers officiels')
    expect(neighbourhoodPopupHtml(undefined)).toBe(
      '<strong>Quartier</strong><br>'
    )
    expect(
      layerFeaturePopupHtml({
        layer: { id: 'neighbourhoods-fill' },
        properties: props,
      })
    ).toBe(html)
  })

  it('survol : contour complet mis en avant, nom remonté, effacé en sortie', () => {
    const map = new MockMap({})
    const labels: Array<string | null> = []
    const feature = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: { code: 'S1', name: 'Secteur fictif', commune: 'Bordeaux' },
    }
    let features: {
      features: Array<{ properties: Record<string, unknown> }>
    } | null = {
      features: [feature],
    }
    bindNeighbourhoodHover(map as unknown as MapLibreMap, {
      features: () => features,
      onHover: label => labels.push(label),
    })
    map.emit('mousemove:neighbourhoods-fill', {
      point: { x: 1, y: 2 },
      features: [{ properties: { code: 'S1' } }],
    })
    const hover = () =>
      (
        map.sources.get(NEIGHBOURHOOD_HOVER_SOURCE)?.data as {
          features: unknown[]
        }
      ).features
    expect(hover()).toEqual([feature])
    map.emit('mouseleave:neighbourhoods-fill')
    expect(hover()).toEqual([])
    features = null
    map.emit('mousemove:neighbourhoods-fill', {})
    expect(labels).toEqual(['Secteur fictif (Bordeaux)', null, null])
  })

  it('cadrage : l’annonce et ses équipements à moins de 3 km', () => {
    const at = (x: number, y: number, distanceMeters: number) => ({
      point: { coordinates: [x, y] as [number, number] },
      distanceMeters,
    })
    const context = {
      point: { coordinates: [-0.58, 44.84] as [number, number] },
      transit: { nearestTram: null },
      surroundings: {
        athleticsTrack: { nearest: at(-0.6, 44.83, 2500) },
        supermarkets: { nearest: at(-0.5, 44.9, 9000) },
        fitnessPark: { nearest: null },
      },
    }
    expect(surroundingsFrame(context)).toEqual([
      [-0.6, 44.83],
      [-0.58, 44.84],
    ])
    expect(
      surroundingsFrame({
        ...context,
        surroundings: {
          ...context.surroundings,
          athleticsTrack: { nearest: at(-0.6, 44.83, 3500) },
        },
      })
    ).toBeNull()
    expect(surroundingsFrame({ ...context, point: null })).toBeNull()
  })
})
