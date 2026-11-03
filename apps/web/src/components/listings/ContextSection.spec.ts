import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { fakeContext } from '@/test/criteria-fixtures'
import { fakeEvaluated } from '@/test/fixtures'
import { mapLibreMock } from '@/test/setup'

const apiMock = vi.hoisted(() => ({
  listings: {
    context: vi.fn(),
    searchDpe: vi.fn(),
    verifyDpe: vi.fn(),
    regeocode: vi.fn(),
  },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import ContextSection from './ContextSection.vue'

const LISTING_ID = '11111111-1111-4111-8111-111111111111'

function mountSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(ContextSection, {
    props: { listingId: LISTING_ID, updatedAt: '2026-11-03T10:00:00.000Z' },
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
}

describe('ContextSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mapLibreMock.reset()
    apiMock.listings.context.mockResolvedValue(fakeContext())
    apiMock.listings.verifyDpe.mockResolvedValue(fakeEvaluated())
    apiMock.listings.searchDpe.mockResolvedValue(fakeContext())
    apiMock.listings.regeocode.mockResolvedValue(fakeEvaluated())
  })

  it('tram, DPE à valider, plafond, comparables datés et carte miniature', async () => {
    const wrapper = mountSection()
    await flushPromises()
    expect(apiMock.listings.context).toHaveBeenCalledWith(LISTING_ID)
    const transit = wrapper.get('[data-testid="transit"]').text()
    expect(transit).toContain('Arrêt fictif')
    expect(transit).toContain('ligne A, C')
    expect(transit).toContain('240 m')
    expect(transit).toContain('Bus fictif')
    const dpe = wrapper.get('[data-testid="dpe"]').text()
    expect(dpe).toContain('non vérifié')
    expect(dpe).toContain('2633E0000001X')
    expect(dpe).toContain('ressemblance 85 %')
    const rent = wrapper.get('[data-testid="rent-control"]').text()
    expect(rent).toContain('Calculé')
    expect(rent).toContain('17,5 €/m²')
    expect(rent).toContain('zone 2')
    const market = wrapper.get('[data-testid="market"]').text()
    expect(market).toContain('sur 6 vente(s)')
    expect(market).toContain('12 juin 2024')
    expect(market).toContain("jusqu'en 2024")
    expect(mapLibreMock.maps).toHaveLength(1)
    mapLibreMock.maps[0]?.emit('load')
    expect(
      mapLibreMock.maps[0]?.sources.get('context-comparables')
    ).toBeDefined()
    wrapper.unmount()
  })

  it('retenir un DPE (garde-fou), relancer la recherche et le géocodage', async () => {
    const wrapper = mountSection()
    await flushPromises()
    const retain = wrapper.findAll('button').find(b => b.text() === 'Retenir')
    await retain?.trigger('click')
    await flushPromises()
    expect(apiMock.listings.verifyDpe).toHaveBeenCalledWith(LISTING_ID, {
      number: '2633E0000001X',
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
    })
    await wrapper.get('[data-action="search-dpe"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-action="regeocode"]').trigger('click')
    await flushPromises()
    expect(apiMock.listings.searchDpe).toHaveBeenCalledWith(LISTING_ID)
    expect(apiMock.listings.regeocode).toHaveBeenCalledWith(LISTING_ID)
    wrapper.unmount()
  })

  it('sans point : invitation à saisir l’adresse, pas de carte ; erreur affichée', async () => {
    apiMock.listings.context.mockResolvedValueOnce(
      fakeContext({
        point: null,
        transit: { nearestTram: null, nearestStop: null },
        market: {
          ...fakeContext().market,
          stats: null,
          comparables: [],
          status: 'to_verify',
        },
      })
    )
    const wrapper = mountSection()
    await flushPromises()
    expect(wrapper.text()).toContain('Adresse non localisée')
    expect(wrapper.text()).toContain('Aucun arrêt de tram')
    expect(mapLibreMock.maps).toHaveLength(0)
    apiMock.listings.verifyDpe.mockRejectedValueOnce(new Error('x'))
    wrapper.unmount()
  })
})
