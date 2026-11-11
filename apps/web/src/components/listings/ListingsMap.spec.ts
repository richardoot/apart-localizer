import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { fakeEvaluated } from '@/test/fixtures'
import { mapLibreMock } from '@/test/setup'
import { IGN_PLAN_STYLE_URL, OVERLAY_METADATA_KEY } from '@/lib/base-maps'
import { useBaseMapStore } from '@/stores/base-map'
import ListingsMap from './ListingsMap.vue'

const placed = fakeEvaluated(
  { id: '11111111-1111-4111-8111-111111111111', title: 'Placée' },
  { isNewForMe: true }
)
const blind = fakeEvaluated({
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Sans point',
  location: { ...fakeEvaluated().listing.location, point: null },
})

describe('ListingsMap (MapLibre mocké)', () => {
  beforeEach(() => {
    mapLibreMock.reset()
  })

  it('crée la carte sans clé, un marqueur par annonce placée, coloré par verdict', async () => {
    const wrapper = mount(ListingsMap, {
      props: { items: [placed, blind], near: undefined, colorBy: 'verdict' },
      attachTo: document.body,
    })
    await nextTick()
    expect(mapLibreMock.maps).toHaveLength(1)
    const map = mapLibreMock.maps[0]
    expect(String(map?.options.style)).toBe(
      'https://tiles.openfreemap.org/styles/liberty'
    )
    expect(map?.options.center).toEqual([-0.59, 44.82])
    expect(mapLibreMock.markers).toHaveLength(1)
    const marker = mapLibreMock.markers[0]
    expect(marker?.lngLat).toEqual([-0.5906, 44.8083])
    expect(marker?.options.element.style.background).toBe('var(--bad)')
    expect(marker?.options.element.classList.contains('ring-accent')).toBe(true)
    expect(wrapper.text()).toContain('1 annonce placée')
    wrapper.unmount()
    expect(map?.removed).toBe(true)
  })

  it('un clic sur la carte pose le point avec le rayon courant ; le curseur change le rayon', async () => {
    const wrapper = mount(ListingsMap, {
      props: { items: [placed], near: undefined, colorBy: 'verdict' },
      attachTo: document.body,
    })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('click', { lngLat: { lng: -0.5955123456, lat: 44.8077 } })
    expect(wrapper.emitted('update:near')?.[0]).toEqual([
      { longitude: -0.595512, latitude: 44.8077, radiusMeters: 800 },
    ])
    await wrapper.setProps({
      near: { longitude: -0.595512, latitude: 44.8077, radiusMeters: 800 },
    })
    const slider = wrapper.get('input[type="range"]')
    await slider.setValue('1')
    expect(wrapper.get('[data-testid="radius-label"]').text()).toBe('300 m')
    expect(wrapper.emitted('update:near')?.at(-1)).toEqual([
      { longitude: -0.595512, latitude: 44.8077, radiusMeters: 300 },
    ])
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:near')?.at(-1)).toEqual([undefined])
    wrapper.unmount()
  })

  it('dessine le rayon une fois la carte chargée et ouvre la fiche depuis la popup', async () => {
    const near = { longitude: -0.59, latitude: 44.8, radiusMeters: 500 }
    const wrapper = mount(ListingsMap, {
      props: { items: [placed], near, colorBy: 'status' },
      attachTo: document.body,
    })
    await nextTick()
    const map = mapLibreMock.maps[0]
    expect(map?.options.center).toEqual([-0.59, 44.8])
    map?.emit('load')
    const source = map?.sources.get('near-radius')
    expect(source).toBeDefined()
    const data = source?.data as { features: unknown[] }
    expect(data.features).toHaveLength(1)
    const radiusLayers = (map?.layers ?? []).filter(
      layer => (layer as { source: string }).source === 'near-radius'
    )
    // Remplissage, liseré clair (lisible sur la photo aérienne), contour.
    expect(radiusLayers).toHaveLength(3)
    await wrapper.setProps({ near: undefined })
    expect((source?.data as { features: unknown[] }).features).toHaveLength(0)

    const marker = mapLibreMock.markers[0]
    expect(marker?.options.element.style.background).toBe('var(--muted)')
    marker?.popup?.open()
    marker?.popup
      ?.getElement()
      .querySelector<HTMLButtonElement>('[data-open]')
      ?.click()
    expect(wrapper.emitted('open')).toEqual([[placed.listing.id]])
    wrapper.unmount()
  })

  it('couches de contexte : données posées si la couche est active, emprise rendue', async () => {
    const stops = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [-0.58, 44.84] as [number, number],
          },
          properties: { name: 'Arrêt fictif', lines: 'A', mode: 'tram' },
        },
      ],
    }
    const wrapper = mount(ListingsMap, {
      props: {
        items: [placed],
        near: undefined,
        colorBy: 'verdict',
        layers: {
          criteria: null,
          tram: stops,
          bus: null,
          dvf: null,
          rentZones: null,
        },
        toggles: {
          criteria: true,
          tram: false,
          bus: false,
          dvf: false,
          rentZones: false,
          athletics: false,
          drives: false,
          fitness: false,
          neighbourhoods: false,
        },
      },
      attachTo: document.body,
    })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('load')
    expect(wrapper.emitted('bounds')?.[0]).toEqual([[-0.7, 44.75, -0.5, 44.9]])
    const tram = map?.sources.get('tram-stops')
    expect((tram?.data as { features: unknown[] }).features).toHaveLength(0)
    await wrapper.get('input[data-layer="tram"]').setValue(true)
    expect(wrapper.emitted('update:toggles')?.[0]?.[0]).toMatchObject({
      tram: true,
    })
    await wrapper.setProps({
      toggles: {
        criteria: true,
        tram: true,
        bus: false,
        dvf: false,
        rentZones: false,
        athletics: false,
        drives: false,
        fitness: false,
        neighbourhoods: false,
      },
    })
    expect((tram?.data as { features: unknown[] }).features).toHaveLength(1)
    for (const id of [
      'rent-zones',
      'criteria-perimeters',
      'dvf-sales',
      'bus-stops',
    ]) {
      expect(map?.sources.get(id)).toBeDefined()
    }
    map?.emit('moveend')
    expect(wrapper.emitted('bounds')).toHaveLength(2)
    wrapper.unmount()
  })

  it('un clic sur une vente DVF ouvre sa fiche sans déplacer le point ; légende des zones', async () => {
    const wrapper = mount(ListingsMap, {
      props: {
        items: [placed],
        near: undefined,
        colorBy: 'verdict',
        toggles: {
          criteria: true,
          tram: false,
          bus: false,
          dvf: true,
          rentZones: true,
          athletics: false,
          drives: false,
          fitness: false,
          neighbourhoods: false,
        },
      },
      attachTo: document.body,
    })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('load')
    expect(wrapper.get('[data-testid="rent-zone-legend"]').text()).toContain(
      'Zones'
    )
    if (map) {
      map.rendered = [
        {
          layer: { id: 'dvf-sales-points' },
          properties: {
            date: '2024-06-12',
            price: 190000,
            surface: 44,
            pricePerM2: 4318,
            rooms: 2,
            address: '3 rue Fictive',
          },
        },
      ]
    }
    map?.emit('click', { lngLat: { lng: -0.58, lat: 44.84 }, point: [1, 1] })
    expect(wrapper.emitted('update:near')).toBeUndefined()
    const popup = mapLibreMock.popups.at(-1)
    expect(popup?.html).toContain('Vente DVF du 12 juin 2024')
    expect(popup?.html).toContain('3 rue Fictive')
    if (map) map.rendered = []
    map?.emit('click', { lngLat: { lng: -0.58, lat: 44.84 }, point: [1, 1] })
    expect(wrapper.emitted('update:near')).toHaveLength(1)
    wrapper.unmount()
  })

  it('changer de fond réaffiche couches de contexte et rayon, marqueurs gardés', async () => {
    const stops = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [-0.58, 44.84] as [number, number],
          },
          properties: { name: 'Arrêt fictif', lines: 'A', mode: 'tram' },
        },
      ],
    }
    const toggles = {
      criteria: true,
      tram: true,
      bus: false,
      dvf: false,
      rentZones: false,
      athletics: false,
      drives: false,
      fitness: false,
      neighbourhoods: false,
    }
    const wrapper = mount(ListingsMap, {
      props: {
        items: [placed],
        near: { longitude: -0.59, latitude: 44.8, radiusMeters: 500 },
        colorBy: 'verdict',
        layers: {
          criteria: null,
          tram: stops,
          bus: null,
          dvf: null,
          rentZones: null,
        },
        toggles,
      },
      attachTo: document.body,
    })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('load')
    // Chaque couche posée est marquée comme couche de l'application.
    for (const layer of map?.layers ?? [])
      expect((layer as { metadata: Record<string, boolean> }).metadata).toEqual(
        { [OVERLAY_METADATA_KEY]: true }
      )
    const overlayIds = (map?.layers ?? []).map(l => (l as { id: string }).id)

    await wrapper
      .get('[data-testid="base-map-switcher"] [data-base-map="ign-plan"]')
      .trigger('click')
    expect(map?.styleCalls.map(c => c.style)).toEqual([IGN_PLAN_STYLE_URL])
    const ids = (map?.layers ?? []).map(l => (l as { id: string }).id)
    expect(ids[0]).toBe('base-background')
    expect(ids.slice(1)).toEqual(overlayIds)
    expect(
      (map?.sources.get('tram-stops')?.data as { features: unknown[] }).features
    ).toHaveLength(1)
    expect(
      (map?.sources.get('near-radius')?.data as { features: unknown[] })
        .features
    ).toHaveLength(1)
    // Les marqueurs sont du DOM : ils restent, rien n'est recréé.
    expect(mapLibreMock.markers).toHaveLength(1)
    expect(mapLibreMock.markers[0]?.removed).toBe(false)
    // Après le changement, éteindre une couche agit sur la source recopiée.
    await wrapper.setProps({ toggles: { ...toggles, tram: false } })
    expect(
      (map?.sources.get('tram-stops')?.data as { features: unknown[] }).features
    ).toHaveLength(0)
    // Une seconde carte ouverte ensuite part du même fond.
    expect(useBaseMapStore().current).toBe('ign-plan')
    const other = mount(ListingsMap, {
      props: { items: [], near: undefined, colorBy: 'verdict' },
      attachTo: document.body,
    })
    await nextTick()
    expect(mapLibreMock.maps[1]?.options.style).toBe(IGN_PLAN_STYLE_URL)
    other.unmount()
    wrapper.unmount()
  })

  it('lot 11 : pistes, drives, Fitness Park et quartiers ; légende, fenêtres, survol', async () => {
    const pointAt = (
      properties: Record<string, string | number | boolean | null>
    ) => ({
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [-0.58, 44.84] as [number, number],
          },
          properties,
        },
      ],
    })
    const area = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              [
                [-0.6, 44.8],
                [-0.5, 44.8],
                [-0.5, 44.9],
                [-0.6, 44.8],
              ] as [number, number][],
            ],
          },
          properties: {
            name: 'Secteur fictif',
            code: 'S1',
            kind: 'quartier',
            parent: 'Quartier parent fictif',
            commune: 'Bordeaux',
            source: 'Source fictive',
            partial: false,
          },
        },
      ],
    }
    const off = {
      criteria: true,
      tram: false,
      bus: false,
      dvf: false,
      rentZones: false,
      athletics: false,
      drives: false,
      fitness: false,
      neighbourhoods: false,
    }
    const layers = {
      criteria: null,
      tram: null,
      bus: null,
      dvf: null,
      rentZones: null,
      athletics: pointAt({ kind: 'athletics_track', name: 'Stade fictif' }),
      drives: pointAt({
        kind: 'supermarket_drive',
        name: 'Drive fictif',
        brandGroup: 'other',
        drive: 'to_verify',
      }),
      fitness: pointAt({ kind: 'fitness_park', name: 'Fitness Park fictif' }),
      neighbourhoods: area,
    }
    const wrapper = mount(ListingsMap, {
      props: {
        items: [placed],
        near: undefined,
        colorBy: 'verdict',
        layers,
        toggles: off,
      },
      attachTo: document.body,
    })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('load')
    const data = (id: string) =>
      (map?.sources.get(id)?.data as { features: unknown[] }).features
    for (const id of ['athletics', 'drives', 'fitness', 'neighbourhoods'])
      expect(data(id)).toHaveLength(0)
    expect(wrapper.find('[data-testid="surroundings-legend"]').exists()).toBe(
      false
    )
    await wrapper.get('input[data-layer="drives"]').setValue(true)
    expect(wrapper.emitted('update:toggles')?.[0]?.[0]).toMatchObject({
      drives: true,
    })
    await wrapper.setProps({
      toggles: {
        ...off,
        athletics: true,
        drives: true,
        fitness: true,
        neighbourhoods: true,
      },
    })
    for (const id of ['athletics', 'drives', 'fitness', 'neighbourhoods'])
      expect(data(id)).toHaveLength(1)
    // Les drives : deux couches d'une source, les enseignes préférées à part.
    const ids = (map?.layers ?? []).map(l => (l as { id: string }).id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'drives-other-points',
        'drives-preferred-points',
        'neighbourhoods-line',
        'neighbourhood-hover-line',
      ])
    )
    // Les contours passent sous les points.
    expect(ids.indexOf('neighbourhoods-line')).toBeLessThan(
      ids.indexOf('tram-stops-points')
    )
    const legend = wrapper.get('[data-testid="surroundings-legend"]').text()
    expect(legend).toContain('drive Carrefour, Auchan, Intermarché')
    expect(legend).toContain('autre enseigne')
    expect(legend).toContain('Fitness Park')
    expect(legend).toContain('quartiers')

    // Un clic sur un drive ouvre sa fenêtre sans déplacer le point.
    if (map) {
      map.rendered = [
        {
          layer: { id: 'drives-other-points' },
          properties: layers.drives.features[0]?.properties,
        },
      ]
    }
    map?.emit('click', { lngLat: { lng: -0.58, lat: 44.84 }, point: [1, 1] })
    expect(wrapper.emitted('update:near')).toBeUndefined()
    expect(mapLibreMock.popups.at(-1)?.html).toContain('Drive à vérifier')
    // Un clic sur un quartier : son nom, et le point du filtre comme avant.
    if (map) {
      map.rendered = [
        {
          layer: { id: 'neighbourhoods-fill' },
          properties: area.features[0]?.properties,
        },
      ]
    }
    map?.emit('click', { lngLat: { lng: -0.58, lat: 44.84 }, point: [1, 1] })
    expect(mapLibreMock.popups.at(-1)?.html).toContain(
      'Quartier Quartier parent fictif'
    )
    expect(wrapper.emitted('update:near')).toHaveLength(1)

    // Survol : le nom près du pointeur ; couche éteinte, plus rien.
    map?.emit('mousemove:neighbourhoods-fill', {
      point: { x: 5, y: 6 },
      features: [{ properties: { code: 'S1' } }],
    })
    await nextTick()
    expect(wrapper.get('[data-testid="neighbourhood-hover"]').text()).toBe(
      'Secteur fictif (Bordeaux)'
    )
    map?.emit('mousemove:neighbourhoods-fill', {
      point: { x: 5, y: 6 },
      features: [{ properties: { code: 'inconnu' } }],
    })
    await nextTick()
    expect(wrapper.find('[data-testid="neighbourhood-hover"]').exists()).toBe(
      false
    )
    await wrapper.setProps({ toggles: off })
    expect(data('neighbourhoods')).toHaveLength(0)
    wrapper.unmount()
  })
})
