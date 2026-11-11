/**
 * Lot 19 : l'onglet « À faire » de la fiche. Une seule liste (tâches,
 * questions à l'annonceur avec l'état de leur demande, visites), filtres et
 * compteur, cocher et rouvrir, supprimer une tâche après confirmation en
 * ligne, ajouter une tâche ou une question « À demander à l'agence », message
 * à valider (lire, modifier, valider, annuler, tout valider), message validé
 * noté envoyé, relance due, réponse à appliquer ; à droite, le contact,
 * « Pendant la visite » et les visites, sans `window.confirm`. Aucun message
 * ne part de l'application. API simulée ; données fictives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { AgencyRequest, Task, Visit } from '@apart/contracts'
import {
  MEMBERS,
  fakeAgencyRequest,
  fakeEvaluated,
  fakeExchanges,
  fakeTask,
} from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  agency: {
    exchanges: vi.fn(),
    settings: vi.fn(),
    updateSettings: vi.fn(),
    putContact: vi.fn(),
    clearContact: vi.fn(),
    draft: vi.fn(),
    update: vi.fn(),
    approve: vi.fn(),
    cancel: vi.fn(),
    sent: vi.fn(),
    noAnswer: vi.fn(),
    apply: vi.fn(),
  },
  tasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  visits: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removePhoto: vi.fn(),
  },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import { useFeedbackStore } from '@/stores/feedback'
import TodoTab from '../tabs/TodoTab.vue'
import DraftMessage from './DraftMessage.vue'

enableAutoUnmount(afterEach)

/** Lot 22 : le dernier message de la zone commune. */
const lastMessage = () => useFeedbackStore().messages.at(-1)?.text ?? null

const LISTING = '11111111-1111-4111-8111-111111111111'
const RICHARD = MEMBERS[0]?.id ?? ''
const CHLOE = MEMBERS[1]?.id ?? ''
const id = (n: number) => `aaaaaaaa-0000-4000-8000-00000000000${n}`

const TASKS: Task[] = [
  fakeTask({
    id: id(1),
    label: 'Demander la quote-part du ravalement',
    position: 1,
  }),
  fakeTask({
    id: id(2),
    label: 'Demander le montant de la taxe foncière',
    field: 'propertyTax',
    position: 2,
  }),
  fakeTask({
    id: id(3),
    label: 'Demander le montant des charges',
    field: 'annualCharges',
    position: 3,
    done: true,
    doneAt: '2026-11-07T15:00:00.000Z',
    answeredAt: '2026-11-07T15:00:00.000Z',
    requestId: '77777777-7777-4777-8777-777777777777',
  }),
  fakeTask({ id: id(4), label: 'Demander les diagnostics', position: 4 }),
  fakeTask({ id: id(5), label: 'Demander le DTG', position: 5 }),
  fakeTask({
    id: id(6),
    label: 'Simuler le prêt avec la banque',
    origin: 'manual',
    assigneeId: CHLOE,
    position: 6,
  }),
  fakeTask({
    id: id(7),
    label: 'Vérifier le bruit côté rue',
    origin: 'default',
    position: 7,
  }),
  fakeTask({
    id: id(8),
    label: 'Appeler le notaire',
    origin: 'manual',
    position: 8,
    done: true,
    doneAt: '2026-11-06T15:00:00.000Z',
  }),
]

