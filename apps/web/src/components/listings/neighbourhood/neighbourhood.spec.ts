/**
 * Lot 19, onglet « Quartier : comment on y vit ? » : six tuiles lisibles
 * d'un coup d'œil, la tuile choisie détaille sa donnée (desserte, courses,
 * sport, quartier, risques, repère), « Préciser l'adresse », la carte et
 * les sources repliées. Une donnée absente se dit « à vérifier ». Contexte
 * fictif ; MapLibre mocké ; aucun appel réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { DEFAULT_REGULATORY_RULES } from '@apart/contracts'
import type { ListingContext } from '@apart/contracts'
import { complianceReport } from '@apart/domain'
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
    regeocode: vi.fn(),
    areas: vi.fn(() =>
      Promise.resolve({ type: 'FeatureCollection', features: [] })
    ),
  },
  study: { compliance: vi.fn() },
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

import NeighbourhoodTab from '../tabs/NeighbourhoodTab.vue'

enableAutoUnmount(afterEach)

const item = fakeEvaluated()
/** Les espaces fines insécables de fr-FR, en espaces simples. */
const n = (text: string): string => text.replace(/[\u202f\u00a0]/g, ' ')

function compliance(georisques: 'ok' | 'none' = 'ok') {
  return complianceReport(
    {
      dpeClass: 'D',
      dpeDate: '2023-01-01',
      constructionYear: 1975,
      leaseType: 'unfurnished',
      inseeCode: '33063',
      commune: 'Bordeaux',
      surface: 45,
      rentControlled: false,
      targetRent: 750,
      rentCap: null,
      heatingType: null,
      coOwnershipAllowsRental: 'unknown',
      decencyCompliant: 'unknown',
      rentalPermitRequired: 'unknown',
    },
    DEFAULT_REGULATORY_RULES,
    georisques === 'ok'
      ? {
          status: 'ok',
          point: { type: 'Point', coordinates: [-0.58, 44.84] },
          address: '1 rue Fictive 33000 Bordeaux',
          commune: 'Bordeaux',
          inseeCode: '33063',
          reportUrl: 'https://exemple.invalid/rapport',
          hazards: [
            {
              key: 'retraitGonflementArgile',
              label: 'Retrait-gonflement des argiles',
              family: 'natural',
              present: true,
              communeStatus: 'Existant',
              addressStatus: 'Exposition moyenne',
              level: 'warn',
            },
          ],
          fetchedAt: '2026-11-03T10:00:00.000Z',
          message: null,
        }
      : null,
    { rentalStartDate: '2028-01-01', at: new Date('2026-11-03T10:00:00Z') }
  )
}

function mountTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(NeighbourhoodTab, {
    props: { item },
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
}

function districtContext(): ListingContext {
  const surroundings = fakeSurroundings()
  return fakeContext({
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
      reasons: ['Secteur « Secteur fictif » reconnu dans « Secteur fictif ».'],
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
}

async function pick(
  wrapper: ReturnType<typeof mountTab>,
  tile: string
): Promise<void> {
  await wrapper.get(`[data-tile="${tile}"]`).trigger('click')
}

describe('onglet Quartier (lot 19)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mapLibreMock.reset()
    apiMock.listings.context.mockResolvedValue(fakeContext())
    apiMock.listings.regeocode.mockResolvedValue(item)
    apiMock.study.compliance.mockResolvedValue(compliance())
  })

  it('six tuiles lisibles, Tram ouvert par défaut avec la desserte', async () => {
    const wrapper = mountTab()
    await flushPromises()
    const tiles = wrapper.findAll('[data-tile]')
    expect(tiles.map(t => t.attributes('data-tile'))).toEqual([
      'transit',
      'shopping',
      'sport',
      'neighbourhood',
      'risks',
      'placement',
    ])
    expect(tiles.map(t => n(t.find('strong').text()))).toEqual([
      'Tram A, C à 240 m',
      'Drive à 900 m',
      'Piste à 1,3 km',
      'Quartier fictif',
      '1 point d’attention',
      'À l’adresse',
    ])
    expect(tiles[0]?.attributes('aria-pressed')).toBe('true')
    expect(tiles[1]?.attributes('aria-pressed')).toBe('false')
    const detail = wrapper.get('#neighbourhood-detail')
    expect(detail.get('h2').text()).toBe('Desserte TBM')
    const transit = detail.get('[data-testid="transit"]').text()
    expect(transit).toContain('Arrêt fictif')
    expect(transit).toContain('ligne A, C')
    expect(transit).toContain('240 m')
    expect(transit).toContain('Bus fictif')
    expect(transit).not.toContain('≈')
  })

  it('chaque tuile détaille sa donnée : courses, sport, quartier, risques, repère', async () => {
    const wrapper = mountTab()
    await flushPromises()
    await pick(wrapper, 'shopping')
    expect(
      wrapper.get('[data-tile="shopping"]').attributes('aria-pressed')
    ).toBe('true')
    let detail = wrapper.get('#neighbourhood-detail')
    const drives = detail.get('[data-testid="surroundings-drives"]')
    expect(n(drives.get('[data-brand="carrefour"]').text())).toMatch(
      /Carrefour Drive fictif à 1,8 km/
    )
    expect(drives.get('[data-brand="auchan"]').text()).toContain(
      'aucun drive à moins de 20 km'
    )
    expect(drives.get('[data-brand="intermarche"]').text()).toContain(
      'Drive à vérifier'
    )
    expect(detail.find('[data-testid="surroundings-track"]').exists()).toBe(
      false
    )

    await pick(wrapper, 'sport')
    detail = wrapper.get('#neighbourhood-detail')
    expect(n(detail.get('[data-testid="surroundings-track"]').text())).toMatch(
      /Stade fictif\s+à 1,3 km/
    )
    expect(detail.get('[data-testid="surroundings-track"]').text()).toContain(
      'découverte · 400 m · 6 couloirs · Clubs, Scolaires'
    )
    expect(detail.get('[data-testid="surroundings-fitness"]').text()).toBe(
      'Fitness Park : non disponible'
    )
    expect(detail.find('[data-testid="surroundings-drives"]').exists()).toBe(
      false
    )

    await pick(wrapper, 'neighbourhood')
    detail = wrapper.get('#neighbourhood-detail')
    const hood = detail.get('[data-testid="surroundings-neighbourhood"]').text()
    expect(hood).toContain('Quartier fictif')
    expect(hood).toContain('quartier Grand quartier fictif, Bordeaux')
    expect(hood).toContain('Source du contour : Source fictive des quartiers')

    await pick(wrapper, 'risks')
    await flushPromises()
    detail = wrapper.get('#neighbourhood-detail')
    expect(detail.get('h2').text()).toBe('Risques à l’adresse (Géorisques)')
    expect(detail.get('[data-testid="compliance"]').text()).toContain(
      'Retrait-gonflement des argiles'
    )

    await pick(wrapper, 'placement')
    detail = wrapper.get('#neighbourhood-detail')
    expect(detail.get('[data-testid="placement"]').text()).toContain(
      'Adresse exacte'
    )
    expect(detail.find('[data-action="precise-address"]').exists()).toBe(false)
    await detail.get('[data-action="regeocode"]').trigger('click')
    await flushPromises()
    expect(apiMock.listings.regeocode).toHaveBeenCalledWith(item.listing.id)
  })

  it('les tuiles se parcourent aux flèches', async () => {
    const wrapper = mountTab()
    await flushPromises()
    const group = wrapper.get('[data-testid="neighbourhood-tiles"]')
    await group.trigger('keydown', { key: 'ArrowRight' })
    expect(
      wrapper.get('[data-tile="shopping"]').attributes('aria-pressed')
    ).toBe('true')
    await group.trigger('keydown', { key: 'ArrowLeft' })
    await group.trigger('keydown', { key: 'ArrowLeft' })
    expect(
      wrapper.get('[data-tile="placement"]').attributes('aria-pressed')
    ).toBe('true')
    await group.trigger('keydown', { key: 'Enter' })
    expect(
      wrapper.get('[data-tile="placement"]').attributes('aria-pressed')
    ).toBe('true')
  })

  it('repère au quartier : « ≈ », explication, « Préciser l’adresse », pointillé sur la carte', async () => {
    apiMock.listings.context.mockResolvedValue(districtContext())
    const wrapper = mountTab()
    await flushPromises()
    expect(wrapper.get('[data-tile="transit"] strong').text()).toBe(
      'Tram A, C à ≈ 240 m'
    )
    expect(wrapper.get('[data-testid="transit"]').text()).toContain('à ≈ 240 m')
    expect(wrapper.get('[data-testid="transit"]').text()).toContain(
      'Desserte mesurée'
    )
    await pick(wrapper, 'sport')
    expect(
      wrapper.get('[data-testid="surroundings-approximate"]').text()
    ).toContain('≈ depuis le centre du secteur « Secteur fictif »')
    expect(
      n(wrapper.get('[data-testid="surroundings-track"]').text())
    ).toContain('à ≈ 1,3 km')
    await pick(wrapper, 'placement')
    const placement = wrapper.get('[data-testid="placement"]')
    expect(placement.text()).toContain('Au quartier (Secteur fictif)')
    expect(placement.text()).toContain(
      'repère au centre du secteur « Secteur fictif »'
    )
    expect(wrapper.get('[data-testid="placement-reasons"]').text()).toContain(
      'reconnu dans'
    )
    await placement.get('[data-action="precise-address"]').trigger('click')
    expect(wrapper.emitted('precise')).toHaveLength(1)
    const map = wrapper.get('[data-testid="neighbourhood-map"]')
    expect(map.get('[data-testid="map-precision"]').text()).toBe(
      'Repère : au quartier (secteur fictif)'
    )
    expect(map.get('[data-testid="map-note"]').text()).toContain(
      'Pointillé : le quartier retenu'
    )
    await map.get('[data-action="map-precise"]').trigger('click')
    expect(wrapper.emitted('precise')).toHaveLength(2)
    await flushPromises()
    expect(apiMock.listings.areas).toHaveBeenCalled()
  })

  it('la carte du quartier : annonce, tram et ventes comparables ; rien à préciser à l’adresse', async () => {
    const wrapper = mountTab()
    await flushPromises()
    expect(mapLibreMock.maps).toHaveLength(1)
    mapLibreMock.maps[0]?.emit('load')
    expect(
      mapLibreMock.maps[0]?.sources.get('context-comparables')
    ).toBeDefined()
    expect(wrapper.find('[data-testid="map-note"]').exists()).toBe(false)
  })

  it('sans point ni données : « à vérifier », pas de carte, invitation à saisir l’adresse', async () => {
    const missing = {
      status: 'not_applicable' as const,
      nearest: null,
      approximate: false,
      reasons: ['Annonce sans point : saisissez une adresse ou une commune.'],
    }
    apiMock.listings.context.mockResolvedValue(
      fakeContext({
        point: null,
        precision: null,
        transit: {
          nearestTram: null,
          nearestStop: null,
          approximate: false,
          reasons: [],
        },
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
    apiMock.study.compliance.mockResolvedValue(compliance('none'))
    const wrapper = mountTab()
    await flushPromises()
    const values = wrapper.findAll('[data-tile] strong').map(s => n(s.text()))
    expect(values).toEqual([
      'à vérifier',
      'à vérifier',
      'Fitness Park à 900 m',
      'non disponible',
      'à vérifier',
      'Non localisée',
    ])
    expect(wrapper.get('#neighbourhood-detail').text()).toContain(
      'Adresse non localisée'
    )
    expect(wrapper.text()).toContain('Aucun arrêt de tram à moins de 2 km')
    expect(mapLibreMock.maps).toHaveLength(0)
    expect(wrapper.get('[data-testid="neighbourhood-map"]').text()).toContain(
      'pas de carte'
    )
    await pick(wrapper, 'sport')
    expect(
      wrapper.get('[data-testid="surroundings-fitness"]').text()
    ).toContain('9 avenue Fictive')
    await pick(wrapper, 'neighbourhood')
    expect(
      wrapper.get('[data-testid="surroundings-neighbourhood"]').text()
    ).toBe('Quartier : non disponible')
  })

  it('sources et dates repliées : sources, date du contexte, contour, Géorisques', async () => {
    const wrapper = mountTab()
    await flushPromises()
    const sources = wrapper.get('[data-testid="neighbourhood-sources"]')
    expect(sources.attributes('open')).toBeUndefined()
    expect(sources.text()).toContain('Arrêts TBM (Bordeaux Métropole)')
    expect(sources.get('[data-testid="context-computed-at"]').text()).toContain(
      '3 nov. 2026'
    )
    expect(sources.text()).toContain(
      'Contour du quartier : Source fictive des quartiers.'
    )
    expect(sources.get('[data-testid="sources-georisques"]').text()).toContain(
      'relevé le'
    )
    await sources.findAll('button').at(-1)?.trigger('click')
    expect(wrapper.emitted('go')).toEqual([['negocier']])
  })

  it('dit l’erreur du contexte', async () => {
    apiMock.listings.context.mockRejectedValue(
      new Error('Contexte indisponible')
    )
    const wrapper = mountTab()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Contexte indisponible')
  })
})
