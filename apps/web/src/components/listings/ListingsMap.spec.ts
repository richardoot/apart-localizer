import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { fakeEvaluated } from '@/test/fixtures'
import { mapLibreMock } from '@/test/setup'
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
    expect(wrapper.text()).toContain('1 annonce(s) placée(s)')
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
    expect(map?.layers).toHaveLength(2)
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
})
