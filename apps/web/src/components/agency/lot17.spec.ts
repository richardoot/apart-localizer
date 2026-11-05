/**
 * Lot 17 : questions aux agences dans l'interface. Onglet « Échanges »
 * (messages à valider modifiables et validés par lot, contact saisi et
 * effacé, chronologie avec réponse appliquée et valeur proposée à appliquer,
 * relance due, « pas de réponse », signature), état des tâches demandées dans
 * Suivi, pastille « à valider » de l'onglet, bloc de la Synthèse. API
 * simulée ; données fictives.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { AgencyRequest } from '@apart/contracts'
import {
  MEMBERS,
  fakeAgencyRequest,
  fakeExchanges,
  fakeTask,
} from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  agency: {
    exchanges: vi.fn(),
    pending: vi.fn(),
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
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import ExchangesSection from './ExchangesSection.vue'
import PendingMessages from './PendingMessages.vue'
import TasksSection from '@/components/listings/TasksSection.vue'
import ListingTabs from '@/components/listings/ListingTabs.vue'

const LISTING = '11111111-1111-4111-8111-111111111111'
const DRAFT = fakeAgencyRequest({
  id: '88888888-8888-4888-8888-888888888888',
  status: 'draft',
  approvedAt: null,
  approvedVia: null,
  approvedById: null,
  sentAt: null,
  threadRef: null,
  followUpDueOn: null,
})
const ANSWERED = fakeAgencyRequest({
  id: '77777777-7777-4777-8777-777777777777',
  status: 'answered',
  approvedVia: 'chat',
  answeredAt: '2026-11-07T15:00:00.000Z',
  questions: [
    {
      taskId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
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
      authorId: MEMBERS[0]?.id ?? null,
      channel: 'mcp',
      excerpt: 'Charges : 140 € par mois ; taxe foncière 950 €.',
      values: { annualCharges: 1680, propertyTax: 950 },
      changes: [
        {
          key: 'annualCharges',
          field: 'annualCharges',
          label: 'Charges annuelles',
          before: 1200,
          after: 1680,
          previousSource: 'listing',
          disposition: 'applied',
          text: 'Charges annuelles : 1 200 € → 1 680 €',
          appliedAt: null,
        },
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
      completedTaskIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
      summary: 'Charges annuelles : 1 200 € → 1 680 €',
    },
  ],
})
const DUE = fakeAgencyRequest({ followUpDue: true })

function mountWith<T>(component: T, props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(component as never, {
    props: props as never,
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

describe('onglet « Échanges » (lot 17)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.agency.settings.mockResolvedValue({
      signature: 'Richard et Chloé',
      custom: false,
      defaultSignature: 'Richard et Chloé',
      followUpBusinessDays: 5,
    })
    apiMock.agency.exchanges.mockResolvedValue(
      fakeExchanges({
        requests: [DRAFT, ANSWERED, DUE],
        openQuestions: [
          {
            taskId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            label: 'Demander le DTG',
            field: null,
            question: 'le DTG',
            state: 'open',
            requestId: null,
            requestedAt: null,
          },
          {
            taskId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            label: 'Demander la taxe foncière',
            field: 'propertyTax',
            question: 'la taxe',
            state: 'requested',
            requestId: DUE.id,
            requestedAt: '2026-11-05T09:00:00.000Z',
          },
        ],
      })
    )
  })

  it('montre le lot à valider, modifiable, et le valide d’un clic', async () => {
    apiMock.agency.approve.mockResolvedValue({ requests: [] })
    apiMock.agency.update.mockResolvedValue({ request: DRAFT })
    const wrapper = mountWith(ExchangesSection, {
      listingId: LISTING,
      members: MEMBERS,
    })
    await flushPromises()
    const drafts = wrapper.get('[data-testid="drafts-section"]')
    expect(drafts.text()).toContain('Messages à valider')
    expect(drafts.text()).toContain('préparé par Claude (MCP, pour Richard)')
    const body = drafts.get<HTMLTextAreaElement>('[data-testid="draft-body"]')
    expect(body.element.value).toContain('Bien cordialement,\nRichard et Chloé')
    // Un texte modifié s'enregistre avant la validation.
    await body.setValue('Bonjour,\nTexte corrigé.\nRichard et Chloé')
    expect(
      wrapper.get('[data-testid="drafts-approve"]').attributes('disabled')
    ).toBeDefined()
    await wrapper.get('[data-testid="draft-save"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.update).toHaveBeenCalledWith(DRAFT.id, {
      subject: DRAFT.subject,
      body: 'Bonjour,\nTexte corrigé.\nRichard et Chloé',
    })
    // Revenir au texte d'origine rend la validation possible.
    await body.setValue(DRAFT.body)
    await wrapper.get('[data-testid="drafts-approve"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.approve).toHaveBeenCalledWith([DRAFT.id])
    expect(wrapper.text()).toContain('Message validé : demandez à Claude')
  })

  it('questions à poser, préparation, relance due, chronologie avec réponse appliquée et valeur proposée', async () => {
    apiMock.agency.draft.mockResolvedValue({ request: DRAFT })
    apiMock.agency.apply.mockResolvedValue({
      request: ANSWERED,
      listing: { listing: { id: LISTING } },
      applied: [],
    })
    apiMock.agency.noAnswer.mockResolvedValue({ request: DUE })
    const wrapper = mountWith(ExchangesSection, {
      listingId: LISTING,
      members: MEMBERS,
    })
    await flushPromises()
    const questions = wrapper.get('[data-testid="open-questions"]')
    expect(questions.text()).toContain('Demander le DTG')
    expect(questions.text()).toContain('demandée le 5 nov.')
    await wrapper.get('[data-testid="prepare-message"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.draft).toHaveBeenCalledWith(LISTING, {})

    const timeline = wrapper.get('[data-testid="requests-timeline"]')
    expect(timeline.text()).toContain('Réponse reçue')
    expect(timeline.text()).toContain(
      'validée dans la conversation avec Claude par Chloé'
    )
    expect(timeline.text()).toContain('Réponse du 7 nov.')
    expect(timeline.text()).toContain('Charges annuelles : 1 200 € → 1 680 €')
    expect(timeline.find('[data-disposition="applied"]').text()).toContain(
      'appliqué'
    )
    expect(timeline.find('[data-disposition="proposed"]').text()).toContain(
      'proposé'
    )
    await timeline.get('[data-testid="apply-proposed"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.apply).toHaveBeenCalledWith(ANSWERED.id, {
      keys: ['propertyTax'],
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
    })
    expect(wrapper.get('[data-testid="follow-up-due"]').text()).toContain(
      'Relance due depuis le 13 nov.'
    )
    await wrapper.get('[data-testid="prepare-follow-up"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.draft).toHaveBeenLastCalledWith(LISTING, {
      followUpOf: DUE.id,
    })
    await wrapper.get('[data-testid="no-answer"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.noAnswer).toHaveBeenCalledWith(DUE.id)
  })

  it('contact : saisi, vérifié, effacé après confirmation', async () => {
    apiMock.agency.putContact.mockResolvedValue({})
    apiMock.agency.clearContact.mockResolvedValue(undefined)
    const wrapper = mountWith(ExchangesSection, {
      listingId: LISTING,
      members: MEMBERS,
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="contact-empty"]').text()).toContain(
      'Aucun contact'
    )
    await wrapper.get('[data-testid="contact-edit"]').trigger('click')
    await wrapper.get('[data-testid="contact-save"]').trigger('click')
    expect(wrapper.get('[data-testid="contact-form"]').text()).toContain(
      'Renseignez au moins un champ'
    )
    await wrapper
      .get('[data-testid="contact-agency"]')
      .setValue('Agence [Exemple]')
    await wrapper
      .get('[data-testid="contact-email"]')
      .setValue('contact@agence.exemple.invalid')
    await wrapper.get('[data-testid="contact-channel"]').setValue('email')
    await wrapper.get('[data-testid="contact-form"]').trigger('submit')
    await flushPromises()
    expect(apiMock.agency.putContact).toHaveBeenCalledWith(LISTING, {
      agencyName: 'Agence [Exemple]',
      contactName: null,
      email: 'contact@agence.exemple.invalid',
      phone: null,
      portalMessageUrl: null,
      preferredChannel: 'email',
    })

    apiMock.agency.exchanges.mockResolvedValue(
      fakeExchanges({
        contact: {
          listingId: LISTING,
          agencyName: 'Agence [Exemple]',
          contactName: 'Mme [Exemple]',
          email: 'contact@agence.exemple.invalid',
          phone: '05 00 00 00 00',
          portalMessageUrl: 'https://portail.exemple.invalid/m/1',
          preferredChannel: 'email',
          updatedAt: '2026-11-03T10:00:00.000Z',
          updatedById: null,
        },
      })
    )
    const filled = mountWith(ExchangesSection, {
      listingId: LISTING,
      members: MEMBERS,
    })
    await flushPromises()
    const view = filled.get('[data-testid="contact-view"]')
    expect(view.text()).toContain('contact@agence.exemple.invalid')
    expect(view.text()).toContain('ouvrir la conversation')
    expect(filled.get('[data-testid="history-empty"]').text()).toContain(
      'Aucune demande envoyée'
    )
    await filled.get('[data-testid="contact-clear"]').trigger('click')
    expect(
      filled.get('[data-testid="contact-clear-confirm"]').text()
    ).toContain('nom affiché seulement')
    await filled.get('[data-testid="contact-clear-yes"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.clearContact).toHaveBeenCalledWith(LISTING)
  })

  it('un message validé se note envoyé ; la signature se change', async () => {
    apiMock.agency.exchanges.mockResolvedValue(
      fakeExchanges({
        requests: [{ ...DRAFT, status: 'approved', approvedVia: 'app' }],
      })
    )
    apiMock.agency.sent.mockResolvedValue({ request: DRAFT })
    apiMock.agency.updateSettings.mockResolvedValue({
      signature: 'R. et C. [Exemple]',
      custom: true,
      defaultSignature: 'Richard et Chloé',
      followUpBusinessDays: 5,
    })
    const wrapper = mountWith(ExchangesSection, {
      listingId: LISTING,
      members: MEMBERS,
    })
    await flushPromises()
    await wrapper.get('[data-testid="mark-sent"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.sent).toHaveBeenCalledWith(DRAFT.id, undefined)
    const signature = wrapper.get('[data-testid="signature"]')
    expect(signature.text()).toContain('Richard et Chloé')
    expect(signature.text()).toContain('aucune adresse ni aucun téléphone')
    await signature.get('button').trigger('click')
    await wrapper
      .get('[aria-label="Signature des messages"] input')
      .setValue('R. et C. [Exemple]')
    await wrapper
      .get('[aria-label="Signature des messages"] form')
      .trigger('submit')
    await flushPromises()
    expect(apiMock.agency.updateSettings).toHaveBeenCalledWith(
      'R. et C. [Exemple]'
    )
  })

  it('dit l’erreur de l’API', async () => {
    const { ApiError } = await import('@/lib/api')
    apiMock.agency.approve.mockRejectedValue(
      new ApiError(400, 'Seul un message « à valider » se valide')
    )
    const wrapper = mountWith(ExchangesSection, {
      listingId: LISTING,
      members: MEMBERS,
    })
    await flushPromises()
    await wrapper.get('[data-testid="drafts-approve"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Seul un message « à valider » se valide'
    )
  })
})

describe('Suivi, onglet et Synthèse (lot 17)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('chaque tâche liée dit son état : demandée le …, réponse du …, message à valider', () => {
    const requests: AgencyRequest[] = [
      fakeAgencyRequest({ taskIds: ['t1'] }),
      { ...DRAFT, taskIds: ['t3'] },
    ]
    const wrapper = mount(TasksSection, {
      props: {
        members: MEMBERS,
        requests,
        tasks: [
          fakeTask({
            id: 't1',
            label: 'Demander la taxe foncière',
            field: 'propertyTax',
          }),
          fakeTask({
            id: 't2',
            label: 'Demander les charges',
            field: 'annualCharges',
            done: true,
            answeredAt: '2026-11-07T15:00:00.000Z',
          }),
          fakeTask({ id: 't3', label: 'Demander le DTG' }),
          fakeTask({ id: 't4', label: 'Vérifier la desserte' }),
        ],
      },
    })
    const states = wrapper.findAll('[data-testid="task-request-state"]')
    expect(states.map(s => s.text())).toEqual([
      'Demandée le 5 nov. à l’agence',
      'Réponse du 7 nov.',
      'Message à valider',
    ])
    expect(states.map(s => s.attributes('data-request-state'))).toEqual([
      'requested',
      'answered',
      'draft',
    ])
  })

  it('l’onglet Échanges signale les messages à valider', () => {
    const wrapper = mount(ListingTabs, {
      props: { modelValue: 'synthese', pendingMessages: 2 },
    })
    expect(wrapper.get('[data-testid="tab-echanges"]').text()).toContain(
      '2 à valider'
    )
  })

  it('la Synthèse montre « Messages à valider » et valide par lot ; rien sinon', async () => {
    apiMock.workspace.mockResolvedValue({
      workspace: {
        id: 'w',
        name: 'Espace fictif',
        members: MEMBERS,
        invitations: [],
      },
      me: MEMBERS[0],
    })
    apiMock.agency.pending.mockResolvedValue({
      toApprove: [
        DRAFT,
        { ...DRAFT, id: '66666666-6666-4666-8666-666666666666' },
      ],
      toSend: [{ ...DRAFT, status: 'approved' }],
      followUpsDue: [DUE],
    })
    apiMock.agency.approve.mockResolvedValue({ requests: [] })
    const wrapper = mountWith(PendingMessages)
    await flushPromises()
    const block = wrapper.get('[data-testid="pending-messages"]')
    expect(block.text()).toContain('Messages à valider')
    expect(block.text()).toContain('1 validé(s), en attente d’envoi par Claude')
    expect(block.text()).toContain('1 relance(s) due(s)')
    expect(block.findAll('[data-testid="draft-cancel"]')).toHaveLength(0)
    expect(block.text()).toContain('Voir le message')
    await block.findAll('[data-testid="draft-select"]')[1]?.setValue(false)
    await block.get('[data-testid="drafts-approve"]').trigger('click')
    await flushPromises()
    expect(apiMock.agency.approve).toHaveBeenCalledWith([DRAFT.id])
    expect(block.text()).toContain('Message validé : Claude peut l’envoyer.')

    apiMock.agency.pending.mockResolvedValue({
      toApprove: [],
      toSend: [],
      followUpsDue: [],
    })
    const empty = mountWith(PendingMessages)
    await flushPromises()
    expect(empty.find('[data-testid="pending-messages"]').exists()).toBe(false)
  })
})
