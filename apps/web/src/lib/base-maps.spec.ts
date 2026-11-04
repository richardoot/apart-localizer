import { describe, expect, it } from 'vitest'
import {
  BASE_MAPS,
  BASE_MAP_IDS,
  DEFAULT_BASE_MAP,
  IGN_ORTHO_ATTRIBUTION,
  IGN_ORTHO_TILE_URL,
  IGN_PLAN_ATTRIBUTION,
  IGN_PLAN_STYLE_URL,
  IGN_TOPONYMS_STYLE_URL,
  ORTHO_SOURCE_ID,
  OVERLAY_METADATA_KEY,
  TERRA_DRAW_PREFIX,
  adaptBaseStyle,
  baseMapDefinition,
  baseMapStyleUrl,
  baseMapTransform,
  isBaseMapId,
  isOverlayLayer,
  overlaysOf,
} from './base-maps'
import type { LayerSpecification, StyleSpecification } from './base-maps'
import { DEFAULT_MAP_STYLE_URL } from './map-style'

const overlay = { [OVERLAY_METADATA_KEY]: true }

/** Un style « précédent » : le fond OSM, puis deux couches de l'application et le dessin. */
function previousStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      openmaptiles: { type: 'vector', url: 'https://tiles.example.invalid' },
      'tram-stops': {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [{ id: 1 }] },
      } as never,
      [`${TERRA_DRAW_PREFIX}-polygon`]: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [{ id: 'drawing' }] },
      } as never,
      orphan: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      },
    },
    layers: [
      { id: 'background', type: 'background' },
      {
        id: 'roads',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'r',
      },
      {
        id: 'tram-stops-points',
        type: 'circle',
        source: 'tram-stops',
        metadata: overlay,
      },
      {
        id: `${TERRA_DRAW_PREFIX}-polygon`,
        type: 'fill',
        source: `${TERRA_DRAW_PREFIX}-polygon`,
      },
    ] as LayerSpecification[],
  }
}

/** Un style IGN tel que publié : une source vectorielle sans attribution. */
function ignStyle(): StyleSpecification {
  return {
    version: 8,
    sprite: 'https://data.geopf.fr/sprite',
    glyphs: 'https://data.geopf.fr/fonts/{fontstack}/{range}.pbf',
    sources: {
      plan_ign: {
        type: 'vector',
        tiles: ['https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf'],
      },
      relief: {
        type: 'vector',
        url: 'https://relief.example.invalid',
        attribution: 'déjà attribué',
      },
    },
    layers: [
      {
        id: 'toponyme - odonyme',
        type: 'symbol',
        source: 'plan_ign',
        'source-layer': 'toponyme_routier_odonyme_lin',
      },
    ] as LayerSpecification[],
  }
}

