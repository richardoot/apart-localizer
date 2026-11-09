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

/** Lot 14 : l'adéquation renvoyée par la liste, réglée par test ; lot 16 : les brouillons ; lot 21 : les compteurs. */
const listState = vi.hoisted(() => ({
  fit: null as unknown,
  drafts: [] as unknown[],
  items: [] as unknown[],
  overview: null as unknown,
  listCalls: [] as unknown[],
}))

vi.mock('@/composables/useDrafts', async () => {
  const { computed } = await import('vue')
  return {
    useDrafts: () => ({ data: computed(() => listState.drafts) }),
  }
})

vi.mock('@/composables/useListings', () => ({
  useListingAreas: () => ({ data: ref(null) }),
  useListingMutations: () => ({ setStatus: { mutateAsync: vi.fn() } }),
  useListingList: (filters: unknown) => {
    listState.listCalls.push(filters)
    return {
      data: ref({
        items: listState.items,
        total: listState.items.length,
        ...(listState.fit ? { fit: listState.fit } : {}),
      }),
      isPending: ref(false),
      isFetching: ref(false),
      error: ref(null),
    }
  },
}))
vi.mock('@/composables/useWorkflow', () => ({
  useWorkflowOverview: () => ({
    data: ref(listState.overview),
    isSuccess: ref(true),
  }),
}))
vi.mock('@/composables/useSearchCriteria', () => ({
  useSearchCriteriaList: () => ({ data: ref([]) }),
}))
vi.mock('@/composables/useMapLayers', () => ({
  DEFAULT_LAYER_TOGGLES: {},
  useMapLayers: () => ref({}),
}))
// Lot 20 : la liste lit les membres (une colonne d'avis chacun).
vi.mock('@/composables/useWorkspace', () => ({
  useWorkspace: () => ({ me: ref(null), activeMembers: ref([]) }),
}))

import ListingsPage from './ListingsPage.vue'
import { NO_CRITERIA_FIT } from '@apart/contracts'
import { fakeEvaluated } from '@/test/fixtures'
import { useFiltersStore } from '@/stores/filters'

const ID = '11111111-1111-4111-8111-111111111111'

