/**
 * Lot 9 : l'onglet de la fiche vit dans l'URL (`?onglet=`), à côté des
 * filtres, sans que l'un efface l'autre. Les vues lourdes sont remplacées par
 * des doublures ; la fiche doublée rend l'onglet reçu et le change.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

/** Lot 14 : l'adéquation renvoyée par la liste, réglée par test ; lot 16 : les brouillons. */
const listState = vi.hoisted(() => ({
  fit: null as unknown,
  drafts: [] as unknown[],
}))

vi.mock('@/composables/useDrafts', async () => {
  const { computed } = await import('vue')
  return {
    useDrafts: () => ({ data: computed(() => listState.drafts) }),
  }
})

vi.mock('@/composables/useListings', () => ({
  useListingAreas: () => ({ data: ref(null) }),
  useListingList: () => ({
    data: ref({
      items: [],
      total: 0,
      ...(listState.fit ? { fit: listState.fit } : {}),
    }),
    isPending: ref(false),
    isFetching: ref(false),
    error: ref(null),
  }),
}))
vi.mock('@/composables/useSearchCriteria', () => ({
  useSearchCriteriaList: () => ({ data: ref([]) }),
}))
vi.mock('@/composables/useMapLayers', () => ({
  DEFAULT_LAYER_TOGGLES: {},
  useMapLayers: () => ref({}),
}))

import ListingsPage from './ListingsPage.vue'
import { useFiltersStore } from '@/stores/filters'

const ID = '11111111-1111-4111-8111-111111111111'

const PanelStub = defineComponent({
  name: 'ListingPanel',
  props: {
    id: { type: String, default: '' },
    tab: { type: String, default: 'synthese' },
    notice: { type: String, default: null },
  },
  emits: ['update:tab', 'close'],
  setup(props) {
    return () => h('div', { 'data-testid': 'panel', 'data-tab': props.tab })
  },
})
const Empty = { render: () => null }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/annonces',
        component: ListingsPage,
        children: [
          { path: '', name: 'listings', component: Empty },
          { path: 'nouvelle', name: 'listing-new', component: Empty },
          { path: ':id', name: 'listing', component: Empty },
        ],
      },
      { path: '/comparer', name: 'compare', component: Empty },
      { path: '/criteres', name: 'criteria', component: Empty },
    ],
  })
}

async function mountAt(path: string) {
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(ListingsPage, {
    global: {
      plugins: [router],
      stubs: {
        ListingPanel: PanelStub,
        ListingsTable: Empty,
        ListingCards: Empty,
        ListingsMap: Empty,
        FiltersBar: Empty,
        ExportMenu: Empty,
        ListingCreatePanel: Empty,
        ViewSwitch: Empty,
        DraftsTab: {
          render: () => h('div', { 'data-testid': 'drafts-tab-stub' }),
        },
      },
    },
  })
  await flushPromises()
  return { router, wrapper }
}