describe('catalogue des fonds de carte', () => {
  it('trois fonds sans clé, le plan OSM par défaut, libellés en français', () => {
    expect([...BASE_MAP_IDS]).toEqual(['osm', 'ign-plan', 'ign-photo'])
    expect(BASE_MAPS.map(b => b.label)).toEqual([
      'Plan OSM',
      'Plan IGN',
      'Photo aérienne',
    ])
    expect(DEFAULT_BASE_MAP).toBe('osm')
    for (const url of [
      IGN_PLAN_STYLE_URL,
      IGN_TOPONYMS_STYLE_URL,
      IGN_ORTHO_TILE_URL,
    ]) {
      expect(url).toMatch(/^https:\/\/data\.geopf\.fr\//)
      expect(url).not.toMatch(/apikey|key=|token=/i)
    }
    expect(baseMapDefinition('ign-photo').photo).toBe(true)
    expect(baseMapDefinition('nope' as never).id).toBe('osm')
  })

  it('les URL vérifiées de la Géoplateforme : style PLAN.IGN, toponymes, WMTS ortho', () => {
    expect(IGN_PLAN_STYLE_URL).toBe(
      'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json'
    )
    expect(IGN_TOPONYMS_STYLE_URL).toBe(
      'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/toponymes.json'
    )
    const ortho = new URL(IGN_ORTHO_TILE_URL.replace(/[{}]/g, ''))
    expect(Object.fromEntries(ortho.searchParams)).toMatchObject({
      SERVICE: 'WMTS',
      REQUEST: 'GetTile',
      LAYER: 'ORTHOIMAGERY.ORTHOPHOTOS',
      STYLE: 'normal',
      TILEMATRIXSET: 'PM_0_19',
      FORMAT: 'image/jpeg',
    })
    expect(IGN_ORTHO_TILE_URL).toContain(
      'TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
    )
  })

  it('le plan OSM suit VITE_MAP_STYLE_URL ; les fonds IGN non', () => {
    const env = { VITE_MAP_STYLE_URL: 'https://tiles.example.invalid/s.json' }
    expect(baseMapStyleUrl('osm', {})).toBe(DEFAULT_MAP_STYLE_URL)
    expect(baseMapStyleUrl('osm', env)).toBe(env.VITE_MAP_STYLE_URL)
    expect(baseMapStyleUrl('ign-plan', env)).toBe(IGN_PLAN_STYLE_URL)
    expect(baseMapStyleUrl('ign-photo', env)).toBe(IGN_TOPONYMS_STYLE_URL)
  })

  it('reconnaît un identifiant de fond', () => {
    expect(isBaseMapId('ign-plan')).toBe(true)
    expect(isBaseMapId('satellite')).toBe(false)
    expect(isBaseMapId(null)).toBe(false)
  })
})

describe('style d’un fond', () => {
  it('plan IGN : attribution « © IGN » sur les sources vectorielles qui n’en ont pas', () => {
    const adapted = adaptBaseStyle(baseMapDefinition('ign-plan'), ignStyle())
    expect(
      (adapted.sources.plan_ign as { attribution?: string }).attribution
    ).toBe(IGN_PLAN_ATTRIBUTION)
    expect(
      (adapted.sources.relief as { attribution?: string }).attribution
    ).toBe('déjà attribué')
    expect(IGN_PLAN_ATTRIBUTION).toContain('© IGN')
    expect(adapted.layers).toHaveLength(1)
    expect(adapted.sprite).toBe('https://data.geopf.fr/sprite')
  })

  it('plan OSM : le style tel quel (son TileJSON porte l’attribution OpenStreetMap)', () => {
    const style = ignStyle()
    const adapted = adaptBaseStyle(baseMapDefinition('osm'), style)
    expect(adapted.sources.plan_ign).toBe(style.sources.plan_ign)
    expect(adapted.layers).toEqual(style.layers)
  })

  it('photo aérienne : orthophotos IGN sous les voies et les noms de rues', () => {
    const adapted = adaptBaseStyle(baseMapDefinition('ign-photo'), ignStyle())
    expect(adapted.layers[0]).toEqual({
      id: ORTHO_SOURCE_ID,
      type: 'raster',
      source: ORTHO_SOURCE_ID,
    })
    expect(adapted.layers[1]?.id).toBe('toponyme - odonyme')
    expect(adapted.sources[ORTHO_SOURCE_ID]).toEqual({
      type: 'raster',
      tiles: [IGN_ORTHO_TILE_URL],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution: IGN_ORTHO_ATTRIBUTION,
    })
    expect(IGN_ORTHO_ATTRIBUTION).toContain('© IGN')
    // Adapter deux fois ne double pas la photo.
    const twice = adaptBaseStyle(baseMapDefinition('ign-photo'), adapted)
    expect(twice.layers.filter(l => l.id === ORTHO_SOURCE_ID)).toHaveLength(1)
  })
})

describe('changement de fond : les couches de l’application survivent', () => {
  it('reconnaît les couches de l’application (métadonnée) et du dessin (préfixe)', () => {
    const [background, roads, tram, drawing] = previousStyle().layers
    expect(isOverlayLayer(background as LayerSpecification)).toBe(false)
    expect(isOverlayLayer(roads as LayerSpecification)).toBe(false)
    expect(isOverlayLayer(tram as LayerSpecification)).toBe(true)
    expect(isOverlayLayer(drawing as LayerSpecification)).toBe(true)
    expect(
      isOverlayLayer({
        id: 'x',
        type: 'background',
        metadata: { [OVERLAY_METADATA_KEY]: 'oui' },
      } as LayerSpecification)
    ).toBe(false)
  })

  it('relève les couches de l’application et leurs sources, données comprises', () => {
    const { sources, layers } = overlaysOf(previousStyle())
    expect(layers.map(l => l.id)).toEqual([
      'tram-stops-points',
      `${TERRA_DRAW_PREFIX}-polygon`,
    ])
    expect(Object.keys(sources)).toEqual([
      'tram-stops',
      `${TERRA_DRAW_PREFIX}-polygon`,
    ])
    expect(
      (sources[`${TERRA_DRAW_PREFIX}-polygon`] as { data: unknown }).data
    ).toEqual({ type: 'FeatureCollection', features: [{ id: 'drawing' }] })
    expect(overlaysOf(undefined)).toEqual({ sources: {}, layers: [] })
  })

  it('le nouveau fond dessous, les couches de l’application dessus, l’ancien fond parti', () => {
    const transform = baseMapTransform(baseMapDefinition('ign-photo'))
    const result = transform(previousStyle(), ignStyle())
    expect(result.layers.map(l => l.id)).toEqual([
      ORTHO_SOURCE_ID,
      'toponyme - odonyme',
      'tram-stops-points',
      `${TERRA_DRAW_PREFIX}-polygon`,
    ])
    expect(Object.keys(result.sources).sort()).toEqual(
      [
        ORTHO_SOURCE_ID,
        'plan_ign',
        'relief',
        'tram-stops',
        `${TERRA_DRAW_PREFIX}-polygon`,
      ].sort()
    )
    expect(result.sources.openmaptiles).toBeUndefined()
    expect(result.sources.orphan).toBeUndefined()
    // Sans état : un second appel (reconstruction après un diff impossible) donne le même style.
    expect(transform(previousStyle(), ignStyle())).toEqual(result)
    // Repasser sur le fond OSM rend les couches de l'application à l'identique.
    const back = baseMapTransform(baseMapDefinition('osm'))(result, {
      version: 8,
      sources: { openmaptiles: { type: 'vector', url: 'x' } },
      layers: [{ id: 'background', type: 'background' }],
    })
    expect(back.layers.map(l => l.id)).toEqual([
      'background',
      'tram-stops-points',
      `${TERRA_DRAW_PREFIX}-polygon`,
    ])
    expect(back.sources[ORTHO_SOURCE_ID]).toBeUndefined()
  })

  it('premier chargement : le fond seul, adapté', () => {
    const result = baseMapTransform(baseMapDefinition('ign-plan'))(
      undefined,
      ignStyle()
    )
    expect(result.layers.map(l => l.id)).toEqual(['toponyme - odonyme'])
    expect(
      (result.sources.plan_ign as { attribution?: string }).attribution
    ).toBe(IGN_PLAN_ATTRIBUTION)
  })
})
