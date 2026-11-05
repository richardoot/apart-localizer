import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { LayerFeatureCollection, ListingPlacement } from '@apart/contracts'
import { fakeEvaluated, fakeListing } from '@/test/fixtures'
import { mapLibreMock } from '@/test/setup'
import { IGN_PLAN_STYLE_URL, OVERLAY_METADATA_KEY } from '@/lib/base-maps'
import { LISTING_AREA_SOURCE } from '@/lib/map-layers'
import { filtersFromQuery, queryFromFilters } from '@/stores/filters'
import { useFiltersStore } from '@/stores/filters'
import FiltersBar from './FiltersBar.vue'
import ListingsMap from './ListingsMap.vue'
import PrecisionBadge from './PrecisionBadge.vue'

/**
 * Lot 12 : distinguer les annonces exactement localisées des génériques —
 * pastille, repères de la carte et leur légende, contour du quartier au
 * survol et à la sélection (qui suit un changement de fond), filtre de la
 * liste dans l'URL. Données fictives.
 */
const AT = '2026-11-05T10:00:00.000Z'
const DISTRICT: ListingPlacement = {
  method: 'neighbourhood_match',
  precision: 'district',
  matchedText: 'Secteur fictif',
  area: {
    level: 'sector',
    name: 'Secteur fictif',
    codes: ['S1'],
    commune: 'Talence',
    inseeCode: '33522',
    source: 'Secteurs fictifs',
    areaSquareMeters: 1_000_000,
  },
  toVerify: false,
  reasons: ['Secteur « Secteur fictif » reconnu dans « Secteur fictif ».'],
  computedAt: AT,
}

const base = fakeListing().location
const exact = fakeEvaluated({ id: '11111111-1111-4111-8111-111111111111' })
const district = fakeEvaluated({
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Au quartier',
  location: { ...base, precision: 'district', placement: DISTRICT },
})
const commune = fakeEvaluated({
  id: '33333333-3333-4333-8333-333333333333',
  title: 'À la commune',
  location: { ...base, precision: 'commune', placement: null },
})

const AREAS: LayerFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: district.listing.id,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-0.6, 44.8],
            [-0.59, 44.8],
            [-0.59, 44.81],
            [-0.6, 44.8],
          ],
        ],
      },
      properties: {
        listingId: district.listing.id,
        name: 'Secteur fictif',
        level: 'sector',
      },
    },
  ],
}

describe('pastille de précision', () => {
  it('dit d’où vient le repère, avec l’explication en infobulle', () => {
    const exactBadge = mount(PrecisionBadge, {
      props: { location: exact.listing.location },
    })
    expect(exactBadge.text()).toBe('Adresse exacte')
    expect(exactBadge.attributes('data-precision')).toBe('exact')
    expect(exactBadge.attributes('title')).toContain('au numéro')
    const districtBadge = mount(PrecisionBadge, {
      props: { location: district.listing.location },
    })
    expect(districtBadge.text()).toBe('Au quartier (Secteur fictif)')
    expect(districtBadge.attributes('title')).toContain(
      'repère au centre du secteur « Secteur fictif »'
    )
    const compact = mount(PrecisionBadge, {
      props: { location: district.listing.location, compact: true },
    })
    expect(compact.text()).toBe('Au quartier')
    expect(
      mount(PrecisionBadge, {
        props: { location: commune.listing.location },
      }).text()
    ).toBe('Commune seulement')
    expect(
      mount(PrecisionBadge, {
        props: { location: { ...base, point: null, precision: null } },
      }).attributes('data-precision')
    ).toBe('none')
  })
})