const DRAFT = fakeAgencyRequest({
  id: '88888888-8888-4888-8888-888888888888',
  status: 'draft',
  taskIds: [id(1)],
  subject: '[Exemple] Quote-part du ravalement',
  body: 'Bonjour,\nPourriez-vous nous indiquer la quote-part du ravalement ?\nRichard et Chloé',
  approvedAt: null,
  approvedVia: null,
  approvedById: null,
  sentAt: null,
  threadRef: null,
  followUpDueOn: null,
})
const DUE = fakeAgencyRequest({
  id: '99999999-9999-4999-8999-999999999999',
  status: 'sent',
  taskIds: [id(2)],
  sentAt: '2026-11-02T09:00:00.000Z',
  followUpDue: true,
  followUpDueOn: '2026-11-09',
})
const ANSWERED = fakeAgencyRequest({
  id: '77777777-7777-4777-8777-777777777777',
  status: 'answered',
  taskIds: [id(3)],
  answeredAt: '2026-11-07T15:00:00.000Z',
  questions: [
    {
      taskId: id(3),
      label: 'Demander le montant des charges',
      field: 'annualCharges',
      question: 'le montant des charges',
      done: true,
    },
  ],
  answers: [
    {
      receivedAt: '2026-11-07T15:00:00.000Z',
      recordedAt: '2026-11-07T15:05:00.000Z',
      authorId: RICHARD,
      channel: 'mcp',
      excerpt: 'Charges : 140 € par mois ; taxe foncière 950 €.',
      values: { annualCharges: 1680, propertyTax: 950 },
      changes: [
        {
          key: 'propertyTax',
          field: 'propertyTax',
          label: 'Taxe foncière',
          before: 900,
          after: 950,
          previousSource: 'user',
          disposition: 'proposed',
          text: 'Taxe foncière : 950 € proposé, la fiche garde 900 € (saisi à la main)',
          appliedAt: null,
        },
      ],
      completedTaskIds: [id(3)],
      summary: 'Taxe foncière proposée',
    },
  ],
})
const APPROVED = fakeAgencyRequest({
  id: '66666666-6666-4666-8666-666666666666',
  status: 'approved',
  taskIds: [id(4)],
  sentAt: null,
  threadRef: null,
})
const REQUESTS: AgencyRequest[] = [DRAFT, DUE, ANSWERED, APPROVED]

const VISIT: Visit = {
  id: '55555555-5555-4555-8555-555555555555',
  listingId: LISTING,
  visitedAt: '2030-11-09T09:00:00.000Z',
  status: 'planned',
  participantIds: [RICHARD, CHLOE],
  report: null,
  pros: null,
  cons: null,
  rating: 0,
  prepTaskId: null,
  createdById: RICHARD,
  createdAt: '2026-11-02T19:00:00.000Z',
  updatedAt: '2026-11-02T19:00:00.000Z',
  photoCount: 0,
  photos: [],
}

function exchanges(over: Partial<ReturnType<typeof fakeExchanges>> = {}) {
  return fakeExchanges({
    requests: REQUESTS,
    openQuestions: [
      {
        taskId: id(5),
        label: 'Demander le DTG',
        field: null,
        question: 'le DTG',
        state: 'open',
        requestId: null,
        requestedAt: null,
      },
    ],
    ...over,
  })
}

