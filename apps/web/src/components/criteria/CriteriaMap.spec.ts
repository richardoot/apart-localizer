import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { Perimeter } from '@apart/contracts'
import { mapLibreMock, terraDrawMock } from '@/test/setup'
import { SQUARE } from '@/test/criteria-fixtures'
import { IGN_PLAN_STYLE_URL, IGN_TOPONYMS_STYLE_URL } from '@/lib/base-maps'
import {
  ADDRESS_ZOOM,
  COMMUNE_ZOOM,
  DRAW_MAP_CENTER,
  DRAW_MAP_ZOOM,
} from '@/lib/map-style'
import { useBaseMapStore } from '@/stores/base-map'

const apiMock = vi.hoisted(() => ({ opendata: { geocode: vi.fn() } }))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import CriteriaMap from './CriteriaMap.vue'

type Props = {
  perimeter: Perimeter | null
  drawMode: 'polygon' | 'circle' | 'pick' | null
}

function mountMap(props: Props) {
  return mount(CriteriaMap, {
    props,
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
  })
}

const layerIds = (map: { layers: unknown[] } | undefined): string[] =>
  (map?.layers ?? []).map(l => (l as { id: string }).id)

const ISOCHRONE_PARAMS = {
  origin: {
    type: 'Point' as const,
    coordinates: [-0.59, 44.81] as [number, number],
  },
  originLabel: null,
  mode: 'walking' as const,
  durationMinutes: 15,
  computedAt: null,
  provider: null,
  approximation: null,
}
const ISOCHRONE: Perimeter = {
  type: 'isochrone',
  polygon: SQUARE,
  params: ISOCHRONE_PARAMS,
}

