import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { fakeContext, fakeSurroundings } from '@/test/criteria-fixtures'
import { mapLibreMock } from '@/test/setup'
import { IGN_TOPONYMS_STYLE_URL } from '@/lib/base-maps'

const apiMock = vi.hoisted(() => ({
  opendata: {
    amenities: vi.fn(),
    neighbourhoods: vi.fn(),
  },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import ContextMap from './ContextMap.vue'

/** La carte avec TanStack Query (les couches du lot 11 se chargent à la demande). */
function mountMap(options: {
  props: { context: ReturnType<typeof fakeContext> }
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(ContextMap, {
    ...options,
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
}

const features = (id: string) =>
  (
    mapLibreMock.maps[0]?.sources.get(id)?.data as {
      features: Array<{ properties: { label: string; name?: string } }>
    }
  ).features

describe('ContextMap (MapLibre mocké)', () => {
  beforeEach(() => {
    mapLibreMock.reset()
    vi.clearAllMocks()
  })

  it('annonce, tram le plus proche et ventes comparables datées', async () => {
    const wrapper = mountMap({ props: { context: fakeContext() } })
    await nextTick()
    const map = mapLibreMock.maps[0]
    expect(map?.options.center).toEqual([-0.58, 44.84])
    map?.emit('load')
    expect(features('context-listing')).toHaveLength(1)
    expect(features('context-tram')[0]?.properties.label).toBe('Arrêt fictif')
    expect(features('context-comparables')[0]?.properties.label).toBe(
      '2024-06-12 · 4318 €/m²'
    )
    await wrapper.setProps({
      context: fakeContext({
        transit: {
          nearestTram: null,
          nearestStop: null,
          approximate: false,
          reasons: [],
        },
      }),
    })
    expect(features('context-tram')).toHaveLength(0)
    wrapper.unmount()
    expect(map?.removed).toBe(true)
  })

  it('suit le point : rien sans point, créée quand il arrive, recentrée, retirée', async () => {
    const wrapper = mountMap({
      props: { context: fakeContext({ point: null }) },
    })
    await nextTick()
    expect(mapLibreMock.maps).toHaveLength(0)
    expect(wrapper.find('[role="region"]').exists()).toBe(false)

    await wrapper.setProps({ context: fakeContext() })
    await nextTick()
    expect(mapLibreMock.maps).toHaveLength(1)
    const map = mapLibreMock.maps[0]

    await wrapper.setProps({
      context: fakeContext({
        point: { type: 'Point', coordinates: [-0.57, 44.85] },
      }),
    })
    await nextTick()
    expect(mapLibreMock.maps).toHaveLength(1)
    expect(map?.center).toEqual([-0.57, 44.85])

    await wrapper.setProps({ context: fakeContext({ point: null }) })
    await nextTick()
    expect(map?.removed).toBe(true)
    wrapper.unmount()
  })

  it('le fond choisi s’applique à la carte du quartier, points gardés', async () => {
    const wrapper = mountMap({ props: { context: fakeContext() } })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('load')
    const switcher = wrapper.get('[data-testid="base-map-switcher"]')
    expect(
      switcher.get('[data-base-map="osm"]').attributes('aria-checked')
    ).toBe('true')
    await switcher.get('[data-base-map="ign-photo"]').trigger('click')
    expect(map?.styleCalls[0]?.style).toBe(IGN_TOPONYMS_STYLE_URL)
    expect(features('context-listing')).toHaveLength(1)
    expect(features('context-comparables')).toHaveLength(1)
    expect(
      switcher.get('[data-base-map="ign-photo"]').attributes('aria-checked')
    ).toBe('true')
    wrapper.unmount()
  })

  it('lot 11 : les équipements les plus proches, puis les couches complètes à la demande', async () => {
    const drive = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.6, 44.8] },
      properties: {
        kind: 'supermarket_drive',
        name: 'Drive fictif de la couche',
        brandGroup: 'auchan',
        drive: 'yes',
        source: 'osm',
      },
    }
    const area = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-0.6, 44.8],
            [-0.5, 44.8],
            [-0.5, 44.9],
            [-0.6, 44.8],
          ],
        ],
      },
      properties: {
        name: 'Quartier fictif',
        code: 'Q1',
        kind: 'quartier',
        commune: 'Bordeaux',
        parent: null,
        source: 'Source fictive',
        partial: false,
      },
    }
    apiMock.opendata.amenities.mockResolvedValue({
      type: 'FeatureCollection',
      features: [drive],
    })
    apiMock.opendata.neighbourhoods.mockResolvedValue({
      type: 'FeatureCollection',
      features: [area],
    })
    const wrapper = mountMap({ props: { context: fakeContext() } })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('load')
    // Sans couche allumée : les plus proches du contexte (Carrefour,
    // Intermarché, le plus proche toutes enseignes), la piste ; pas de
    // Fitness Park (non importé).
    expect(features('drives').map(f => f.properties.label)).toEqual([
      'Carrefour Drive fictif',
      'Intermarché fictif',
      'Drive fictif',
    ])
    expect(features('athletics')[0]?.properties.label).toBe('Stade fictif')
    expect(features('fitness')).toHaveLength(0)
    expect(apiMock.opendata.amenities).not.toHaveBeenCalled()
    // Cadrage initial sur l'annonce et ses équipements proches (3 km au plus).
    expect(map?.camera[0]).toEqual({
      kind: 'fitBounds',
      args: [
        [
          [-0.585, 44.835],
          [-0.57, 44.845],
        ],
        { padding: 40, maxZoom: 15, animate: false },
      ],
    })
    // Les contours sont allumés d'emblée ; le quartier de l'annonce ressort.
    await flushPromises()
    expect(apiMock.opendata.neighbourhoods).toHaveBeenCalledTimes(1)
    expect(features('neighbourhoods')).toHaveLength(1)
    expect(features('neighbourhood-current')).toHaveLength(1)

    await wrapper.get('input[data-layer="drives"]').setValue(true)
    await flushPromises()
    expect(apiMock.opendata.amenities).toHaveBeenCalledWith('supermarket_drive')
    expect(features('drives').map(f => f.properties.name)).toEqual([
      'Drive fictif de la couche',
    ])
    expect(features('neighbourhoods')).toHaveLength(1)
    expect(wrapper.get('[data-testid="surroundings-legend"]').text()).toContain(
      'autre enseigne'
    )

    // Survol d'un contour : son nom près du pointeur, contour mis en avant.
    map?.emit('mousemove:neighbourhoods-fill', {
      point: { x: 10, y: 20 },
      features: [{ properties: { code: 'Q1' } }],
    })
    await nextTick()
    expect(wrapper.get('[data-testid="neighbourhood-hover"]').text()).toBe(
      'Quartier fictif (Bordeaux)'
    )
    expect(
      (map?.sources.get('neighbourhood-hover')?.data as { features: unknown[] })
        .features
    ).toHaveLength(1)
    map?.emit('mouseleave:neighbourhoods-fill')
    await nextTick()
    expect(wrapper.find('[data-testid="neighbourhood-hover"]').exists()).toBe(
      false
    )

    // Clic : un équipement d'abord, sinon le quartier.
    if (map) {
      map.rendered = [
        {
          layer: { id: 'drives-preferred-points' },
          properties: drive.properties,
        },
      ]
    }
    map?.emit('click', { lngLat: { lng: -0.6, lat: 44.8 }, point: [1, 1] })
    expect(mapLibreMock.popups.at(-1)?.html).toContain(
      'Drive fictif de la couche'
    )
    expect(mapLibreMock.popups.at(-1)?.html).toContain('enseigne préférée')
    if (map) {
      map.rendered = [
        { layer: { id: 'neighbourhoods-fill' }, properties: area.properties },
      ]
    }
    map?.emit('click', { lngLat: { lng: -0.6, lat: 44.8 }, point: [1, 1] })
    expect(mapLibreMock.popups.at(-1)?.html).toContain(
      'Source : Source fictive'
    )
    if (map) map.rendered = []
    const before = mapLibreMock.popups.length
    map?.emit('click', { lngLat: { lng: -0.6, lat: 44.8 }, point: [1, 1] })
    expect(mapLibreMock.popups).toHaveLength(before)
    // Contours éteints : plus de quartier mis en avant.
    await wrapper.get('input[data-layer="neighbourhoods"]').setValue(false)
    expect(features('neighbourhoods')).toHaveLength(0)
    expect(features('neighbourhood-current')).toHaveLength(0)
    wrapper.unmount()
  })

  it('sans équipement proche ni quartier : seulement l’annonce', async () => {
    const empty = fakeSurroundings({
      athleticsTrack: {
        status: 'unavailable',
        nearest: null,
        approximate: false,
        reasons: [],
      },
      supermarkets: {
        status: 'unavailable',
        preferred: { carrefour: null, auchan: null, intermarche: null },
        nearest: null,
        approximate: false,
        reasons: [],
      },
    })
    const wrapper = mountMap({
      props: { context: fakeContext({ surroundings: empty }) },
    })
    await nextTick()
    mapLibreMock.maps[0]?.emit('load')
    expect(features('drives')).toHaveLength(0)
    expect(features('athletics')).toHaveLength(0)
    expect(features('context-listing')).toHaveLength(1)
    wrapper.unmount()
  })
})
