/**
 * Lot 21 : le mode tri, au clavier, Annuler, bilan, notification à la fin,
 * reprise après rechargement, et le passage du second membre. Les données
 * sont fictives ; aucun appel réseau.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type {
  DecisionProposal,
  ListingDraft,
  SimilarListing,
} from '@apart/contracts'
import { fakeDraft } from '@/test/exploration-fixtures'
import { fakeEvaluated } from '@/test/fixtures'

const state = vi.hoisted(() => ({
  listings: [] as unknown[],
  similar: [] as unknown[],
  drafts: [] as unknown[],
  cards: [] as unknown[],
  overview: null as unknown,
  draftsError: null as Error | null,
  refetch: vi.fn(),
}))

const actions = vi.hoisted(() => ({
  decide: vi.fn(),
  respond: vi.fn(),
  undo: vi.fn(),
  finishSession: vi.fn(),
  decideSessionNow: vi.fn(),
  refreshAll: vi.fn(),
}))

/** Lot 27 : « Déjà vue » (rattacher un brouillon, fusionner deux fiches). */
const mergeMock = vi.hoisted(() => ({
  draftMerge: vi.fn(),
  merge: vi.fn(),
  undo: vi.fn(),
  targets: [] as unknown[],
}))

const apiMock = vi.hoisted(() => ({
  listings: { setStatus: vi.fn() },
  drafts: { decide: vi.fn() },
}))

