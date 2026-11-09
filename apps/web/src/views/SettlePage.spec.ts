/**
 * Lot 21 : « À trancher ensemble ». Les deux choix côte à côte ; un clic
 * suffit, « On en reparle » n'écrit rien, Annuler remet à trancher.
 * Données fictives.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { DecisionCard, DecisionProposal } from '@apart/contracts'
import { fakeEvaluated } from '@/test/fixtures'

const state = vi.hoisted(() => ({ cards: [] as unknown[], pending: false }))
const actions = vi.hoisted(() => ({
  resolve: vi.fn(),
  undo: vi.fn(),
  refreshAll: vi.fn(),
}))

vi.mock('@/composables/useWorkflow', () => ({
  useDecisionCards: () => ({
    data: ref(state.cards),
    isPending: ref(state.pending),
  }),
  useDecisionActions: () => ({
    resolve: { mutateAsync: actions.resolve },
    undo: { mutateAsync: actions.undo },
    refreshAll: actions.refreshAll,
  }),
}))
vi.mock('@/composables/useWorkspace', () => ({
  useWorkspace: () => ({
    me: ref({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
  }),
}))

import SettlePage from './SettlePage.vue'

const proposal: DecisionProposal = {
  id: '77777777-7777-4777-8777-777777777777',
  target: 'listing',
  listingId: '11111111-1111-4111-8111-111111111111',
  draftId: null,
  title: '[Exemple] T3 Mérignac',
  choice: 'discard',
  choiceLabel: 'Écarter',
  reason: 'Trop cher',
  state: 'to_settle',
  resolution: null,
  appliedChoice: null,
  fromStatus: 'to_study',
  fromStage: 'a-etudier',
  author: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    displayName: 'Richard',
  },
  channel: 'web',
  sessionId: null,
  createdAt: '2026-11-08T10:00:00.000Z',
  closedAt: null,
  closedBy: null,
  responses: [
    {
      member: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        displayName: 'Chloé',
      },
      agrees: false,
      choice: 'to_visit',
      reason: 'J’aimerais voir le quartier.',
      at: '2026-11-08T11:00:00.000Z',
    },
  ],
  waitingFor: [],
  settleOptions: ['discard', 'to_visit'],
  viewer: {
    isAuthor: true,
    hasResponded: false,
    canRespond: false,
    canWithdraw: true,
    canDecideNow: false,
    canSettle: true,
    nobodyLeft: false,
  },
}

const card = (over: Partial<DecisionCard> = {}): DecisionCard => ({
  proposal,
  listing: fakeEvaluated({
    title: '[Exemple] T3 Mérignac',
    status: 'to_study',
  }),
  draft: null,
  ...over,
})

const stubs = {
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}

describe('À trancher ensemble', () => {
  beforeEach(() => {
    state.cards = [card()]
    state.pending = false
    for (const fn of Object.values(actions)) fn.mockReset()
  })

  it('les deux choix côte à côte, « Toi » et l’autre', () => {
    const wrapper = mount(SettlePage, { global: { stubs } })
    const sides = wrapper.findAll('[data-testid="settle-side"]')
    expect(sides[0]?.text()).toContain('Toi')
    expect(sides[0]?.text()).toContain('Écarter')
    expect(sides[0]?.text()).toContain('Raison : Trop cher.')
    expect(sides[1]?.text()).toContain('Chloé')
    expect(sides[1]?.text()).toContain('À visiter')
    expect(sides[1]?.text()).toContain('« J’aimerais voir le quartier. »')
    expect(wrapper.get('[data-testid="settle-count"]').text()).toContain(
      '1 annonce où vos choix diffèrent.'
    )
  })

  it('un clic applique, et le dit ; Annuler remet à trancher', async () => {
    actions.resolve.mockResolvedValue({
      outcome: 'applied',
      message: 'C’est appliqué.',
      createdListing: false,
    })
    actions.undo.mockResolvedValue({ outcome: 'waiting' })
    const wrapper = mount(SettlePage, { global: { stubs } })
    await wrapper.get('[data-settle-choice="to_visit"]').trigger('click')
    await flushPromises()
    expect(actions.resolve).toHaveBeenCalledWith({
      id: proposal.id,
      input: { choice: 'to_visit' },
    })
    expect(wrapper.get('[data-testid="settle-result"]').text()).toContain(
      'Tranché : À visiter. Noté au journal.'
    )
    expect(wrapper.get('[data-testid="settle-count"]').text()).toContain(
      'Plus rien à trancher.'
    )
    await wrapper.get('[data-action="reopen"]').trigger('click')
    await flushPromises()
    expect(actions.undo).toHaveBeenCalledWith(proposal.id)
    expect(wrapper.find('[data-settle-choice="to_visit"]').exists()).toBe(true)
  })

  it('« On en reparle » n’écrit rien', async () => {
    const wrapper = mount(SettlePage, { global: { stubs } })
    await wrapper.get('[data-action="later"]').trigger('click')
    expect(actions.resolve).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="settle-result"]').text()).toContain(
      'Elle reste ici, vous en reparlerez.'
    )
    await wrapper.get('[data-action="reopen"]').trigger('click')
    expect(actions.undo).not.toHaveBeenCalled()
    expect(wrapper.find('[data-action="later"]').exists()).toBe(true)
  })

  it('caduque : l’interface le dit ; un brouillon créé n’offre pas Annuler', async () => {
    actions.resolve.mockResolvedValueOnce({
      outcome: 'stale',
      message: 'Cette proposition est caduque.',
      createdListing: false,
    })
    const wrapper = mount(SettlePage, { global: { stubs } })
    await wrapper.get('[data-settle-choice="discard"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="settle-result"]').text()).toContain(
      'caduque'
    )
    expect(wrapper.find('[data-action="reopen"]').exists()).toBe(false)
  })

  it('une erreur se lit', async () => {
    const { ApiError } = await import('@/lib/api')
    actions.resolve.mockRejectedValue(new ApiError(409, 'Déjà tranché'))
    const wrapper = mount(SettlePage, { global: { stubs } })
    await wrapper.get('[data-settle-choice="discard"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Déjà tranché')
  })

  it('rien à trancher', () => {
    state.cards = []
    const wrapper = mount(SettlePage, { global: { stubs } })
    expect(wrapper.get('[data-testid="settle-empty"]').text()).toContain(
      'Rien à trancher'
    )
  })
})
