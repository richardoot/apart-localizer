/**
 * Lot 21 : le mode tri, au clavier, Annuler, bilan, notification à la fin,
 * reprise après rechargement, et le passage du second membre. Les données
 * sont fictives ; aucun appel réseau.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { DecisionProposal, ListingDraft } from '@apart/contracts'
import { fakeDraft } from '@/test/exploration-fixtures'

const state = vi.hoisted(() => ({
  drafts: [] as unknown[],
  cards: [] as unknown[],
  overview: null as unknown,
}))

const actions = vi.hoisted(() => ({
  decide: vi.fn(),
  respond: vi.fn(),
  undo: vi.fn(),
  finishSession: vi.fn(),
  decideSessionNow: vi.fn(),
  refreshAll: vi.fn(),
}))

const apiMock = vi.hoisted(() => ({
  listings: { setStatus: vi.fn() },
  drafts: { decide: vi.fn() },
}))

vi.mock('@/composables/useDrafts', () => ({
  useDrafts: () => ({
    data: ref(state.drafts),
    merge: { mutateAsync: vi.fn() },
  }),
}))
vi.mock('@/composables/useListings', () => ({
  useListingList: () => ({
    data: ref({ items: [] }),
    isPlaceholderData: ref(false),
  }),
}))
vi.mock('@/composables/useWorkspace', () => ({
  useWorkspace: () => ({
    me: ref({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    activeMembers: ref([]),
  }),
}))
vi.mock('@/composables/useWorkflow', () => ({
  useWorkflowOverview: () => ({ data: ref(state.overview) }),
  useDecisionCards: () => ({ data: ref(state.cards) }),
  useDecisionActions: () => ({
    decide: { mutateAsync: actions.decide },
    respond: { mutateAsync: actions.respond },
    undo: { mutateAsync: actions.undo },
    finishSession: { mutateAsync: actions.finishSession },
    decideSessionNow: { mutateAsync: actions.decideSessionNow },
    refreshAll: actions.refreshAll,
  }),
}))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: apiMock,
}))

import TriagePage from './TriagePage.vue'

const SESSION = '99999999-9999-4999-8999-999999999999'
const CHLOE = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  displayName: 'Chloé',
}

const draftAt = (index: number, over: Partial<ListingDraft> = {}) =>
  fakeDraft({
    id: `dddddddd-dddd-4ddd-8ddd-dddddddddd0${index}`,
    listing: { ...fakeDraft().listing, title: `[Exemple] Annonce ${index}` },
    ...over,
  })

const proposed = {
  outcome: 'proposed',
  message: 'C’est proposé. En attente de Chloé.',
  proposal: { id: 'proposal-1' },
  listingId: null,
  draftId: 'x',
  createdListing: false,
  undoable: true,
}

function overview(agreementRequired = true) {
  return {
    decideTogether: agreementRequired,
    agreementRequired,
    others: agreementRequired ? [CHLOE] : [],
    stages: [],
    agenda: [],
    proposals: [],
  }
}

async function mountPage(query: Record<string, string>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/annonces/tri', name: 'triage', component: TriagePage },
      {
        path: '/annonces',
        name: 'listings',
        component: { render: () => null },
      },
      {
        path: '/annonces/a-trancher',
        name: 'settle',
        component: { render: () => null },
      },
      {
        path: '/annonces/:id',
        name: 'listing',
        component: { render: () => null },
      },
    ],
  })
  await router.push({ name: 'triage', query })
  await router.isReady()
  const wrapper = mount(TriagePage, {
    attachTo: document.body,
    global: { plugins: [router] },
  })
  await flushPromises()
  return { router, wrapper }
}

const press = async (key: string, target: EventTarget = window) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  await flushPromises()
}

describe('le mode tri', () => {
  beforeEach(() => {
    sessionStorage.clear()
    state.drafts = [draftAt(1), draftAt(2)]
    state.cards = []
    state.overview = overview()
    for (const fn of Object.values(actions)) fn.mockReset()
    actions.decide.mockResolvedValue(proposed)
    actions.finishSession.mockResolvedValue({
      notified: true,
      applied: 0,
      stale: 0,
      message: 'Chloé a reçu une seule notification.',
    })
  })

  it('une annonce à la fois, position dans l’URL', async () => {
    const { router, wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    expect(wrapper.get('h1').text()).toBe('[Exemple] Annonce 1')
    expect(wrapper.get('[data-testid="progress"]').text()).toBe(
      'À valider · 1 sur 2'
    )
    expect(wrapper.get('[data-testid="triage-intro"]').text()).toContain(
      'Chloé les verra'
    )
    expect(router.currentRoute.value.query).toMatchObject({
      session: SESSION,
      pos: '0',
    })
    wrapper.unmount()
  })

  it('A propose ; P passe ; E demande une raison', async () => {
    const { wrapper, router } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('a')
    expect(actions.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: 'draft', id: draftAt(1).id },
        choice: 'keep',
        sessionId: SESSION,
      })
    )
    expect(wrapper.get('h1').text()).toBe('[Exemple] Annonce 2')
    expect(router.currentRoute.value.query.pos).toBe('1')
    expect(wrapper.get('[data-testid="triage-live"]').text()).toContain(
      'En attente de Chloé'
    )
    await press('p')
    expect(actions.decide).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="triage-summary"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('E : les raisons, jamais d’écart sans raison', async () => {
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('e')
    expect(wrapper.find('[data-testid="discard-reasons"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('sans raison')
    expect(actions.decide).not.toHaveBeenCalled()
    await wrapper.get('[data-action="reason"]').trigger('click')
    await flushPromises()
    expect(actions.decide).toHaveBeenCalledWith(
      expect.objectContaining({ choice: 'discard', reason: 'Trop cher' })
    )
    wrapper.unmount()
  })

  it('les raccourcis sont inactifs dans un champ de saisie', async () => {
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('e')
    await wrapper.get('[data-action="reason-other"]').trigger('click')
    const input = wrapper.get('[data-testid="reason-text"]').element
    await press('a', input)
    await press('p', input)
    expect(actions.decide).not.toHaveBeenCalled()
    expect(wrapper.get('h1').text()).toBe('[Exemple] Annonce 1')
    wrapper.unmount()
  })

  it('Annuler retire la dernière proposition', async () => {
    actions.undo.mockResolvedValue({ outcome: 'withdrawn' })
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    expect(wrapper.find('[data-testid="triage-undo"]').exists()).toBe(false)
    await press('a')
    expect(wrapper.get('[data-testid="triage-undo"]').text()).toContain(
      'Annuler'
    )
    await wrapper.get('[data-testid="triage-undo"]').trigger('click')
    await flushPromises()
    expect(actions.undo).toHaveBeenCalledWith('proposal-1')
    expect(wrapper.get('h1').text()).toBe('[Exemple] Annonce 1')
    wrapper.unmount()
  })

  it('Annuler n’est pas offert sur un brouillon devenu annonce', async () => {
    state.overview = overview(false)
    actions.decide.mockResolvedValue({
      outcome: 'applied',
      message: 'C’est appliqué : elle passe À étudier.',
      proposal: null,
      listingId: '11111111-1111-4111-8111-111111111111',
      draftId: draftAt(1).id,
      createdListing: true,
      undoable: false,
    })
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('a')
    expect(wrapper.find('[data-testid="triage-undo"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="undo-blocked"]').text()).toContain(
      'pour l’écarter, ouvre sa fiche'
    )
    wrapper.unmount()
  })

  it('Annuler une décision immédiate remet le brouillon', async () => {
    state.overview = overview(false)
    actions.decide.mockResolvedValue({
      outcome: 'applied',
      message: 'C’est appliqué.',
      proposal: null,
      listingId: null,
      draftId: draftAt(1).id,
      createdListing: false,
      undoable: true,
    })
    apiMock.drafts.decide.mockResolvedValue({})
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('e')
    await wrapper.get('[data-action="reason"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="triage-undo"]').trigger('click')
    await flushPromises()
    expect(apiMock.drafts.decide).toHaveBeenCalledWith(draftAt(1).id, {
      status: 'pending',
    })
    wrapper.unmount()
  })

  it('le bilan : totaux, « Terminer et prévenir », une notification', async () => {
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('a')
    await press('p')
    const summary = wrapper.get('[data-testid="triage-summary"]')
    expect(summary.text()).toContain('Ton tri est fini')
    expect(summary.get('[data-testid="summary-totals"]').text()).toContain(
      '1 à étudier'
    )
    expect(summary.get('[data-testid="summary-list"]').text()).toContain(
      'Passée'
    )
    const finish = summary.get('[data-action="finish"]')
    expect(finish.text()).toBe('Terminer et prévenir Chloé')
    await finish.trigger('click')
    await flushPromises()
    expect(actions.finishSession).toHaveBeenCalledWith(SESSION)
    expect(wrapper.get('[data-testid="triage-outcome"]').text()).toContain(
      'une seule notification'
    )
    wrapper.unmount()
  })

  it('décider sans attendre depuis le bilan', async () => {
    actions.decideSessionNow.mockResolvedValue({
      notified: true,
      applied: 1,
      stale: 0,
      message:
        'C’est appliqué. Le journal indique que tu as décidé sans attendre Chloé.',
    })
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('a')
    await press('p')
    await wrapper.get('[data-action="decide-now"]').trigger('click')
    await flushPromises()
    expect(actions.decideSessionNow).toHaveBeenCalledWith(SESSION)
    expect(wrapper.get('[data-testid="triage-outcome"]').text()).toContain(
      'sans attendre Chloé'
    )
    wrapper.unmount()
  })

  it('quitter avec au moins une proposition prévient l’autre une fois', async () => {
    const { wrapper, router } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('a')
    await wrapper.get('[data-testid="triage-quit"]').trigger('click')
    await flushPromises()
    expect(actions.finishSession).toHaveBeenCalledWith(SESSION)
    expect(router.currentRoute.value.name).toBe('listings')
    wrapper.unmount()
  })

  it('quitter sans rien proposer ne prévient personne', async () => {
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await wrapper.get('[data-testid="triage-quit"]').trigger('click')
    await flushPromises()
    expect(actions.finishSession).not.toHaveBeenCalled()
    expect(actions.refreshAll).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('recharger garde la position, et « Annuler »', async () => {
    const first = await mountPage({ etape: 'a-valider', session: SESSION })
    await press('a')
    first.wrapper.unmount()
    const second = await mountPage({ etape: 'a-valider', session: SESSION })
    expect(second.wrapper.get('h1').text()).toBe('[Exemple] Annonce 2')
    expect(second.wrapper.find('[data-testid="triage-undo"]').exists()).toBe(
      true
    )
    second.wrapper.unmount()
  })

  it('rien à trier', async () => {
    state.drafts = []
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    expect(wrapper.get('[data-testid="triage-empty"]').text()).toBe(
      'Rien à trier ici.'
    )
    wrapper.unmount()
  })

  it('une erreur se lit et ne fait pas avancer', async () => {
    const { ApiError } = await import('@/lib/api')
    actions.decide.mockRejectedValue(new ApiError(409, 'Déjà proposé'))
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('a')
    expect(wrapper.get('[role="alert"]').text()).toBe('Déjà proposé')
    expect(wrapper.get('h1').text()).toBe('[Exemple] Annonce 1')
    wrapper.unmount()
  })
})

describe('le passage du second membre', () => {
  const proposal = (
    over: Partial<DecisionProposal> = {}
  ): DecisionProposal => ({
    id: '77777777-7777-4777-8777-777777777777',
    target: 'draft',
    listingId: null,
    draftId: draftAt(1).id,
    title: '[Exemple] Annonce 1',
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
    waitingFor: [CHLOE],
    settleOptions: [],
    viewer: {
      isAuthor: false,
      hasResponded: false,
      canRespond: true,
      canWithdraw: false,
      canDecideNow: false,
      canSettle: false,
      nobodyLeft: false,
    },
    ...over,
  })

  beforeEach(() => {
    sessionStorage.clear()
    state.overview = overview()
    state.cards = [
      { proposal: proposal(), listing: null, draft: draftAt(1) },
      {
        proposal: proposal({
          id: '88888888-8888-4888-8888-888888888888',
          draftId: draftAt(2).id,
          title: '[Exemple] Annonce 2',
          choice: 'discard',
          choiceLabel: 'Écarter',
          reason: 'trop de travaux',
        }),
        listing: null,
        draft: draftAt(2),
      },
    ]
    for (const fn of Object.values(actions)) fn.mockReset()
    actions.respond.mockResolvedValue({
      outcome: 'applied',
      message: 'C’est appliqué.',
      proposal: null,
      listingId: null,
      draftId: null,
      createdListing: false,
      undoable: true,
    })
    actions.finishSession.mockResolvedValue({
      notified: true,
      applied: 0,
      stale: 0,
      message: 'C’est envoyé.',
    })
  })

  it('voit le choix de l’autre et sa raison ; d’accord', async () => {
    const { wrapper } = await mountPage({ mode: 'confirmer', session: SESSION })
    expect(wrapper.get('[data-testid="confirm-banner"]').text()).toContain(
      'Richard propose : À étudier'
    )
    expect(wrapper.get('[data-testid="confirm-banner"]').text()).toContain(
      'Aucune raison donnée.'
    )
    expect(wrapper.get('[data-action="agree"]').text()).toBe(
      'D’accord : À étudier'
    )
    expect(wrapper.get('[data-action="refuse"]').text()).toBe('Non, à écarter')
    await wrapper.get('[data-action="agree"]').trigger('click')
    await flushPromises()
    expect(actions.respond).toHaveBeenCalledWith({
      id: '77777777-7777-4777-8777-777777777777',
      input: { agree: true, sessionId: SESSION },
    })
    expect(wrapper.get('[data-testid="confirm-banner"]').text()).toContain(
      'Richard propose de l’écarter'
    )
    expect(wrapper.get('[data-testid="confirm-banner"]').text()).toContain(
      'Raison : trop de travaux.'
    )
    wrapper.unmount()
  })

  it('non, à écarter : demande une raison, part à trancher', async () => {
    const { wrapper } = await mountPage({ mode: 'confirmer', session: SESSION })
    await wrapper.get('[data-action="refuse"]').trigger('click')
    await wrapper.get('[data-action="reason"]').trigger('click')
    await flushPromises()
    expect(actions.respond).toHaveBeenCalledWith({
      id: '77777777-7777-4777-8777-777777777777',
      input: {
        agree: false,
        choice: 'discard',
        reason: 'Trop cher',
        sessionId: SESSION,
      },
    })
    wrapper.unmount()
  })

  it('non, je la garde : pas de raison à donner', async () => {
    state.cards = [state.cards[1]]
    const { wrapper } = await mountPage({ mode: 'confirmer', session: SESSION })
    expect(wrapper.get('[data-action="refuse"]').text()).toBe(
      'Non, je la garde'
    )
    await wrapper.get('[data-action="refuse"]').trigger('click')
    await flushPromises()
    expect(actions.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ agree: false, choice: 'keep' }),
      })
    )
    wrapper.unmount()
  })

  it('plus tard n’écrit rien ; à la fin, le retour part une fois', async () => {
    const { wrapper } = await mountPage({ mode: 'confirmer', session: SESSION })
    await wrapper.get('[data-action="later"]').trigger('click')
    await wrapper.get('[data-action="agree"]').trigger('click')
    await flushPromises()
    expect(actions.respond).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="triage-summary"]').text()).toContain(
      'C’est fait'
    )
    expect(wrapper.get('[data-testid="summary-list"]').text()).toContain(
      'Plus tard'
    )
    expect(wrapper.get('[data-testid="summary-list"]').text()).toContain(
      'Écartée'
    )
    expect(actions.finishSession).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('un désaccord propose d’aller trancher à la fin', async () => {
    state.cards = [state.cards[0]]
    actions.respond.mockResolvedValue({
      outcome: 'to_settle',
      message: 'C’est noté.',
      proposal: null,
      listingId: null,
      draftId: null,
      createdListing: false,
      undoable: true,
    })
    const { wrapper } = await mountPage({ mode: 'confirmer', session: SESSION })
    await wrapper.get('[data-action="refuse"]').trigger('click')
    await wrapper.get('[data-action="reason"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-action="go-settle"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('Annuler retire la réponse', async () => {
    actions.undo.mockResolvedValue({ outcome: 'waiting' })
    const { wrapper } = await mountPage({ mode: 'confirmer', session: SESSION })
    await wrapper.get('[data-action="agree"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="triage-undo"]').trigger('click')
    await flushPromises()
    expect(actions.undo).toHaveBeenCalledWith(
      '77777777-7777-4777-8777-777777777777'
    )
    wrapper.unmount()
  })

  it('rien à confirmer', async () => {
    state.cards = []
    const { wrapper } = await mountPage({ mode: 'confirmer', session: SESSION })
    expect(wrapper.get('[data-testid="triage-empty"]').text()).toBe(
      'Rien à confirmer.'
    )
    wrapper.unmount()
  })
})
