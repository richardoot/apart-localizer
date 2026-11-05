/**
 * Lot 14 : adéquation aux critères dans la liste (onglets, pastilles,
 * colonne du tableau, cartes) et dans le store des filtres (URL). Annonces
 * fictives évaluées par le vrai paquet `domain`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { NO_CRITERIA_FIT } from '@apart/contracts'
import type { ListingCriteriaFit, ListingListFit } from '@apart/contracts'
import { fakeEvaluated } from '@/test/fixtures'
import {
  filtersFromQuery,
  fitTabOf,
  queryFromFilters,
  toggledFitLevels,
  useFiltersStore,
} from '@/stores/filters'
import FitTabs from './FitTabs.vue'
import ListingCards from './ListingCards.vue'
import ListingsTable from './ListingsTable.vue'

const CRITERIA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const fitOf = (over: Partial<ListingCriteriaFit>): ListingCriteriaFit => ({
  ...NO_CRITERIA_FIT,
  activeCriteria: 1,
  criteriaId: CRITERIA,
  name: 'Caudéran fictif',
  ...over,
})

const listFit = (over: Partial<ListingListFit> = {}): ListingListFit => ({
  activeCriteria: [{ id: CRITERIA, name: 'Caudéran fictif' }],
  counts: { in: 2, to_confirm: 2, margin: 2, out: 4 },
  kept: 1,
  criteriaId: null,
  ...over,
})

function router() {
  return createRouter({
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
}

describe('store : l’onglet et les pastilles d’adéquation dans l’URL', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('onglet déduit du filtre ; pastilles : tout ou rien = pas de filtre', () => {
    expect(fitTabOf(undefined)).toBe('main')
    expect(fitTabOf(['margin'])).toBe('main')
    expect(fitTabOf(['out'])).toBe('out')
    expect(toggledFitLevels(undefined, 'margin')).toEqual(['in', 'to_confirm'])
    expect(toggledFitLevels(['in', 'to_confirm'], 'margin')).toBeUndefined()
    expect(toggledFitLevels(['in'], 'in')).toBeUndefined()
    expect(toggledFitLevels(['out'], 'to_confirm')).toEqual(['to_confirm'])
    expect(filtersFromQuery({ fit: 'out' }).fit).toEqual(['out'])
    expect(
      queryFromFilters({ ...filtersFromQuery({}), fit: ['out'] }, 'table')
    ).toEqual({ fit: 'out' })
  })

  it('changer d’onglet et basculer une pastille', () => {
    const store = useFiltersStore()
    store.setFitTab('out')
    expect(store.filters.fit).toEqual(['out'])
    expect(store.fitTab).toBe('out')
    expect(store.routeQuery).toEqual({ fit: 'out' })
    store.setFitTab('main')
    expect(store.filters.fit).toBeUndefined()
    store.toggleFitLevel('in')
    expect(store.filters.fit).toEqual(['to_confirm', 'margin'])
    store.toggleFitLevel('in')
    expect(store.filters.fit).toBeUndefined()
  })
})

describe('FitTabs', () => {
  beforeEach(() => setActivePinia(createPinia()))

  async function mountTabs(fit: ListingListFit | null) {
    const r = router()
    await r.push('/')
    const wrapper = mount(FitTabs, {
      props: { fit },
      global: { plugins: [r] },
    })
    await flushPromises()
    return wrapper
  }

  it('sans critère actif : ni onglet ni pastille, un lien vers les critères', async () => {
    const wrapper = await mountTabs(listFit({ activeCriteria: [] }))
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="fit-no-criteria"]').text()).toContain(
      'Aucun critère actif'
    )
    expect((await mountTabs(null)).html()).not.toContain('tablist')
  })

  it('deux onglets comptés (gardées comprises), pastilles, explication hors critères', async () => {
    const wrapper = await mountTabs(listFit())
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map(t => t.text())).toEqual([
      'Dans les critères · 7',
      'Hors critères · 4',
    ])
    expect(tabs[0]?.attributes('aria-selected')).toBe('true')
    const pills = wrapper.findAll('[data-fit-level]')
    expect(pills.map(p => p.text())).toEqual([
      'Dans les critères · 2',
      'À confirmer · 2',
      'À la marge · 2',
    ])
    expect(wrapper.get('[data-testid="fit-kept-count"]').text()).toContain(
      '1 hors critères gardée'
    )
    await pills[2]?.trigger('click')
    const store = useFiltersStore()
    expect(store.filters.fit).toEqual(['in', 'to_confirm'])
    expect(pills[2]?.attributes('aria-pressed')).toBe('false')
    await tabs[1]?.trigger('click')
    expect(store.filters.fit).toEqual(['out'])
    expect(wrapper.get('[data-testid="fit-out-explanation"]').text()).toContain(
      'Elles reviennent d’elles-mêmes'
    )
    expect(wrapper.find('[data-fit-level]').exists()).toBe(false)
  })
})

describe('liste : la colonne et les cartes d’adéquation', () => {
  const inside = fakeEvaluated(
    { id: '11111111-1111-4111-8111-111111111111', title: 'T3 dedans' },
    { criteriaFit: fitOf({ level: 'in' }) }
  )
  const kept = fakeEvaluated(
    {
      id: '22222222-2222-4222-8222-222222222222',
      title: 'T3 avec offre',
      status: 'offer_made',
    },
    {
      criteriaFit: fitOf({
        level: 'out',
        reasons: ['Prix +19 % (maximum 220 000 €, marge 5 %)'],
        kept: 'offer',
        since: '2026-11-02T09:00:00.000Z',
        origin: { cause: 'listing', trigger: 'price_up', criteriaName: null },
      }),
    }
  )

  it('tableau : pastille, raison, mention « gardée » sous le titre ; « depuis » dans l’onglet hors critères', async () => {
    const wrapper = mount(ListingsTable, { props: { items: [inside, kept] } })
    expect(wrapper.text()).toContain('Adéquation')
    const rows = wrapper.findAll('tbody tr')
    const row = (id: string) => rows.find(r => r.attributes('data-id') === id)
    expect(row(inside.listing.id)?.get('[data-fit]').text()).toBe(
      'Dans les critères'
    )
    expect(row(inside.listing.id)?.text()).toContain('Caudéran fictif')
    const keptRow = row(kept.listing.id)
    expect(keptRow?.get('[data-testid="fit-kept"]').text()).toBe(
      'Gardée dans la liste : offre en cours'
    )
    expect(keptRow?.find('[data-testid="fit-since"]').exists()).toBe(false)
    await wrapper.setProps({ outTab: true })
    expect(wrapper.text()).toContain('Pourquoi hors critères')
    const outRow = wrapper
      .findAll('tbody tr')
      .find(r => r.attributes('data-id') === kept.listing.id)
    expect(outRow?.get('[data-testid="fit-since"]').text()).toBe(
      'Prix remonté le 2 novembre'
    )
    expect(outRow?.find('[data-testid="fit-kept"]').exists()).toBe(false)
  })

  it('cartes : pastille, raison et mention « gardée »', () => {
    const wrapper = mount(ListingCards, { props: { items: [kept] } })
    expect(wrapper.get('[data-fit]').text()).toBe('Hors critères')
    expect(wrapper.get('[data-testid="fit-reason"]').text()).toContain(
      'Prix +19 %'
    )
    expect(wrapper.get('[data-testid="fit-kept"]').text()).toContain(
      'offre en cours'
    )
  })
})