describe('carte des annonces : repères selon la précision', () => {
  beforeEach(() => {
    mapLibreMock.reset()
  })

  it('plein à l’adresse, creux au quartier, pâle à la commune ; légende', async () => {
    const wrapper = mount(ListingsMap, {
      props: {
        items: [exact, district, commune],
        near: undefined,
        colorBy: 'verdict',
      },
      attachTo: document.body,
    })
    await nextTick()
    const [a, b, c] = mapLibreMock.markers.map(m => m.options.element)
    expect(a?.dataset.precision).toBe('exact')
    expect(a?.className).toContain('border-white')
    expect(b?.dataset.precision).toBe('district')
    expect(b?.style.background).toBe('transparent')
    expect(b?.className).toContain('border-[3px]')
    expect(c?.dataset.precision).toBe('commune')
    expect(c?.className).toContain('border-dashed')
    expect(b?.getAttribute('aria-label')).toBe(
      'Au quartier — Au quartier (Secteur fictif)'
    )
    const legend = wrapper.get('[data-testid="precision-legend"]').text()
    expect(legend).toContain('à l’adresse (1)')
    expect(legend).toContain('au quartier (1, contour au survol)')
    expect(legend).toContain('commune seulement (1)')
    expect(mapLibreMock.markers[1]?.popup?.html).toContain(
      'Repère : Au quartier (Secteur fictif)'
    )
    wrapper.unmount()
  })

  it('le contour du quartier au survol et tant que la fenêtre est ouverte ; il suit le changement de fond', async () => {
    const wrapper = mount(ListingsMap, {
      props: {
        items: [exact, district],
        near: undefined,
        colorBy: 'verdict',
        areas: AREAS,
      },
      attachTo: document.body,
    })
    await nextTick()
    const map = mapLibreMock.maps[0]
    map?.emit('load')
    const shown = () =>
      (
        map?.sources.get(LISTING_AREA_SOURCE)?.data as {
          features: unknown[]
        }
      ).features.length
    expect(shown()).toBe(0)
    const marker = mapLibreMock.markers[1]
    marker?.options.element.dispatchEvent(new Event('mouseenter'))
    expect(shown()).toBe(1)
    marker?.options.element.dispatchEvent(new Event('mouseleave'))
    expect(shown()).toBe(0)
    // Un repère à l'adresse n'a pas de contour.
    mapLibreMock.markers[0]?.options.element.dispatchEvent(
      new Event('mouseenter')
    )
    expect(shown()).toBe(0)
    // Sélection : la fenêtre ouverte garde le contour, sa fermeture l'ôte.
    marker?.popup?.open()
    expect(shown()).toBe(1)
    const layer = (map?.layers ?? []).find(
      l => (l as { id: string }).id === 'listing-area-line'
    ) as { metadata: Record<string, boolean> }
    expect(layer.metadata).toEqual({ [OVERLAY_METADATA_KEY]: true })
    await wrapper
      .get('[data-testid="base-map-switcher"] [data-base-map="ign-plan"]')
      .trigger('click')
    expect(map?.styleCalls.map(s => s.style)).toEqual([IGN_PLAN_STYLE_URL])
    expect(shown()).toBe(1)
    for (const listener of marker?.popup?.listeners.get('close') ?? []) {
      listener()
    }
    expect(shown()).toBe(0)
    // Repères recréés (liste filtrée) : un contour montré disparaît avec eux.
    mapLibreMock.markers
      .at(-1)
      ?.options.element.dispatchEvent(new Event('focus'))
    expect(shown()).toBe(1)
    await wrapper.setProps({ items: [district] })
    expect(shown()).toBe(0)
    wrapper.unmount()
  })
})

describe('filtre par précision', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('lit et écrit `precision` dans l’URL', () => {
    const filters = filtersFromQuery({ precision: 'district,commune' })
    expect(filters.precision).toEqual(['district', 'commune'])
    expect(queryFromFilters(filters, 'map')).toMatchObject({
      precision: 'district,commune',
      view: 'map',
    })
    expect(
      filtersFromQuery({ precision: 'inconnue' }).precision
    ).toBeUndefined()
  })

  it('les boutons ajoutent et retirent une précision ; le compteur la compte', async () => {
    const wrapper = mount(FiltersBar, { props: { communes: [] } })
    const store = useFiltersStore()
    await wrapper.get('[data-precision="district"]').trigger('click')
    await wrapper.get('[data-precision="commune"]').trigger('click')
    expect(store.filters.precision).toEqual(['district', 'commune'])
    expect(store.activeCount).toBe(1)
    expect(
      wrapper.get('[data-precision="district"]').attributes('aria-pressed')
    ).toBe('true')
    await wrapper.get('[data-precision="district"]').trigger('click')
    await wrapper.get('[data-precision="commune"]').trigger('click')
    expect(store.filters.precision).toBeUndefined()
  })
})