function mountTab(tasks: Task[] = TASKS) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(TodoTab, {
    props: {
      item: fakeEvaluated({ id: LISTING }, { tasks }),
      members: MEMBERS,
      meId: RICHARD,
    },
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

const row = (wrapper: ReturnType<typeof mountTab>, key: string) =>
  wrapper.get(`[data-testid="todo-item"][data-key="${key}"]`)

describe('onglet « À faire » (lot 19)', () => {
  const confirm = vi.fn(() => true)
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('confirm', confirm)
    apiMock.agency.exchanges.mockResolvedValue(exchanges())
    apiMock.agency.settings.mockResolvedValue({
      signature: 'Richard et Chloé',
      custom: false,
      defaultSignature: 'Richard et Chloé',
      followUpBusinessDays: 5,
    })
    apiMock.visits.list.mockResolvedValue([VISIT])
  })
  afterEach(() => {
    // Aucune confirmation par la fenêtre du navigateur.
    expect(confirm).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('une seule liste : visites, questions à l’annonceur et tâches ; filtres, compteur, le fait en bas', async () => {
    const wrapper = mountTab()
    await flushPromises()
    const items = wrapper.findAll('[data-testid="todo-item"]')
    expect(items.map(i => i.attributes('data-key'))).toEqual([
      `visit:${VISIT.id}`,
      `task:${id(1)}`,
      `task:${id(2)}`,
      `task:${id(4)}`,
      `task:${id(5)}`,
      `task:${id(6)}`,
      `task:${id(7)}`,
      `task:${id(3)}`,
      `task:${id(8)}`,
    ])
    expect(items.map(i => i.get('[data-testid="todo-kind"]').text())).toEqual([
      'Visite',
      'Agence',
      'Agence',
      'Agence',
      'Agence',
      'Nous',
      'Nous',
      'Agence',
      'Nous',
    ])
    expect(
      row(wrapper, `task:${id(1)}`)
        .get('[data-testid="todo-state"]')
        .text()
    ).toBe('Message à valider')
    expect(
      row(wrapper, `task:${id(2)}`)
        .get('[data-testid="todo-state"]')
        .text()
    ).toBe('Demandée le 2 nov. à l’agence · relance due')
    expect(
      row(wrapper, `task:${id(4)}`)
        .get('[data-testid="todo-state"]')
        .text()
    ).toBe('Message validé, à envoyer')
    expect(
      row(wrapper, `task:${id(3)}`)
        .get('[data-testid="todo-state"]')
        .text()
    ).toBe('Réponse du 7 nov.')
    expect(
      row(wrapper, `task:${id(6)}`)
        .get('[data-testid="todo-state"]')
        .text()
    ).toBe('Chloé')
    expect(
      row(wrapper, `task:${id(8)}`)
        .get('[data-testid="todo-title"]')
        .classes()
    ).toContain('line-through')
    expect(wrapper.get('[data-testid="todo-progress"]').text()).toBe(
      '2 sur 9 faits'
    )

    const filters = wrapper.get('[data-testid="todo-filters"]')
    expect(filters.attributes('role')).toBe('group')
    expect(filters.findAll('button').map(b => b.text())).toEqual([
      'Tout9',
      'Nous3',
      'Agence5',
      'Visites1',
    ])
    await filters.get('[data-filter="agency"]').trigger('click')
    expect(
      filters.get('[data-filter="agency"]').attributes('aria-pressed')
    ).toBe('true')
    expect(
      wrapper
        .findAll('[data-testid="todo-item"]')
        .map(i => i.attributes('data-group'))
    ).toEqual(['agency', 'agency', 'agency', 'agency', 'agency'])
    await filters.get('[data-filter="visit"]').trigger('click')
    expect(wrapper.findAll('[data-testid="todo-item"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="prepare-message"]').exists()).toBe(false)
  })

  it('coche, rouvre et supprime (confirmation en ligne) ; ajoute une tâche et une question pour l’agence', async () => {
    apiMock.tasks.update.mockResolvedValue({})
    apiMock.tasks.remove.mockResolvedValue(undefined)
    apiMock.tasks.create.mockResolvedValue({})
    const wrapper = mountTab()
    await flushPromises()
    const loan = row(wrapper, `task:${id(6)}`)
    const box = loan.get('[data-testid="todo-toggle"]')
    expect(box.attributes('aria-label')).toBe(
      'Marquer comme fait : Simuler le prêt avec la banque'
    )
    await box.setValue(true)
    await flushPromises()
    expect(apiMock.tasks.update).toHaveBeenCalledWith(LISTING, id(6), {
      done: true,
    })
    expect(lastMessage()).toBe('Tâche cochée.')
    // Lot 22 : « Annuler » dans la zone de messages décoche la tâche.
    await useFeedbackStore().act(useFeedbackStore().messages.at(-1)?.id ?? 0)
    await flushPromises()
    expect(apiMock.tasks.update).toHaveBeenLastCalledWith(LISTING, id(6), {
      done: false,
    })
    const done = row(wrapper, `task:${id(8)}`).get(
      '[data-testid="todo-toggle"]'
    )
    expect(done.attributes('aria-label')).toBe('Rouvrir : Appeler le notaire')
    await done.setValue(false)
    await flushPromises()
    expect(apiMock.tasks.update).toHaveBeenLastCalledWith(LISTING, id(8), {
      done: false,
    })
    // Seules les tâches ajoutées à la main se suppriment, après confirmation.
    expect(
      row(wrapper, `task:${id(7)}`)
        .find('[data-testid="todo-remove"]')
        .exists()
    ).toBe(false)
    await loan.get('[data-testid="todo-remove"]').trigger('click')
    expect(loan.get('[data-testid="todo-remove-confirm"]').text()).toContain(
      'Supprimer « Simuler le prêt avec la banque » ?'
    )
    expect(apiMock.tasks.remove).not.toHaveBeenCalled()
    await loan.get('[data-testid="todo-remove-yes"]').trigger('click')
    await flushPromises()
    expect(apiMock.tasks.remove).toHaveBeenCalledWith(LISTING, id(6))

    const form = wrapper.get('[data-testid="todo-add"]')
    await form.trigger('submit')
    expect(form.text()).toContain('Écris la tâche ou la question.')
    await form
      .get('[data-testid="todo-add-text"]')
      .setValue('  Appeler le syndic ')
    await form.trigger('submit')
    await flushPromises()
    expect(apiMock.tasks.create).toHaveBeenLastCalledWith(LISTING, {
      label: 'Appeler le syndic',
    })
    await form
      .get('[data-testid="todo-add-text"]')
      .setValue('La date du dernier ravalement')
    await form.get('[data-testid="todo-add-agency"]').setValue(true)
    await form.trigger('submit')
    await flushPromises()
    expect(apiMock.tasks.create).toHaveBeenLastCalledWith(LISTING, {
      label: 'Demander la date du dernier ravalement',
    })
    expect(lastMessage()).toContain(
      'Question ajoutée : « Demander la date du dernier ravalement »'
    )
    expect(
      (form.get('[data-testid="todo-add-agency"]').element as HTMLInputElement)
        .checked
    ).toBe(false)
  })

  it('message à valider : il se lit, se modifie, s’enregistre, se valide ou s’annule', async () => {
    apiMock.agency.update.mockResolvedValue({ request: DRAFT })
    apiMock.agency.approve.mockResolvedValue({ requests: [] })
    apiMock.agency.cancel.mockResolvedValue({ request: DRAFT })
    const wrapper = mountTab()
    await flushPromises()
    const draft = row(wrapper, `task:${id(1)}`).get(
      '[data-testid="draft-message"]'
    )
    expect(draft.get('[data-testid="draft-text"]').text()).toContain(
      'Pourriez-vous nous indiquer la quote-part du ravalement ?'
    )
    await draft.get('[data-testid="draft-edit"]').trigger('click')
    const body = draft.get('[data-testid="draft-body"]')
    await body.setValue('Bonjour,\nTexte corrigé.\nRichard et Chloé')
    expect(
      draft.get('[data-testid="draft-approve"]').attributes('disabled')
    ).toBeDefined()
    await draft.get('[data-testid="draft-save"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.update).toHaveBeenCalledWith(DRAFT.id, {
      subject: DRAFT.subject,
      body: 'Bonjour,\nTexte corrigé.\nRichard et Chloé',
    })
    await body.setValue(DRAFT.body)
    await draft.get('[data-testid="draft-approve"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.approve).toHaveBeenCalledWith([DRAFT.id])
    expect(lastMessage()).toContain('Message validé : demande à Claude')
    await draft.get('[data-testid="draft-cancel"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.cancel).toHaveBeenCalledWith(DRAFT.id)
  })

  it('« Revenir au texte » ; un message à plusieurs questions ne montre ses actions qu’une fois', async () => {
    apiMock.agency.exchanges.mockResolvedValue(
      exchanges({
        requests: [
          { ...DRAFT, taskIds: [id(1), id(5)] },
          {
            ...DRAFT,
            id: '44444444-4444-4444-8444-444444444444',
            taskIds: [id(2)],
          },
        ],
        openQuestions: [],
      })
    )
    apiMock.agency.approve.mockResolvedValue({ requests: [] })
    const wrapper = mountTab()
    await flushPromises()
    const first = row(wrapper, `task:${id(1)}`)
    expect(first.get('[data-testid="todo-shared"]').text()).toBe(
      'Ce message pose aussi : Demander le DTG'
    )
    expect(
      row(wrapper, `task:${id(5)}`)
        .get('[data-testid="todo-same-message"]')
        .text()
    ).toBe('Dans le même message que la question au-dessus.')
    expect(wrapper.findAll('[data-testid="draft-message"]')).toHaveLength(2)
    // Deux messages à valider : la validation par lot.
    await wrapper.get('[data-testid="approve-all"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.approve).toHaveBeenCalledWith([
      DRAFT.id,
      '44444444-4444-4444-8444-444444444444',
    ])
    expect(lastMessage()).toContain('2 messages validés')

    const draft = mount(DraftMessage, { props: { request: DRAFT } })
    await draft.get('[data-testid="draft-edit"]').trigger('click')
    await draft.get('[data-testid="draft-subject"]').setValue('Autre objet')
    expect(draft.text()).toContain(
      'Texte modifié : enregistre-le avant de valider.'
    )
    await draft
      .findAll('button')
      .find(b => b.text() === 'Revenir au texte')
      ?.trigger('click')
    expect(draft.find('[data-testid="draft-subject"]').exists()).toBe(false)
    expect(draft.text()).toContain(DRAFT.subject)
    expect(
      draft.get('[data-testid="draft-approve"]').attributes('disabled')
    ).toBeUndefined()
  })

  it('validé → « Je l’ai envoyé » ; relance due → « Préparer une relance », « Pas de réponse » ; réponse → « Appliquer »', async () => {
    apiMock.agency.sent.mockResolvedValue({ request: APPROVED })
    apiMock.agency.draft.mockResolvedValue({ request: DRAFT })
    apiMock.agency.noAnswer.mockResolvedValue({ request: DUE })
    apiMock.agency.apply.mockResolvedValue({
      request: ANSWERED,
      listing: { listing: { id: LISTING } },
      applied: [],
    })
    const wrapper = mountTab()
    await flushPromises()
    const approved = row(wrapper, `task:${id(4)}`)
    expect(approved.get('[data-testid="todo-approved"]').text()).toContain(
      'Claude l’enverra par tes outils'
    )
    await approved.get('[data-testid="mark-sent"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.sent).toHaveBeenCalledWith(APPROVED.id, undefined)

    const due = row(wrapper, `task:${id(2)}`)
    const details = due.get('[data-testid="todo-request"]')
    expect(details.attributes('open')).toBeDefined()
    expect(details.get('[data-testid="follow-up-due"]').text()).toContain(
      'Relance due depuis le 9 nov.'
    )
    await details.get('[data-testid="prepare-follow-up"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.draft).toHaveBeenLastCalledWith(LISTING, {
      followUpOf: DUE.id,
    })
    await details.get('[data-testid="no-answer"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.noAnswer).toHaveBeenCalledWith(DUE.id)

    const answered = row(wrapper, `task:${id(3)}`)
    expect(answered.get('[data-testid="request-answer"]').text()).toContain(
      'Réponse du 7 nov.'
    )
    await answered.get('[data-testid="apply-proposed"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.apply).toHaveBeenCalledWith(ANSWERED.id, {
      keys: ['propertyTax'],
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
    })
    expect(lastMessage()).toBe('Valeur de l’annonceur appliquée à la fiche.')
  })

  it('« Préparer un message » pour les questions pas encore posées ; l’erreur de l’API est dite', async () => {
    const { ApiError } =
      await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
    apiMock.agency.draft.mockRejectedValue(
      new ApiError(400, 'Aucune question ouverte')
    )
    const wrapper = mountTab()
    await flushPromises()
    const prepare = wrapper.get('[data-testid="prepare-message"]')
    expect(prepare.text()).toBe('Préparer un message (1)')
    await prepare.trigger('click')
    await flushPromises()
    expect(apiMock.agency.draft).toHaveBeenCalledWith(LISTING, {})
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Aucune question ouverte'
    )
  })

  it('à droite : le contact (messages par tes outils), « Pendant la visite », les visites ; « Voir la visite »', async () => {
    const wrapper = mountTab()
    await flushPromises()
    expect(wrapper.get('[data-testid="agency-contact"]').text()).toContain(
      'Contact de l’annonceur'
    )
    expect(wrapper.get('[data-testid="exchanges-outbound"]').text()).toBe(
      'Les messages partent par tes outils (Gmail, messagerie du portail), jamais par le serveur.'
    )
    expect(wrapper.get('[data-testid="signature"]').text()).toContain(
      'Richard et Chloé'
    )
    const checklist = wrapper.get('[data-testid="visit-checklist"]')
    expect(checklist.findAll('li').map(li => li.text())).toEqual([
      'Vérifier le bruit côté rue',
    ])
    // Lot 24 : le mode visite, d'un geste.
    expect(wrapper.find('[data-testid="visit-mode-open"]').text()).toBe(
      'Mode visite'
    )
    const card = document.getElementById(`visit-${VISIT.id}`)
    expect(card).not.toBeNull()
    const focus = vi.fn()
    if (card) card.focus = focus
    await row(wrapper, `visit:${VISIT.id}`)
      .get('[data-testid="todo-show-visit"]')
      .trigger('click')
    await flushPromises()
    expect(focus).toHaveBeenCalled()

    // Sans tâche « Vérifier … » : le bloc est omis.
    const bare = mountTab(TASKS.filter(t => t.id !== id(7)))
    await flushPromises()
    expect(bare.find('[data-testid="visit-checklist"]').exists()).toBe(false)
  })

  it('une visite se supprime après confirmation dans sa carte, jamais par window.confirm', async () => {
    apiMock.visits.remove.mockResolvedValue(undefined)
    const wrapper = mountTab()
    await flushPromises()
    await wrapper.get('[data-testid="visit-remove"]').trigger('click')
    expect(
      wrapper.get('[data-testid="visit-remove-confirm"]').text()
    ).toContain('Supprimer cette visite et tes photos ?')
    expect(apiMock.visits.remove).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="visit-remove-yes"]').trigger('click')
    await flushPromises()
    expect(apiMock.visits.remove).toHaveBeenCalledWith(LISTING, VISIT.id)
  })

  it('une photo se supprime après confirmation dans sa carte', async () => {
    apiMock.visits.list.mockResolvedValue([
      {
        ...VISIT,
        status: 'done',
        photoCount: 1,
        photos: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            visitId: VISIT.id,
            status: 'ready',
            contentType: 'image/jpeg',
            sizeBytes: 1000,
            width: null,
            height: null,
            caption: 'Séjour',
            uploadedById: RICHARD,
            createdAt: '2026-11-02T19:00:00.000Z',
            url: 'https://storage.invalid/sign/a.jpg',
            thumbnailUrl: null,
            urlExpiresAt: '2026-11-02T19:10:00.000Z',
          },
        ],
      },
    ])
    apiMock.visits.removePhoto.mockResolvedValue(undefined)
    const wrapper = mountTab()
    await flushPromises()
    await wrapper.get('[aria-label="Supprimer la photo"]').trigger('click')
    expect(
      wrapper.get('[data-testid="photo-remove-confirm"]').text()
    ).toContain('Supprimer cette photo ?')
    await wrapper.get('[data-testid="photo-remove-yes"]').trigger('click')
    await flushPromises()
    expect(apiMock.visits.removePhoto).toHaveBeenCalledWith(
      LISTING,
      VISIT.id,
      '33333333-3333-4333-8333-333333333333'
    )
  })
})

