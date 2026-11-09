/**
 * Lot 21 : « À valider » dans la barre d'étapes : les lignes, le brouillon
 * déplié sur place, à plusieurs les actions proposent et la raison devient
 * obligatoire pour écarter. Données fictives.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { DecisionProposal } from '@apart/contracts'
import { NO_CRITERIA_FIT } from '@apart/contracts'
import { fakeDraft } from '@/test/exploration-fixtures'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  drafts: {
    list: vi.fn(),
    attached: vi.fn(),
    accept: vi.fn(),
    decide: vi.fn(),
    merge: vi.fn(),
    distinct: vi.fn(),
    acceptInCriteria: vi.fn(),
  },
  explorations: { list: vi.fn() },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import DraftCard from './DraftCard.vue'
import DraftsTab from './DraftsTab.vue'

const decision: DecisionProposal = {
  id: '77777777-7777-4777-8777-777777777777',
  target: 'draft',
  listingId: null,
  draftId: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
  title: '[Exemple] T3',
  choice: 'keep',
  choiceLabel: 'À étudier',
  reason: null,
  state: 'open',
  resolution: null,
  appliedChoice: null,
  fromStatus: null,
  fromStage: 'a-valider',
  author: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    displayName: 'Richard',
  },
  channel: 'web',
  sessionId: null,
  createdAt: '2026-11-08T10:00:00.000Z',
  closedAt: null,
  closedBy: null,
  responses: [],
  waitingFor: [
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', displayName: 'Chloé' },
  ],
  settleOptions: [],
  viewer: {
    isAuthor: true,
    hasResponded: false,
    canRespond: false,
    canWithdraw: true,
    canDecideNow: true,
    canSettle: false,
    nobodyLeft: false,
  },
}

async function mountTab(props: Record<string, unknown>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/annonces',
        name: 'listings',
        component: { render: () => null },
      },
      {
        path: '/annonces/tri',
        name: 'triage',
        component: { render: () => null },
      },
      {
        path: '/annonces/a-trancher',
        name: 'settle',
        component: { render: () => null },
      },
      {
        path: '/criteres',
        name: 'criteria',
        component: { render: () => null },
      },
    ],
  })
  await router.push('/annonces')
  await router.isReady()
  const wrapper = mount(DraftsTab, {
    props: props as never,
    global: { plugins: [router, [VueQueryPlugin, { queryClient: client }]] },
  })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.workspace.mockResolvedValue({
    me: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    workspace: { members: [] },
  })
  apiMock.drafts.attached.mockResolvedValue([])
  apiMock.explorations.list.mockResolvedValue([])
  apiMock.drafts.list.mockResolvedValue([])
})

describe('À valider, en lignes', () => {
  it('une ligne par brouillon ; le titre déplie la carte', async () => {
    const draft = fakeDraft()
    apiMock.drafts.list.mockResolvedValue([draft])
    const { wrapper } = await mountTab({ view: 'list', expanded: null })
    expect(wrapper.find('[data-testid="stage-rows"]').text()).toContain(
      draft.listing.title
    )
    expect(wrapper.find('[data-testid="draft-card"]').exists()).toBe(false)
    await wrapper.get('[data-testid="row-title"]').trigger('click')
    expect(wrapper.emitted('update:expanded')?.[0]).toEqual([draft.id])
    await wrapper.setProps({ expanded: draft.id })
    expect(wrapper.find('[data-testid="draft-card"]').exists()).toBe(true)
  })

  it('« Trier » ouvre le mode tri sur ce brouillon', async () => {
    const draft = fakeDraft()
    apiMock.drafts.list.mockResolvedValue([draft])
    const { wrapper, router } = await mountTab({ view: 'list' })
    await wrapper.get('[data-action="sort"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('triage')
    expect(router.currentRoute.value.query).toEqual({
      etape: 'a-valider',
      carte: draft.id,
    })
  })

  it('« Confirmer » et « Trancher » mènent au bon travail', async () => {
    apiMock.drafts.list.mockResolvedValue([
      fakeDraft({
        decision: {
          ...decision,
          viewer: { ...decision.viewer, isAuthor: false, canRespond: true },
        },
      }),
    ])
    const first = await mountTab({ view: 'list' })
    await first.wrapper.get('[data-action="confirm"]').trigger('click')
    await flushPromises()
    expect(first.router.currentRoute.value.query.mode).toBe('confirmer')

    apiMock.drafts.list.mockResolvedValue([
      fakeDraft({ decision: { ...decision, state: 'to_settle' } }),
    ])
    const second = await mountTab({ view: 'list' })
    await second.wrapper.get('[data-action="settle"]').trigger('click')
    await flushPromises()
    expect(second.router.currentRoute.value.name).toBe('settle')
  })

  it('à part les hors critères, repliés par la page', async () => {
    const out = fakeDraft({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd09',
      fit: { ...NO_CRITERIA_FIT, activeCriteria: 1, level: 'out' },
    })
    apiMock.drafts.list.mockResolvedValue([out])
    const { wrapper } = await mountTab({ view: 'list' })
    expect(wrapper.find('[data-testid="stage-rows"]').exists()).toBe(false)
  })

  it('reçoit les brouillons filtrés de la page', async () => {
    apiMock.drafts.list.mockResolvedValue([fakeDraft()])
    const { wrapper } = await mountTab({ view: 'list', drafts: [] })
    expect(wrapper.find('[data-testid="stage-rows"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="drafts-empty"]').exists()).toBe(true)
  })

  it('à plusieurs, garder une proposition laisse le brouillon à sa place', async () => {
    const draft = fakeDraft()
    apiMock.drafts.list.mockResolvedValue([draft])
    apiMock.drafts.accept.mockResolvedValue({
      draft: { ...draft, decision },
      listingId: null,
      title: draft.listing.title,
    })
    const { wrapper } = await mountTab({ view: 'cards', agreement: true })
    await wrapper.get('[data-action="accept"]').trigger('click')
    await flushPromises()
    expect(apiMock.drafts.accept).toHaveBeenCalledWith(draft.id)
    expect(wrapper.find('[data-testid="draft-added"]').exists()).toBe(false)
  })

  it('à plusieurs, écarter reste un brouillon en attente', async () => {
    const draft = fakeDraft()
    apiMock.drafts.list.mockResolvedValue([draft])
    apiMock.drafts.decide.mockResolvedValue({ ...draft, decision })
    const { wrapper } = await mountTab({ view: 'cards', agreement: true })
    await wrapper.get('[data-action="dismiss"]').trigger('click')
    await wrapper.get('[data-testid="dismiss-form"] input').setValue('Quartier')
    await wrapper.get('[data-testid="dismiss-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="draft-dismissed"]').exists()).toBe(false)
  })
})

describe('DraftCard à plusieurs', () => {
  const stubs = { RouterLink: { template: '<a><slot /></a>' }, FitBadge: true }

  it('ajouter et écarter proposent ; la raison devient obligatoire', async () => {
    const wrapper = mount(DraftCard, {
      props: { draft: fakeDraft(), agreement: true },
      global: { stubs },
    })
    expect(wrapper.get('[data-action="accept"]').text()).toBe(
      'Proposer de la garder'
    )
    expect(wrapper.find('[data-action="edit"]').exists()).toBe(false)
    await wrapper.get('[data-action="dismiss"]').trigger('click')
    expect(wrapper.text()).not.toContain('facultatif')
    await wrapper.get('[data-testid="dismiss-form"]').trigger('submit')
    expect(wrapper.emitted('dismiss')).toBeUndefined()
    expect(
      wrapper.get('[data-action="confirm-dismiss"]').attributes('disabled')
    ).toBeDefined()
    await wrapper.get('[data-testid="dismiss-form"] input').setValue('Quartier')
    await wrapper.get('[data-testid="dismiss-form"]').trigger('submit')
    expect(wrapper.emitted('dismiss')?.[0]).toEqual(['Quartier'])
  })

  it('une proposition en cours remplace les actions', () => {
    const wrapper = mount(DraftCard, {
      props: { draft: fakeDraft({ decision }), agreement: true },
      global: { stubs },
    })
    expect(wrapper.get('[data-testid="draft-decision"]').text()).toContain(
      'En attente de Chloé'
    )
    expect(wrapper.find('[data-action="accept"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="dismiss-form"]').exists()).toBe(false)
  })
})
