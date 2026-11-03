import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { mapLibreMock, terraDrawMock } from '@/test/setup'
import { SQUARE } from '@/test/criteria-fixtures'
import CriteriaMap from './CriteriaMap.vue'

describe('CriteriaMap (MapLibre et terra-draw mockés)', () => {
  beforeEach(() => {
    mapLibreMock.reset()
    terraDrawMock.reset()
  })

  it('dessine avec terra-draw une fois la carte chargée et rend le polygone', async () => {
    const wrapper = mount(CriteriaMap, {
      props: { perimeter: null, drawMode: 'polygon' },
      attachTo: document.body,
    })
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
    const wrapper = mount(CriteriaMap, {
      props: {
        perimeter: { type: 'polygon', polygon: SQUARE },
        drawMode: 'polygon',
      },
      attachTo: document.body,
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
    const wrapper = mount(CriteriaMap, {
      props: {
        perimeter: { type: 'polygon', polygon: SQUARE },
        drawMode: 'pick',
      },
      attachTo: document.body,
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
    expect((source?.data as { features: unknown[] }).features).toHaveLength(0)
    await wrapper.setProps({ drawMode: 'polygon' })
    map?.emit('click', { lngLat: { lng: 0, lat: 0 } })
    expect(wrapper.emitted('pick')).toHaveLength(1)
    wrapper.unmount()
  })
})