describe('lot 22 : retours au bon endroit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.agency.exchanges.mockResolvedValue(exchanges())
    apiMock.agency.settings.mockResolvedValue({
      signature: 'Richard et Chloé',
      custom: false,
      defaultSignature: 'Richard et Chloé',
      followUpBusinessDays: 5,
    })
    apiMock.visits.list.mockResolvedValue([VISIT])
  })

  it('une tâche qui ne se coche pas : l’erreur dans sa ligne, pas en haut de l’onglet', async () => {
    const { ApiError } =
      await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
    apiMock.tasks.update.mockRejectedValue(
      new ApiError(409, 'La tâche a changé entre-temps.')
    )
    const wrapper = mountTab()
    await flushPromises()
    const loan = row(wrapper, `task:${id(6)}`)
    await loan.get('[data-testid="todo-toggle"]').setValue(true)
    await flushPromises()
    expect(loan.get('[data-testid="todo-row-error"]').text()).toContain(
      'La tâche a changé entre-temps.'
    )
    expect(
      row(wrapper, `task:${id(8)}`)
        .find('[data-testid="todo-row-error"]')
        .exists()
    ).toBe(false)
    expect(useFeedbackStore().messages).toHaveLength(0)
  })

  it('la lecture des visites échoue : « Réessayer », jamais « Aucune visite »', async () => {
    const { ApiError } =
      await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
    apiMock.visits.list.mockRejectedValue(
      new ApiError(500, 'Le serveur ne répond pas.')
    )
    const wrapper = mountTab()
    await flushPromises()
    expect(wrapper.text()).not.toContain('Aucune visite')
    expect(wrapper.text()).toContain('Le serveur ne répond pas.')
    apiMock.visits.list.mockResolvedValue([VISIT])
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()
    expect(document.getElementById(`visit-${VISIT.id}`)).not.toBeNull()
  })
})