describe('CriteriaMap (MapLibre et terra-draw mockés)', () => {
  beforeEach(() => {
    mapLibreMock.reset()
    terraDrawMock.reset()
    vi.clearAllMocks()
  })

  it('dessine avec terra-draw une fois la carte chargée et rend le polygone', async () => {
    const wrapper = mountMap({ perimeter: null, drawMode: 'polygon' })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('load')
    const draw = terraDrawMock.instances[0]
    expect(draw?.started).toBe(true)
    expect(draw?.options.modes).toHaveLength(2)
    expect(draw?.mode).toBe('polygon')
    expect(draw?.options.modes[0]).toMatchObject({
      options: { editable: true },
    })
    draw?.finish({ geometry: SQUARE, properties: { mode: 'polygon' } })
    expect(wrapper.emitted('drawn')?.[0]).toEqual([
      { type: 'polygon', polygon: SQUARE },
    ])
    // La forme reste sur la carte pour être retouchée ; une retouche repart.
    expect(draw?.features.size).toBe(1)
    const moved = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-0.61, 44.8],
          [-0.58, 44.8],
          [-0.58, 44.82],
          [-0.61, 44.8],
        ] as [number, number][],
      ],
    }
    draw?.finish(
      { geometry: moved, properties: { mode: 'polygon' } },
      'drawn-1',
      'dragCoordinate'
    )
    expect(wrapper.emitted('drawn')?.[1]).toEqual([
      { type: 'polygon', polygon: moved },
    ])
    // Un nouveau tracé remplace le précédent.
    draw?.finish(
      { geometry: SQUARE, properties: { mode: 'polygon' } },
      'drawn-2'
    )
    expect([...(draw?.features.keys() ?? [])]).toEqual(['drawn-2'])
    await wrapper.setProps({ drawMode: 'circle' })
    expect(draw?.mode).toBe('circle')
    await wrapper.setProps({ drawMode: null })
    expect(draw?.mode).toBe('static')
    expect(wrapper.get('[data-testid="draw-hint"]').text()).toContain(
      'périmètre'
    )
    wrapper.unmount()
    expect(draw?.stopped).toBe(true)
    expect(map?.removed).toBe(true)
  })

  it('charge le polygone d’un critère enregistré pour le retoucher', async () => {
    const wrapper = mountMap({
      perimeter: { type: 'polygon', polygon: SQUARE },
      drawMode: 'polygon',
    })
    await nextTick()
    mapLibreMock.maps[0]?.emit('load')
    const draw = terraDrawMock.instances[0]
    const loaded = [...(draw?.features.values() ?? [])] as Array<{
      geometry: unknown
      properties: { mode: string }
    }>
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.geometry).toEqual(SQUARE)
    expect(loaded[0]?.properties.mode).toBe('polygon')
    // Passer au cercle efface la forme ; aucun polygone n'y est rechargé.
    await wrapper.setProps({ drawMode: 'circle' })
    expect(draw?.features.size).toBe(0)
    wrapper.unmount()
  })

  it('affiche le périmètre courant ; en mode « point », un clic rend les coordonnées', async () => {
    const wrapper = mountMap({
      perimeter: { type: 'polygon', polygon: SQUARE },
      drawMode: 'pick',
    })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('load')
    const source = map?.sources.get('criteria-editor-perimeter')
    expect((source?.data as { features: unknown[] }).features).toHaveLength(1)
    map?.emit('click', { lngLat: { lng: -0.5812345678, lat: 44.84 } })
    expect(wrapper.emitted('pick')?.[0]).toEqual([
      { longitude: -0.581235, latitude: 44.84 },
    ])
    await wrapper.setProps({ perimeter: null })
    expect(
      (
        map?.sources.get('criteria-editor-perimeter')?.data as {
          features: unknown[]
        }
      ).features
    ).toHaveLength(0)
    await wrapper.setProps({ drawMode: 'polygon' })
    map?.emit('click', { lngLat: { lng: 0, lat: 0 } })
    expect(wrapper.emitted('pick')).toHaveLength(1)
    wrapper.unmount()
  })

  it('changer de fond garde le périmètre et le dessin terra-draw en cours', async () => {
    const wrapper = mountMap({
      perimeter: { type: 'polygon', polygon: SQUARE },
      drawMode: 'polygon',
    })
    await nextTick()
    const map = mapLibreMock.maps[0]
    // Le style du fond choisi et son transformStyle dès la création.
    expect(String(map?.options.style)).toBe(
      'https://tiles.openfreemap.org/styles/liberty'
    )
    expect(typeof map?.options.transformStyle).toBe('function')
    map?.emit('load')
    const draw = terraDrawMock.instances[0]
    // terra-draw pose ses couches sous le préfixe de l'application.
    const adapter = draw?.options.adapter as unknown as {
      options: { prefixId: string }
    }
    expect(adapter.options.prefixId).toBe('apart-draw')
    expect(layerIds(map)).toContain('apart-draw-polygon')

    const switcher = wrapper.get('[data-testid="base-map-switcher"]')
    await switcher.get('[data-base-map="ign-photo"]').trigger('click')
    expect(map?.styleCalls).toHaveLength(1)
    expect(map?.styleCalls[0]?.style).toBe(IGN_TOPONYMS_STYLE_URL)
    // Le nouveau fond dessous ; la photo, le périmètre et le dessin dessus.
    expect(layerIds(map)).toEqual([
      'ign-orthophotos',
      'base-background',
      'criteria-editor-perimeter-criteria-fill',
      'criteria-editor-perimeter-criteria-halo',
      'criteria-editor-perimeter-criteria-line',
      'apart-draw-polygon',
    ])
    expect(
      (
        map?.sources.get('criteria-editor-perimeter')?.data as {
          features: unknown[]
        }
      ).features
    ).toHaveLength(1)
    // terra-draw n'a pas été arrêté ni recréé : le dessin continue.
    expect(terraDrawMock.instances).toHaveLength(1)
    expect(draw?.stopped).toBe(false)
    expect(draw?.features.size).toBe(1)
    draw?.finish(
      { geometry: SQUARE, properties: { mode: 'polygon' } },
      'drawn-3'
    )
    expect(wrapper.emitted('drawn')?.at(-1)).toEqual([
      { type: 'polygon', polygon: SQUARE },
    ])
    // Le périmètre suivant s'affiche dans la source recopiée.
    await wrapper.setProps({ perimeter: null })
    expect(
      (
        map?.sources.get('criteria-editor-perimeter')?.data as {
          features: unknown[]
        }
      ).features
    ).toHaveLength(0)
    // Le choix est partagé et retenu.
    expect(useBaseMapStore().current).toBe('ign-photo')
    await switcher.get('[data-base-map="ign-plan"]').trigger('click')
    expect(map?.styleCalls[1]?.style).toBe(IGN_PLAN_STYLE_URL)
    expect(layerIds(map)).not.toContain('ign-orthophotos')
    expect(layerIds(map).at(-1)).toBe('apart-draw-polygon')
    wrapper.unmount()
  })

  it('s’ouvre cadrée sur le périmètre existant, sinon sur Bordeaux pour dessiner', async () => {
    const framed = mountMap({
      perimeter: { type: 'polygon', polygon: SQUARE },
      drawMode: null,
    })
    await nextTick()
    expect(mapLibreMock.maps[0]?.options.bounds).toEqual([
      [-0.6, 44.8],
      [-0.58, 44.82],
    ])
    expect(mapLibreMock.maps[0]?.options.fitBoundsOptions).toMatchObject({
      padding: 40,
    })
    framed.unmount()

    const drawing = mountMap({ perimeter: null, drawMode: 'circle' })
    await nextTick()
    expect(mapLibreMock.maps[1]?.options.center).toEqual(DRAW_MAP_CENTER)
    expect(mapLibreMock.maps[1]?.options.zoom).toBe(DRAW_MAP_ZOOM)
    drawing.unmount()

    const overview = mountMap({ perimeter: null, drawMode: null })
    await nextTick()
    expect(mapLibreMock.maps[2]?.options.zoom).toBe(11.5)
    overview.unmount()
  })

  it('entrer en dessin depuis la vue de la métropole rapproche la carte, une seule fois', async () => {
    const wrapper = mountMap({ perimeter: null, drawMode: null })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('load')
    await wrapper.setProps({ drawMode: 'polygon' })
    expect(map?.camera).toEqual([
      {
        kind: 'easeTo',
        args: [{ center: DRAW_MAP_CENTER, zoom: DRAW_MAP_ZOOM }],
      },
    ])
    // Déjà assez près : passer au cercle ne bouge pas la carte.
    await wrapper.setProps({ drawMode: 'circle' })
    expect(map?.camera).toHaveLength(1)
    // Sortir du dessin ne bouge rien non plus.
    if (map) map.zoom = 11
    await wrapper.setProps({ drawMode: null })
    expect(map?.camera).toHaveLength(1)
    // Avec un périmètre et une vue large : cadrage sur le périmètre.
    await wrapper.setProps({ perimeter: { type: 'polygon', polygon: SQUARE } })
    await wrapper.setProps({ drawMode: 'pick' })
    expect(map?.camera.at(-1)).toEqual({
      kind: 'fitBounds',
      args: [
        [
          [-0.6, 44.8],
          [-0.58, 44.82],
        ],
        { padding: 40, maxZoom: 16 },
      ],
    })
    wrapper.unmount()
  })

  it('une isochrone calculée recadre la carte ; le même calcul ne la bouge plus', async () => {
    const wrapper = mountMap({ perimeter: null, drawMode: 'pick' })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('load')
    await wrapper.setProps({ perimeter: ISOCHRONE })
    expect(map?.camera.map(c => c.kind)).toEqual(['fitBounds'])
    await wrapper.setProps({ perimeter: { ...ISOCHRONE } })
    expect(map?.camera).toHaveLength(1)
    await wrapper.setProps({
      perimeter: {
        type: 'isochrone',
        polygon: SQUARE,
        params: { ...ISOCHRONE_PARAMS, durationMinutes: 20 },
      },
    })
    expect(map?.camera).toHaveLength(2)
    // Un polygone dessiné ne recadre pas : on vient de le tracer à l'écran.
    await wrapper.setProps({ perimeter: { type: 'polygon', polygon: SQUARE } })
    expect(map?.camera).toHaveLength(2)
    wrapper.unmount()
  })

  it('une adresse cherchée par l’API recentre la carte et y pose un repère', async () => {
    apiMock.opendata.geocode
      .mockResolvedValueOnce({
        query: '1 place Fictive',
        status: 'found',
        result: {
          point: { type: 'Point', coordinates: [-0.57, 44.84] },
          label: '1 Place Fictive 33000 Bordeaux',
          precision: 'exact',
          commune: 'Bordeaux',
        },
      })
      .mockResolvedValueOnce({
        query: 'Talence',
        status: 'found',
        result: {
          point: { type: 'Point', coordinates: [-0.59, 44.81] },
          label: 'Talence',
          precision: 'commune',
          commune: 'Talence',
        },
      })
    const wrapper = mountMap({ perimeter: null, drawMode: 'polygon' })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('load')
    const input = wrapper.get('[data-testid="map-address"]')
    await input.setValue('1 place Fictive')
    await wrapper.get('[data-testid="map-address-go"]').trigger('click')
    await flushPromises()
    expect(map?.camera.at(-1)).toEqual({
      kind: 'flyTo',
      args: [{ center: [-0.57, 44.84], zoom: ADDRESS_ZOOM }],
    })
    const marker = mapLibreMock.markers.at(-1)
    expect(marker?.lngLat).toEqual([-0.57, 44.84])
    expect(marker?.options.element.getAttribute('aria-label')).toBe(
      'Adresse trouvée : 1 Place Fictive 33000 Bordeaux'
    )
    await input.setValue('Talence')
    await wrapper.get('[data-testid="map-address-go"]').trigger('click')
    await flushPromises()
    expect(map?.camera.at(-1)?.args[0]).toMatchObject({ zoom: COMMUNE_ZOOM })
    // Un seul repère à la fois.
    expect(marker?.removed).toBe(true)
    expect(mapLibreMock.markers).toHaveLength(2)
    wrapper.unmount()
    expect(mapLibreMock.markers[1]?.removed).toBe(true)
  })
})
