import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { fakeContext } from '@/test/criteria-fixtures'
import { mapLibreMock } from '@/test/setup'
import ContextMap from './ContextMap.vue'

const features = (id: string) =>
  (
    mapLibreMock.maps[0]?.sources.get(id)?.data as {
      features: Array<{ properties: { label: string } }>
    }
  ).features

describe('ContextMap (MapLibre mocké)', () => {
  beforeEach(() => {
    mapLibreMock.reset()
  })

  it('annonce, tram le plus proche et ventes comparables datées', async () => {
    const wrapper = mount(ContextMap, {
      props: { context: fakeContext() },
      attachTo: document.body,
    })
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
        transit: { nearestTram: null, nearestStop: null },
      }),
    })
    expect(features('context-tram')).toHaveLength(0)
    wrapper.unmount()
    expect(map?.removed).toBe(true)
  })

  it('suit le point : rien sans point, créée quand il arrive, recentrée, retirée', async () => {
    const wrapper = mount(ContextMap, {
      props: { context: fakeContext({ point: null }) },
      attachTo: document.body,
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
})