/** Lot 21 : la réponse de `/decisions/overview`. */
function overviewOf(
  stages: Array<{ stage: string; count: number; sub: string; toSort: number }>
) {
  return {
    decideTogether: true,
    agreementRequired: true,
    others: [],
    stages: stages.map(s => ({ outOfCriteria: 0, ...s })),
    agenda: [],
    proposals: [],
  }
}

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
    listState.items = []
    listState.overview = overviewOf([])
    listState.listCalls = []
  })

  it('lot 21 : la barre d’étapes vit dans l’URL ; le filtre garde sa place', async () => {
    listState.overview = overviewOf([
      { stage: 'a-valider', count: 2, sub: '2 à trier', toSort: 2 },
      { stage: 'a-etudier', count: 3, sub: '1 à trier', toSort: 1 },
    ])
    const { router, wrapper } = await mountAt('/annonces?dpe=C&etape=a-valider')
    const buttons = wrapper.findAll('[data-testid="stage-bar"] button')
    expect(buttons).toHaveLength(6)
    expect(buttons[0]?.attributes('aria-current')).toBe('step')
    expect(wrapper.find('[data-testid="drafts-tab-stub"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="stage-question"]').text()).toBe(
      'On la garde ?'
    )
    await buttons[1]?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({
      dpe: 'C',
      etape: 'a-etudier',
    })
    expect(wrapper.find('[data-testid="drafts-tab-stub"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="stage-question"]').text()).toBe(
      'Ça vaut une visite ?'
    )
    expect(buttons[1]?.attributes('aria-current')).toBe('step')
    expect(buttons[0]?.attributes('aria-current')).toBeUndefined()
  })

  it('lot 21 : sans adresse, la première étape qui a quelque chose s’ouvre', async () => {
    listState.overview = overviewOf([
      { stage: 'a-valider', count: 0, sub: 'Rien à trier', toSort: 0 },
      { stage: 'a-etudier', count: 4, sub: '4 à trier', toSort: 4 },
    ])
    const { wrapper } = await mountAt('/annonces')
    expect(wrapper.get('[data-testid="stage-question"]').text()).toBe(
      'Ça vaut une visite ?'
    )
    expect(wrapper.get('[data-testid="stage-cta"]').text()).toBe(
      'Trier les 4 annonces'
    )
  })

  it('lot 21 : les anciens liens ?vue=, ?fit= et ?status= mènent à leur étape', async () => {
    const first = await mountAt('/annonces?vue=a-valider')
    expect(first.router.currentRoute.value.query).toEqual({
      etape: 'a-valider',
    })
    expect(first.wrapper.find('[data-testid="drafts-tab-stub"]').exists()).toBe(
      true
    )
    const second = await mountAt('/annonces?fit=out')
    expect(second.router.currentRoute.value.query).toEqual({
      etape: 'a-etudier',
      hors: '1',
    })
    const third = await mountAt('/annonces?status=to_visit')
    expect(third.router.currentRoute.value.query).toEqual({
      etape: 'a-visiter',
    })
    const fourth = await mountAt('/annonces?fit=in,margin')
    expect(fourth.router.currentRoute.value.query).toEqual({})
  })

  it('lot 21 : les filtres sont derrière « Filtres » ; les hors critères repliés', async () => {
    listState.overview = overviewOf([
      { stage: 'a-etudier', count: 1, sub: '1 à trier', toSort: 1 },
    ])
    listState.fit = {
      activeCriteria: [
        { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Caudéran fictif' },
        { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Mérignac fictif' },
      ],
      counts: { in: 1, to_confirm: 0, margin: 0, out: 1 },
      kept: 0,
      criteriaId: null,
    }
    listState.items = [
      fakeEvaluated(
        { id: ID, title: '[Exemple] Dans les critères' },
        {
          criteriaFit: {
            ...NO_CRITERIA_FIT,
            activeCriteria: 2,
            level: 'in',
          },
        }
      ),
      fakeEvaluated(
        {
          id: '22222222-2222-4222-8222-222222222222',
          title: '[Exemple] Hors critères',
        },
        {
          criteriaFit: {
            ...NO_CRITERIA_FIT,
            activeCriteria: 2,
            level: 'out',
            reasons: ['À 4,2 km du périmètre'],
          },
        }
      ),
    ]
    const { wrapper } = await mountAt('/annonces?etape=a-etudier')
    expect(wrapper.find('[data-testid="filters-panel"]').exists()).toBe(false)
    await wrapper.get('[data-testid="filters-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="fit-criteria"]').text()).toContain(
      'aux 2 critères actifs'
    )
    expect(wrapper.find('[data-testid="stage-rows"]').text()).toContain(
      '[Exemple] Dans les critères'
    )
    expect(wrapper.find('[data-testid="stage-rows"]').text()).not.toContain(
      '[Exemple] Hors critères'
    )
    expect(wrapper.find('[data-testid="out-row"]').exists()).toBe(false)
    const toggle = wrapper.get('[data-testid="out-toggle"]')
    expect(toggle.text()).toBe('Voir 1 annonce hors critères')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(wrapper.get('[data-testid="out-row"]').text()).toContain(
      'À 4,2 km du périmètre'
    )
  })

  it('lot 21 : ouvrir le tableau complet depuis les filtres', async () => {
    const { router, wrapper } = await mountAt('/annonces?etape=a-etudier')
    await wrapper.get('[data-testid="filters-toggle"]').trigger('click')
    await wrapper.get('[data-testid="full-table"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.view).toBe('table')
  })

  it('lot 21 : le temps du chargement, les annonces d’une autre étape s’effacent', async () => {
    listState.overview = overviewOf([
      { stage: 'a-etudier', count: 1, sub: '', toSort: 0 },
      { stage: 'a-visiter', count: 1, sub: '', toSort: 0 },
    ])
    listState.items = [
      fakeEvaluated({
        id: ID,
        title: '[Exemple] À étudier',
        status: 'to_study',
      }),
      fakeEvaluated({
        id: '22222222-2222-4222-8222-222222222222',
        title: '[Exemple] Déjà ailleurs',
        status: 'to_visit',
      }),
    ]
    const { wrapper } = await mountAt('/annonces?etape=a-etudier')
    expect(wrapper.text()).toContain('[Exemple] À étudier')
    expect(wrapper.text()).not.toContain('[Exemple] Déjà ailleurs')
  })

  it('lot 21 : l’API reçoit les statuts de l’étape', async () => {
    await mountAt('/annonces?etape=offres')
    const filters = listState.listCalls.at(-1) as {
      value: Record<string, unknown>
    }
    expect(filters.value.status).toEqual(['offer_made', 'offer_accepted'])
  })

  it('ouvre la fiche sur l’onglet de l’URL, filtres compris, sans effacer l’onglet', async () => {
    const { router, wrapper } = await mountAt(
      `/annonces/${ID}?dpe=C&onglet=negocier`
    )
    expect(wrapper.get('[data-testid="panel"]').attributes('data-tab')).toBe(
      'negocier'
    )
    expect(useFiltersStore().filters.dpe).toEqual(['C'])
    expect(router.currentRoute.value.query).toEqual({
      dpe: 'C',
      onglet: 'negocier',
    })
  })

  it('changer d’onglet réécrit l’URL ; la synthèse n’y figure pas', async () => {
    const { router, wrapper } = await mountAt(`/annonces/${ID}?dpe=C`)
    expect(wrapper.get('[data-testid="panel"]').attributes('data-tab')).toBe(
      'synthese'
    )
    wrapper.getComponent(PanelStub).vm.$emit('update:tab', 'quartier')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({
      dpe: 'C',
      onglet: 'quartier',
    })
    expect(wrapper.get('[data-testid="panel"]').attributes('data-tab')).toBe(
      'quartier'
    )
    wrapper.getComponent(PanelStub).vm.$emit('update:tab', 'synthese')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ dpe: 'C' })
  })

  it('un filtre changé garde l’onglet ; fermer la fiche l’oublie', async () => {
    const { router, wrapper } = await mountAt(`/annonces/${ID}?onglet=a-faire`)
    useFiltersStore().patch({ dpe: ['B'] })
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({
      dpe: 'B',
      onglet: 'a-faire',
    })
    wrapper.getComponent(PanelStub).vm.$emit('close')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('listings')
    expect(router.currentRoute.value.query).toEqual({ dpe: 'B' })
  })

  it('lot 19 : un ancien identifiant d’onglet (lien partagé, notification, e-mail) mène au nouvel onglet et réécrit l’URL', async () => {
    for (const [legacy, next] of [
      ['suivi', 'a-faire'],
      ['echanges', 'a-faire'],
      ['financer', 'budget'],
    ] as const) {
      const { router, wrapper } = await mountAt(
        `/annonces/${ID}?dpe=C&onglet=${legacy}`
      )
      expect(wrapper.get('[data-testid="panel"]').attributes('data-tab')).toBe(
        next
      )
      expect(router.currentRoute.value.query).toEqual({
        dpe: 'C',
        onglet: next,
      })
      expect(router.currentRoute.value.params.id).toBe(ID)
      wrapper.unmount()
    }
  })

  it('un onglet inconnu donne la synthèse ; la légende explique les deux bases', async () => {
    const { wrapper } = await mountAt(
      `/annonces/${ID}?onglet=nimporte&view=table&etape=a-etudier`
    )
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
