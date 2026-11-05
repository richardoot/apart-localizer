/**
 * Lot 14 : « Correspond-elle à ce qu'on cherche ? » dans la synthèse de la
 * fiche. Données fictives ; l'API est doublée.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'
import { NO_CRITERIA_FIT } from '@apart/contracts'
import type { ListingCriteriaFit } from '@apart/contracts'
import { fakeCriteria } from '@/test/criteria-fixtures'

const apiMock = vi.hoisted(() => ({
  listings: { criteriaFitHistory: vi.fn() },
  searchCriteria: { list: vi.fn() },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import CriteriaFitSection from './CriteriaFitSection.vue'

const LISTING = '11111111-1111-4111-8111-111111111111'
const CRITERIA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const toConfirm: ListingCriteriaFit = {
  ...NO_CRITERIA_FIT,
  level: 'to_confirm',
  activeCriteria: 2,
  criteriaId: CRITERIA,
  name: 'Caudéran fictif',
  reasons: ['quartier à cheval sur le périmètre : adresse à préciser'],
  locationPending: true,
  criteria: [
    {
      criteriaId: CRITERIA,
      name: 'Caudéran fictif',
      level: 'to_confirm',
      reasons: ['quartier à cheval sur le périmètre : adresse à préciser'],
      locationPending: true,
      since: '2026-11-05T09:00:00.000Z',
      checks: [
        {
          key: 'perimeter',
          level: 'to_confirm',
          label: 'Périmètre',
          value: 'à confirmer',
          detail:
            'Le contour du quartier est pour 40 % dans le périmètre ; l’adresse décidera.',
          reason: 'quartier à cheval sur le périmètre : adresse à préciser',
          location: true,
        },
        {
          key: 'price_max',
          level: 'margin',
          label: 'Prix maximal 220 000 €',
          value: '228 000 €',
          detail: 'Marge jusqu’à 231 000 €.',
          reason: 'Prix +3,6 % (maximum 220 000 €, marge 5 %)',
          location: false,
        },
      ],
    },
    {
      criteriaId: OTHER,
      name: 'Mérignac fictif',
      level: 'out',
      reasons: ['quartier à 3,1 km du périmètre (marge 300 m)'],
      locationPending: false,
      since: '2026-11-04T09:00:00.000Z',
      checks: [],
    },
  ],
}

async function mountSection(fit: ListingCriteriaFit) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'listings', component: { render: () => null } },
      {
        path: '/criteres',
        name: 'criteria',
        component: { render: () => null },
      },
    ],
  })
  await router.push('/')
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = mount(CriteriaFitSection, {
    props: { listingId: LISTING, fit },
    global: { plugins: [router, [VueQueryPlugin, { queryClient: client }]] },
  })
  await flushPromises()
  return wrapper
}

describe('CriteriaFitSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.searchCriteria.list.mockResolvedValue([
      fakeCriteria({ id: CRITERIA, name: 'Caudéran fictif' }),
    ])
    apiMock.listings.criteriaFitHistory.mockResolvedValue({
      listingId: LISTING,
      items: [
        {
          at: '2026-11-05T09:00:00.000Z',
          what: 'Entrée dans « Caudéran fictif », à confirmer',
          why: 'Quartier à cheval sur le périmètre (repère replacé)',
        },
        { at: '2026-10-30T09:00:00.000Z', what: 'Enregistrée', why: '' },
      ],
    })
  })

  it('à confirmer faute d’adresse : explication, « Préciser l’adresse », détail par critère, marges, historique', async () => {
    const wrapper = await mountSection(toConfirm)
    expect(wrapper.text()).toContain('Correspond-elle à ce qu’on cherche ?')
    expect(wrapper.text()).toContain(
      'Meilleur niveau parmi 2 critère(s) actif(s)'
    )
    const verdict = wrapper.get('[data-testid="fit-verdict"]')
    expect(verdict.text()).toContain('À confirmer')
    expect(verdict.text()).toContain('pas le repère')
    await wrapper.get('[data-testid="fit-precise"]').trigger('click')
    expect(wrapper.emitted('precise')).toHaveLength(1)
    const first = wrapper.get(`[data-criteria="${CRITERIA}"]`)
    expect(first.get('[data-check="perimeter"]').text()).toContain(
      'pour 40 % dans le périmètre'
    )
    const price = first.get('[data-check="price_max"]')
    expect(price.attributes('data-level')).toBe('margin')
    expect(price.text()).toContain('228 000 €')
    expect(price.text()).toContain('Prix +3,6 %')
    expect(first.text()).toContain('Marges appliquées : périmètre 300 m')
    const out = wrapper.get(`[data-criteria="${OTHER}"]`)
    expect(out.text()).toContain('Hors critères')
    expect(out.text()).toContain('Quartier à 3,1 km du périmètre')
    expect(out.text()).toContain('Ni filtre ni périmètre')
    const history = wrapper.get('[data-testid="fit-history"]')
    expect(history.text()).toContain('Entrée dans « Caudéran fictif »')
    expect(history.text()).toContain('Enregistrée')
    await wrapper.get('[data-testid="fit-map"]').trigger('click')
    expect(wrapper.emitted('go')?.[0]).toEqual(['quartier'])
  })

  it('sans critère actif : le dit, propose d’en créer un, sans « Préciser l’adresse »', async () => {
    apiMock.listings.criteriaFitHistory.mockResolvedValue({
      listingId: LISTING,
      items: [],
    })
    const wrapper = await mountSection({ ...NO_CRITERIA_FIT })
    expect(wrapper.get('[data-testid="fit-verdict"]').text()).toContain(
      'Aucun critère actif'
    )
    expect(wrapper.find('[data-testid="fit-precise"]').exists()).toBe(false)
    // RouterLink est doublé dans les tests (src/test/setup.ts) : le lien existe.
    expect(
      wrapper
        .get('[data-testid="fit-verdict"]')
        .find('router-link-stub')
        .exists()
    ).toBe(true)
    expect(wrapper.text()).toContain('Aucun changement enregistré')
  })
})