describe('ListingsPage : onglet de la fiche dans l’URL', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listState.fit = null
    listState.drafts = []
  })

  it('lot 16 : l’onglet « À valider » compte les brouillons, vit dans l’URL et remplace la liste', async () => {
    listState.fit = {
      activeCriteria: [
        { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Caudéran fictif' },
      ],
      counts: { in: 2, to_confirm: 0, margin: 0, out: 1 },
      kept: 0,
      criteriaId: null,
    }
    listState.drafts = [{ id: 'a' }, { id: 'b' }]
    const { router, wrapper } = await mountAt('/annonces?status=to_visit')
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map(t => t.text())).toEqual([
      'Dans les critères · 2',
      'Hors critères · 1',
      'À valider 2',
    ])
    expect(wrapper.find('[data-testid="drafts-tab-stub"]').exists()).toBe(false)
    await tabs[2]?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({
      status: 'to_visit',
      vue: 'a-valider',
    })
    expect(wrapper.find('[data-testid="drafts-tab-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="legend-price"]').exists()).toBe(false)
    // Revenir à la liste garde les filtres et quitte l'onglet.
    await wrapper.findAll('[role="tab"]')[0]?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ status: 'to_visit' })
  })

  it('lot 16 : sans critère actif, « À valider » s’ouvre depuis l’URL', async () => {
    listState.fit = {
      activeCriteria: [],
      counts: { in: 3, to_confirm: 0, margin: 0, out: 0 },
      kept: 0,
      criteriaId: null,
    }
    listState.drafts = [{ id: 'a' }]
    const { wrapper } = await mountAt('/annonces?vue=a-valider')
    expect(wrapper.findAll('[role="tab"]').map(t => t.text())).toEqual([
      'Toutes les annonces · 3',
      'À valider 1',
    ])
    expect(wrapper.find('[data-testid="drafts-tab-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="fit-no-criteria"]').exists()).toBe(false)
  })

  it('lot 14 : critères comparés, onglets comptés ; « Hors critères » dans l’URL', async () => {
    listState.fit = {
      activeCriteria: [
        { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Caudéran fictif' },
        { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Mérignac fictif' },
      ],
      counts: { in: 2, to_confirm: 2, margin: 2, out: 4 },
      kept: 1,
      criteriaId: null,
    }
    const { router, wrapper } = await mountAt('/annonces')
    expect(wrapper.get('[data-testid="fit-criteria"]').text()).toContain(
      'aux 2 critères actifs'
    )
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map(t => t.text())).toEqual([
      'Dans les critères · 7',
      'Hors critères · 4',
    ])
    await tabs[1]?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.fit).toBe('out')
    expect(wrapper.text()).toContain(
      'Les annonces écartées ou vendues restent gouvernées par le filtre de statut'
    )
  })

  it('ouvre la fiche sur l’onglet de l’URL, filtres compris, sans effacer l’onglet', async () => {
    const { router, wrapper } = await mountAt(
      `/annonces/${ID}?status=to_visit&onglet=negocier`
    )
    expect(wrapper.get('[data-testid="panel"]').attributes('data-tab')).toBe(
      'negocier'
    )
    expect(useFiltersStore().filters.status).toEqual(['to_visit'])
    expect(router.currentRoute.value.query).toEqual({
      status: 'to_visit',
      onglet: 'negocier',
    })
  })

  it('changer d’onglet réécrit l’URL ; la synthèse n’y figure pas', async () => {
    const { router, wrapper } = await mountAt(`/annonces/${ID}?status=to_visit`)
    expect(wrapper.get('[data-testid="panel"]').attributes('data-tab')).toBe(
      'synthese'
    )
    wrapper.getComponent(PanelStub).vm.$emit('update:tab', 'quartier')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({
      status: 'to_visit',
      onglet: 'quartier',
    })
    expect(wrapper.get('[data-testid="panel"]').attributes('data-tab')).toBe(
      'quartier'
    )
    wrapper.getComponent(PanelStub).vm.$emit('update:tab', 'synthese')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ status: 'to_visit' })
  })

  it('un filtre changé garde l’onglet ; fermer la fiche l’oublie', async () => {
    const { router, wrapper } = await mountAt(`/annonces/${ID}?onglet=suivi`)
    useFiltersStore().patch({ status: ['visited'] })
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({
      status: 'visited',
      onglet: 'suivi',
    })
    wrapper.getComponent(PanelStub).vm.$emit('close')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('listings')
    expect(router.currentRoute.value.query).toEqual({ status: 'visited' })
  })

  it('un onglet inconnu donne la synthèse ; la légende explique les deux bases', async () => {
    const { wrapper } = await mountAt(`/annonces/${ID}?onglet=nimporte`)
    expect(wrapper.get('[data-testid="panel"]').attributes('data-tab')).toBe(
      'synthese'
    )
    expect(wrapper.get('[data-testid="legend-price"]').text()).toContain(
      'sur le prix'
    )
    expect(wrapper.get('[data-testid="legend-all-in"]').text()).toContain(
      'coût tout compris'
    )
  })
})
