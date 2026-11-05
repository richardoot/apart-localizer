import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import {
  fakeAmenity,
  fakeContext,
  fakeSurroundings,
} from '@/test/criteria-fixtures'
import { fakeEvaluated } from '@/test/fixtures'
import { mapLibreMock } from '@/test/setup'

const apiMock = vi.hoisted(() => ({
  listings: {
    context: vi.fn(),
    searchDpe: vi.fn(),
    verifyDpe: vi.fn(),
    regeocode: vi.fn(),
    areas: vi.fn(() =>
      Promise.resolve({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
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
              listingId: '11111111-1111-4111-8111-111111111111',
              name: 'Secteur fictif',
              level: 'sector',
            },
          },
        ],
      })
    ),
  },
  opendata: {
    amenities: vi.fn(() =>
      Promise.resolve({ type: 'FeatureCollection', features: [] })
    ),
    neighbourhoods: vi.fn(() =>
      Promise.resolve({ type: 'FeatureCollection', features: [] })
    ),
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
        transit: {
          nearestTram: null,
          nearestStop: null,
          approximate: false,
          reasons: [],
        },
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

  it('lot 11 : quartier, piste, drives par enseigne, Fitness Park non disponible', async () => {
    const wrapper = mountSection()
    await flushPromises()
    const n = wrapper.get('[data-testid="surroundings-neighbourhood"]').text()
    expect(n).toContain('Quartier fictif')
    expect(n).toContain('quartier Grand quartier fictif, Bordeaux')
    expect(n).toContain('Source du contour : Source fictive des quartiers')
    const track = wrapper.get('[data-testid="surroundings-track"]').text()
    expect(track).toMatch(/Stade fictif\s+à 1,3\s?km/)
    expect(track).toContain(
      'découverte · 400 m · 6 couloirs · Clubs, Scolaires'
    )
    const drives = wrapper.get('[data-testid="surroundings-drives"]')
    expect(drives.get('[data-brand="carrefour"]').text()).toMatch(
      /Carrefour Drive fictif à 1,8\s?km/
    )
    expect(drives.get('[data-brand="auchan"]').text()).toContain(
      'aucun drive à moins de 20 km'
    )
    expect(drives.get('[data-brand="intermarche"]').text()).toContain(
      'Drive à vérifier'
    )
    expect(drives.get('[data-brand="any"]').text()).toContain(
      'Drive fictif à 900 m'
    )
    expect(wrapper.get('[data-testid="surroundings-fitness"]').text()).toBe(
      'Fitness Park : non disponible'
    )
    expect(wrapper.text()).toContain('Distances à vol d’oiseau')
    wrapper.unmount()
  })

  it('lot 11 : sources non importées, sans point', async () => {
    const missing = {
      status: 'not_applicable' as const,
      nearest: null,
      approximate: false,
      reasons: ['Annonce sans point : saisissez une adresse ou une commune.'],
    }
    apiMock.listings.context.mockResolvedValueOnce(
      fakeContext({
        point: null,
        surroundings: fakeSurroundings({
          neighbourhood: {
            status: 'unavailable',
            value: null,
            reasons: ['Contours des quartiers non importés : non disponible.'],
          },
          athleticsTrack: missing,
          supermarkets: {
            ...missing,
            preferred: { carrefour: null, auchan: null, intermarche: null },
          },
          fitnessPark: {
            status: 'ok',
            nearest: fakeAmenity({
              kind: 'fitness_park',
              name: 'Fitness Park fictif',
              address: '9 avenue Fictive',
            }),
            approximate: false,
            reasons: [],
          },
        }),
      })
    )
    const wrapper = mountSection()
    await flushPromises()
    expect(
      wrapper.get('[data-testid="surroundings-neighbourhood"]').text()
    ).toBe('Quartier : non disponible')
    expect(wrapper.get('[data-testid="surroundings-track"]').text()).toContain(
      'Annonce sans point'
    )
    expect(wrapper.get('[data-testid="surroundings-drives"]').text()).toContain(
      'Annonce sans point'
    )
    expect(
      wrapper.get('[data-testid="surroundings-fitness"]').text()
    ).toContain('9 avenue Fictive')
    wrapper.unmount()
  })

  it('lot 12 : repère au quartier — pastille, explication, distances « ≈ », contour retenu, « Préciser l’adresse »', async () => {
    const surroundings = fakeSurroundings()
    apiMock.listings.context.mockResolvedValueOnce(
      fakeContext({
        precision: 'district',
        placement: {
          method: 'neighbourhood_match',
          precision: 'district',
          matchedText: 'Secteur fictif',
          area: {
            level: 'sector',
            name: 'Secteur fictif',
            codes: ['S1'],
            commune: 'Bordeaux',
            inseeCode: '33063',
            source: 'Secteurs fictifs',
            areaSquareMeters: 1_000_000,
          },
          toVerify: false,
          reasons: [
            'Secteur « Secteur fictif » reconnu dans « Secteur fictif ».',
          ],
          computedAt: '2026-11-05T10:00:00.000Z',
        },
        approximation: {
          approximate: true,
          origin: 'centre du secteur « Secteur fictif »',
          note: 'Repère approché.',
        },
        transit: {
          ...fakeContext().transit,
          approximate: true,
          reasons: ['Desserte mesurée depuis le centre du secteur (fictif).'],
        },
        surroundings: {
          ...surroundings,
          athleticsTrack: { ...surroundings.athleticsTrack, approximate: true },
          supermarkets: { ...surroundings.supermarkets, approximate: true },
        },
      })
    )
    const wrapper = mountSection()
    await flushPromises()
    const placement = wrapper.get('[data-testid="placement"]')
    expect(placement.text()).toContain('Au quartier (Secteur fictif)')
    expect(placement.text()).toContain(
      'repère au centre du secteur « Secteur fictif »'
    )
    expect(wrapper.get('[data-testid="placement-reasons"]').text()).toContain(
      'reconnu dans'
    )
    expect(wrapper.get('[data-testid="transit"]').text()).toContain('à ≈ 240 m')
    expect(wrapper.get('[data-testid="transit"]').text()).toContain(
      'Desserte mesurée'
    )
    expect(wrapper.get('[data-testid="surroundings"]').text()).toContain(
      '≈ depuis le centre du secteur « Secteur fictif »'
    )
    expect(wrapper.get('[data-testid="surroundings-track"]').text()).toContain(
      'à ≈ 1,3 km'
    )
    expect(wrapper.get('[data-testid="surroundings-drives"]').text()).toContain(
      '≈ 1,8 km'
    )
    await wrapper.get('[data-action="precise-address"]').trigger('click')
    expect(wrapper.emitted('precise')).toHaveLength(1)
    await flushPromises()
    expect(apiMock.listings.areas).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="retained-area-legend"]').exists()).toBe(
      true
    )
    wrapper.unmount()
  })

  it('lot 12 : repère à l’adresse : pas de « ≈ », pas de bouton', async () => {
    const wrapper = mountSection()
    await flushPromises()
    expect(wrapper.get('[data-testid="placement"]').text()).toContain(
      'Adresse exacte'
    )
    expect(wrapper.find('[data-action="precise-address"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="transit"]').text()).not.toContain('≈')
    wrapper.unmount()
  })
})