vi.mock('@/composables/useDrafts', () => ({
  useDrafts: () => ({
    data: ref(state.draftsError ? undefined : state.drafts),
    isPending: ref(state.draftsError === null && false),
    isError: ref(state.draftsError !== null),
    error: ref(state.draftsError),
    isFetching: ref(false),
    refetch: state.refetch,
    merge: { mutateAsync: mergeMock.draftMerge },
  }),
  useDismissedDrafts: () => ({ data: ref([]) }),
}))
vi.mock('@/composables/useListings', () => ({
  useListingList: () => ({
    data: ref({ items: state.listings }),
    isPlaceholderData: ref(false),
    isPending: ref(false),
    isError: ref(false),
    error: ref(null),
  }),
}))
vi.mock('@/composables/useListingMerge', () => ({
  useListingMerge: () => ({
    merge: { mutateAsync: mergeMock.merge },
    undo: { mutateAsync: mergeMock.undo },
  }),
  useSimilarListings: (target: { value: unknown }) => {
    mergeMock.targets.push(target.value)
    return {
      data: ref({ items: state.similar, compared: 3, summary: 'Trouvées' }),
      isPending: ref(false),
      isError: ref(false),
      error: ref(null),
      isFetching: ref(false),
    }
  },
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
    global: {
      plugins: [router],
      // Lot 27 : le panneau « Déjà vue » rendu sur place (sans portail).
      stubs: {
        SidePanel: {
          props: ['title'],
          emits: ['close'],
          template:
            '<section data-side-panel><h2>{{ title }}</h2><button data-close-panel @click="$emit(\'close\')" /><slot /></section>',
        },
      },
    },
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
    state.listings = []
    state.similar = []
    mergeMock.targets.length = 0
    for (const fn of [mergeMock.draftMerge, mergeMock.merge, mergeMock.undo]) {
      fn.mockReset()
    }
    state.draftsError = null
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

  it('lot 22 : réseau coupé pendant le tri, l’erreur et « Réessayer », jamais « Chargement… »', async () => {
    state.draftsError = new TypeError('Failed to fetch')
    state.refetch.mockReset()
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    const alert = wrapper.get('[data-state="error"] [role="alert"]')
    expect(alert.text()).toContain('Pas de connexion au serveur')
    expect(wrapper.text()).not.toContain('Chargement')
    expect(wrapper.find('[data-testid="triage-empty"]').exists()).toBe(false)
    await wrapper.get('[data-testid="retry"]').trigger('click')
    expect(state.refetch).toHaveBeenCalled()
    wrapper.unmount()
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

  it('lot 24 : un refus du serveur remet la carte, avec l’erreur', async () => {
    const { ApiError } = await import('@/lib/api')
    actions.decide.mockRejectedValue(new ApiError(409, 'Déjà proposé'))
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('a')
    expect(wrapper.get('[role="alert"]').text()).toBe(
      '« [Exemple] Annonce 1 » : Déjà proposé La carte est revenue.'
    )
    expect(wrapper.get('h1').text()).toBe('[Exemple] Annonce 1')
    expect(wrapper.get('[data-testid="progress"]').text()).toBe(
      'À valider · 1 sur 2'
    )
    wrapper.unmount()
  })

  it('lot 24 : le choix s’applique tout de suite, avant la réponse ; Annuler attend la réponse', async () => {
    let answer: (value: unknown) => void = () => undefined
    actions.decide.mockReturnValue(
      new Promise(resolve => {
        answer = resolve
      })
    )
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('a')
    // La carte suivante est là alors que le serveur n'a pas répondu.
    expect(wrapper.get('h1').text()).toBe('[Exemple] Annonce 2')
    expect(wrapper.find('[data-testid="triage-undo"]').exists()).toBe(false)
    answer(proposed)
    await flushPromises()
    expect(wrapper.find('[data-testid="triage-undo"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="triage-live"]').text()).toContain(
      'En attente de Chloé'
    )
    wrapper.unmount()
  })

  it('lot 24 : une carte refusée revient même après un autre choix', async () => {
    const { ApiError } = await import('@/lib/api')
    let refuse: (error: unknown) => void = () => undefined
    actions.decide.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        refuse = reject
      })
    )
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('a')
    expect(wrapper.get('h1').text()).toBe('[Exemple] Annonce 2')
    refuse(new ApiError(400, 'Brouillon déjà traité'))
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('[Exemple] Annonce 1')
    expect(wrapper.get('[data-testid="triage-failure"]').text()).toContain(
      'Brouillon déjà traité'
    )
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

const FOUND_ID = '77777777-7777-4777-8777-777777777777'
const found = (over: Partial<SimilarListing> = {}): SimilarListing => ({
  listingId: FOUND_ID,
  title: '[Exemple] T3 déjà suivie',
  status: 'discarded',
  price: 209_000,
  surface: 68,
  rooms: 3,
  commune: 'Bordeaux',
  district: 'Caudéran',
  url: null,
  sellerName: '[Exemple] Cabinet Bastide',
  sellerReference: 'CB-77',
  linkCount: 1,
  updatedAt: '2026-11-10T10:00:00.000Z',
  score: 0.92,
  level: 'very_close',
  matches: [{ kind: 'surface', text: 'Même surface (68 m²)' }],
  differences: [{ kind: 'floor', text: 'Au 3e étage, pas au 2e étage' }],
  ...over,
})

describe('lot 27 : « Déjà vue » dans le tri', () => {
  beforeEach(() => {
    sessionStorage.clear()
    state.draftsError = null
    state.drafts = [draftAt(1), draftAt(2)]
    state.listings = []
    state.similar = [found()]
    state.cards = []
    state.overview = overview()
    mergeMock.targets.length = 0
    for (const fn of Object.values(actions)) fn.mockReset()
    for (const fn of [mergeMock.draftMerge, mergeMock.merge, mergeMock.undo]) {
      fn.mockReset()
    }
    mergeMock.draftMerge.mockResolvedValue({})
  })

  it('D ouvre la recherche : les annonces suivies ressemblantes, avec pourquoi', async () => {
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    expect(wrapper.find('[data-testid="already-seen-panel"]').exists()).toBe(
      false
    )
    expect(wrapper.get('[data-action="already-seen"]').text()).toContain(
      'Déjà vue ? La retrouver'
    )
    await press('d')
    const panel = wrapper.get('[data-testid="already-seen-panel"]')
    expect(panel.text()).toContain('Retrouve « [Exemple] Annonce 1 »')
    expect(panel.text()).toContain('écartées comprises')
    // La recherche part du brouillon de la carte.
    expect(mergeMock.targets.at(-1)).toEqual({ draftId: draftAt(1).id })
    const row = panel.get(`[data-similar="${FOUND_ID}"]`)
    expect(row.get('[data-testid="similar-level"]').text()).toBe(
      'Très proche · 92 %'
    )
    expect(row.get('[data-testid="similar-status"]').text()).toBe('Écarté')
    expect(row.text()).toContain('Même surface (68 m²)')
    expect(row.get('[data-testid="similar-differences"]').text()).toContain(
      'Au 3e étage, pas au 2e étage'
    )
    expect(row.text()).toContain('[Exemple] Cabinet Bastide · réf. CB-77')
    // Les raccourcis du tri sont à l'arrêt tant que la recherche est ouverte.
    await press('a')
    expect(actions.decide).not.toHaveBeenCalled()
    await wrapper.get('[data-close-panel]').trigger('click')
    expect(wrapper.find('[data-testid="already-seen-panel"]').exists()).toBe(
      false
    )
    wrapper.unmount()
  })

  it('un brouillon est rattaché à l’annonce retrouvée, la carte passe', async () => {
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await wrapper.get('[data-action="already-seen"]').trigger('click')
    await wrapper.get('[data-action="pick-similar"]').trigger('click')
    await flushPromises()
    expect(mergeMock.draftMerge).toHaveBeenCalledWith({
      id: draftAt(1).id,
      request: {
        listingId: FOUND_ID,
        expectedUpdatedAt: '2026-11-10T10:00:00.000Z',
      },
    })
    expect(mergeMock.merge).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="already-seen-panel"]').exists()).toBe(
      false
    )
    expect(wrapper.get('h1').text()).toBe('[Exemple] Annonce 2')
    expect(wrapper.get('[data-testid="triage-live"]').text()).toContain(
      'Déjà vue : « [Exemple] T3 déjà suivie »'
    )
    // Un rattachement ne s'annule pas depuis le tri (il se détache sur la fiche).
    expect(wrapper.find('[data-testid="triage-undo"]').exists()).toBe(false)
    await press('p')
    const summary = wrapper.get('[data-testid="triage-summary"]')
    expect(summary.get('[data-testid="summary-totals"]').text()).toContain(
      '1 déjà vue'
    )
    expect(summary.get('[data-testid="summary-list"]').text()).toContain(
      'Déjà vue : « [Exemple] T3 déjà suivie »'
    )
    wrapper.unmount()
  })

  it('un refus reste dans le panneau, la carte ne bouge pas', async () => {
    mergeMock.draftMerge.mockRejectedValue(new Error('réseau coupé'))
    const { wrapper } = await mountPage({
      etape: 'a-valider',
      session: SESSION,
    })
    await press('d')
    await wrapper.get('[data-action="pick-similar"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="already-seen-error"]').text()).toContain(
      'L’annonce n’a pas pu être rattachée.'
    )
    expect(wrapper.get('h1').text()).toBe('[Exemple] Annonce 1')
    wrapper.unmount()
  })

  it('une annonce à étudier est fusionnée dans l’annonce retrouvée, et « Annuler » défait la fusion', async () => {
    const card = fakeEvaluated({
      id: '33333333-3333-4333-8333-333333333333',
      title: '[Exemple] Doublon à étudier',
      status: 'to_study',
      updatedAt: '2026-11-11T09:00:00.000Z',
    })
    state.listings = [card]
    mergeMock.merge.mockResolvedValue({
      merge: { id: 'merge-1', keptId: FOUND_ID },
      listing: card,
      summary: 'Fusionnée',
    })
    mergeMock.undo.mockResolvedValue({ summary: 'Fusion annulée' })
    const { wrapper } = await mountPage({
      etape: 'a-etudier',
      session: SESSION,
    })
    expect(wrapper.get('h1').text()).toBe('[Exemple] Doublon à étudier')
    await press('d')
    expect(mergeMock.targets.at(-1)).toEqual({ listingId: card.listing.id })
    const panel = wrapper.get('[data-testid="already-seen-panel"]')
    expect(panel.text()).toContain('la fusion s’annule')
    expect(panel.get('[data-action="pick-similar"]').text()).toBe(
      'C’est la même : fusionner'
    )
    await panel.get('[data-action="pick-similar"]').trigger('click')
    await flushPromises()
    // L'annonce retrouvée, déjà vue, est celle qu'on garde.
    expect(mergeMock.merge).toHaveBeenCalledWith({
      keepId: FOUND_ID,
      input: {
        absorbedId: card.listing.id,
        expectedUpdatedAt: '2026-11-10T10:00:00.000Z',
        expectedAbsorbedUpdatedAt: '2026-11-11T09:00:00.000Z',
      },
    })
    expect(mergeMock.draftMerge).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="triage-summary"]').exists()).toBe(true)
    const undo = wrapper.get('[data-testid="triage-undo"]')
    expect(undo.attributes('aria-label')).toBe(
      'Annuler : Déjà vue : « [Exemple] T3 déjà suivie »'
    )
    await undo.trigger('click')
    await flushPromises()
    expect(mergeMock.undo).toHaveBeenCalledWith('merge-1')
    expect(wrapper.get('h1').text()).toBe('[Exemple] Doublon à étudier')
    wrapper.unmount()
  })
})
