/**
 * La fiche d'une annonce, de bout en bout (lot 19 : sept onglets, en-tête
 * allégé, édition par section). API simulée, annonces fictives évaluées par
 * le vrai paquet `domain`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { DEFAULT_ASSUMPTIONS, DEFAULT_REGULATORY_RULES } from '@apart/contracts'
import {
  complianceReport,
  financialsFromListing,
  rentMarket,
  sensitivityGrid,
} from '@apart/domain'
import {
  MEMBERS,
  fakeAgencyRequest,
  fakeEvaluated,
  fakeExchanges,
  fakeOffer,
  fakeTargetPriceReport,
  fakeTask,
} from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  assumptions: { current: vi.fn() },
  listings: {
    get: vi.fn(),
    markSeen: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    recordPriceChange: vi.fn(),
    targetPrice: vi.fn(),
    sensitivity: vi.fn(),
    context: vi.fn(),
    checks: vi.fn(),
    criteriaFitHistory: vi.fn(),
  },
  links: { list: vi.fn() },
  searchCriteria: { list: vi.fn() },
  study: { compliance: vi.fn(), comparables: vi.fn() },
  scenarios: { list: vi.fn() },
  opinions: { upsertMine: vi.fn(), reveal: vi.fn() },
  tasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  offers: { create: vi.fn(), update: vi.fn() },
  whatsNew: { listingChanges: vi.fn() },
  visits: { list: vi.fn() },
  activity: { forListing: vi.fn() },
  agency: { exchanges: vi.fn(), settings: vi.fn() },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '@/lib/api'
import { installLeaveGuard } from '@/composables/useLeaveGuard'
import { useLeaveGuardStore } from '@/stores/leave-guard'
import { fakeContext } from '@/test/criteria-fixtures'
import ListingPanel from './ListingPanel.vue'

const A = DEFAULT_ASSUMPTIONS
const item = fakeEvaluated({}, { isNewForMe: true })

// Un test en échec ne laisse pas sa fiche dans le document pour les suivants.
enableAutoUnmount(afterEach)

function mountPanel(props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(ListingPanel, {
    props: { id: item.listing.id, ...props },
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { template: '<a data-router-link><slot /></a>' } },
    },
  })
}

const text = (): string =>
  (document.body.textContent ?? '').replace(/[\u202f\u00a0]/g, ' ')
const query = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.body.querySelector<T>(selector)

async function click(selector: string): Promise<void> {
  const el = query(selector)
  expect(el, selector).not.toBeNull()
  el?.click()
  await flushPromises()
}
async function openTab(id: string): Promise<void> {
  await click(`[data-testid="tab-${id}"]`)
}
async function type(selector: string, value: string): Promise<void> {
  const input = query<HTMLInputElement>(selector)
  expect(input, selector).not.toBeNull()
  if (!input) return
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('ListingPanel (lot 19 : une fiche, sept questions)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.workspace.mockResolvedValue({
      workspace: {
        id: MEMBERS[0]?.workspaceId,
        name: 'Espace',
        createdAt: '2026-11-03T10:00:00.000Z',
        members: MEMBERS,
      },
      me: MEMBERS[0],
    })
    apiMock.assumptions.current.mockResolvedValue({
      id: 'v1',
      workspaceId: MEMBERS[0]?.workspaceId,
      label: null,
      effectiveFrom: '2026-11-03T10:00:00.000Z',
      createdAt: '2026-11-03T10:00:00.000Z',
      values: A,
    })
    apiMock.listings.get.mockResolvedValue(item)
    apiMock.listings.markSeen.mockResolvedValue({ ...item, isNewForMe: false })
    apiMock.listings.targetPrice.mockResolvedValue(fakeTargetPriceReport(item))
    apiMock.listings.sensitivity.mockImplementation(
      (
        _id: string,
        request: {
          rowAxis: 'price'
          colAxis: 'rent'
          includeTargetPrice: boolean
        }
      ) =>
        Promise.resolve(
          sensitivityGrid(financialsFromListing(item.listing), A, request)
        )
    )
    apiMock.listings.context.mockResolvedValue(fakeContext())
    apiMock.listings.checks.mockResolvedValue([])
    apiMock.listings.criteriaFitHistory.mockResolvedValue({
      listingId: item.listing.id,
      items: [],
    })
    apiMock.links.list.mockResolvedValue({ items: [] })
    apiMock.searchCriteria.list.mockResolvedValue([])
    apiMock.study.compliance.mockResolvedValue(
      complianceReport(
        {
          dpeClass: 'D',
          dpeDate: '2023-01-01',
          constructionYear: 1975,
          leaseType: 'unfurnished',
          inseeCode: '33522',
          commune: 'Talence',
          surface: 45,
          rentControlled: false,
          targetRent: 750,
          rentCap: null,
          heatingType: null,
          coOwnershipAllowsRental: 'unknown',
          decencyCompliant: 'unknown',
          rentalPermitRequired: 'unknown',
        },
        DEFAULT_REGULATORY_RULES,
        null,
        { rentalStartDate: '2028-01-01', at: new Date('2026-11-03T10:00:00Z') }
      )
    )
    apiMock.study.comparables.mockResolvedValue({
      items: [],
      market: rentMarket([], {
        listingId: item.listing.id,
        surface: 45,
        furnished: false,
        targetRent: 750,
        rentCap: null,
        at: new Date('2026-11-03T10:00:00Z'),
      }),
    })
    apiMock.scenarios.list.mockResolvedValue([])
    apiMock.offers.create.mockResolvedValue({
      offer: fakeOffer(),
      offers: [fakeOffer()],
      currentStatus: 'to_study',
      suggestedStatus: 'offer_made',
    })
    apiMock.whatsNew.listingChanges.mockResolvedValue({
      listingId: item.listing.id,
      since: null,
      changedFields: [],
      entries: [],
    })
    apiMock.visits.list.mockResolvedValue([])
    apiMock.activity.forListing.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 200,
      pageCount: 0,
    })
    apiMock.agency.exchanges.mockResolvedValue(fakeExchanges())
    apiMock.agency.settings.mockResolvedValue({
      signature: 'Richard et Chloé',
      defaultSignature: 'Richard et Chloé',
      custom: false,
    })
    apiMock.listings.setStatus.mockResolvedValue({
      ...item,
      listing: { ...item.listing, status: 'to_visit' },
    })
    apiMock.listings.update.mockResolvedValue(item)
  })

  it('ouvre sur la Synthèse : en-tête allégé, sept onglets, la question, quatre chiffres ; marque l’annonce vue', async () => {
    mountPanel()
    await flushPromises()
    expect(query('h1')?.textContent?.trim()).toBe('T2 fictif')
    const facts = query('[data-testid="listing-facts"]')?.textContent ?? ''
    expect(facts.replace(/[\u202f\u00a0]/g, ' ')).toContain('200 000 €')
    expect(query('[data-testid="listing-header"]')?.textContent).not.toContain(
      'Ajoutée le'
    )
    expect(query('[data-testid="edit-listing"]')).toBeNull()
    expect(
      [...document.body.querySelectorAll('[role="tab"]')].map(t =>
        t.getAttribute('data-testid')
      )
    ).toEqual([
      'tab-synthese',
      'tab-bien',
      'tab-budget',
      'tab-negocier',
      'tab-quartier',
      'tab-a-faire',
      'tab-historique',
    ])
    expect(query('[data-testid="tab-question"]')?.textContent?.trim()).toBe(
      'Faut-il y aller ?'
    )
    expect(document.body.querySelectorAll('[data-figure]')).toHaveLength(4)
    // Une tâche ouverte : la pastille de « À faire ».
    expect(query('[data-testid="todo-count"]')?.textContent).toContain('1')
    expect(apiMock.listings.markSeen).toHaveBeenCalledWith(item.listing.id)
    // Les onglets non ouverts ne chargent rien (sensibilité, journal).
    expect(apiMock.listings.sensitivity).not.toHaveBeenCalled()
    expect(apiMock.activity.forListing).not.toHaveBeenCalled()
  })

  it('l’onglet est un v-model : il se lit dans la prop, se signale au changement, et chaque chiffre ouvre son onglet', async () => {
    const wrapper = mountPanel({ tab: 'negocier' })
    await flushPromises()
    expect(
      query('[data-testid="tab-negocier"]')?.getAttribute('aria-selected')
    ).toBe('true')
    expect(query('[data-testid="tab-question"]')?.textContent?.trim()).toBe(
      'Combien proposer ?'
    )
    await openTab('historique')
    expect(wrapper.emitted('update:tab')).toEqual([['historique']])
    await wrapper.setProps({ tab: 'synthese' })
    await flushPromises()
    await click('[data-figure="total_cost"]')
    expect(wrapper.emitted('update:tab')?.at(-1)).toEqual(['budget'])
  })

  it('Le bien : « Modifier les travaux » ouvre l’édition sur place, l’aperçu suit, la Synthèse passe en direct ; l’enregistrement envoie les travaux seuls', async () => {
    const wrapper = mountPanel({ tab: 'bien' })
    await flushPromises()
    expect(query('[data-testid="tab-question"]')?.textContent?.trim()).toBe(
      'Qu’est-ce qu’on achète ?'
    )
    await click('[data-testid="edit-works"]')
    expect(query('[data-testid="section-preview"]')).not.toBeNull()
    const before = query('[data-testid="preview-total-cost"]')?.textContent
    const amounts = document.body.querySelectorAll<HTMLInputElement>(
      '[data-section="works"] input[inputmode="numeric"]'
    )
    const second = [...amounts].find(input => input.value === '')
    expect(second).toBeDefined()
    if (second) {
      second.value = '3000'
      second.dispatchEvent(new Event('input'))
    }
    await flushPromises()
    expect(query('[data-testid="preview-total-cost"]')?.textContent).not.toBe(
      before
    )
    expect(text()).toMatch(/\d/)
    // La Synthèse montre l'aperçu en direct (le brouillon reste ouvert en dessous).
    await wrapper.setProps({ tab: 'synthese' })
    await flushPromises()
    expect(query('[data-testid="live-badge"]')).not.toBeNull()
    await wrapper.setProps({ tab: 'bien' })
    await flushPromises()
    query<HTMLFormElement>('[data-section="works"] form')?.dispatchEvent(
      new Event('submit', { cancelable: true })
    )
    await flushPromises()
    expect(apiMock.listings.update).toHaveBeenCalledTimes(1)
    const [id, patch] = apiMock.listings.update.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(id).toBe(item.listing.id)
    expect(Object.keys(patch).sort()).toEqual([
      'expectedUpdatedAt',
      'renovation',
    ])
    expect(patch.expectedUpdatedAt).toBe(item.listing.updatedAt)
    expect(
      (patch.renovation as { items: { amount: number | null }[] }).items.map(
        i => i.amount
      )
    ).toEqual([2500, 3000])
    expect(text()).toContain('« Travaux avant d’emménager » enregistré.')
  })

  it('lot 20 : « Mon avis » passe par la même garde ; enregistré, la fiche le dit', async () => {
    apiMock.opinions.upsertMine.mockResolvedValue({})
    const wrapper = mountPanel()
    await flushPromises()
    await click('[data-testid="opinion-edit"]')
    expect(query('[data-testid="my-opinion-form"]')).not.toBeNull()
    // Pas d'aperçu en direct pour un avis : les chiffres ne bougent pas.
    expect(query('[data-testid="live-badge"]')).toBeNull()
    await click('[data-criterion="quiet"] [role="radio"][data-value="3"]')
    await openTab('budget')
    expect(wrapper.emitted('update:tab')).toBeUndefined()
    expect(text()).toContain(
      'La section « Mon avis » a des modifications qui seront perdues.'
    )
    await click('[data-testid="unsaved-stay"]')
    query<HTMLFormElement>('[data-testid="my-opinion-form"]')?.dispatchEvent(
      new Event('submit', { cancelable: true })
    )
    await flushPromises()
    expect(apiMock.opinions.upsertMine).toHaveBeenCalledWith(item.listing.id, {
      rating: 0,
      text: '',
      scores: { quiet: { score: 3, word: null } },
      expectedUpdatedAt: null,
    })
    expect(text()).toContain('Avis enregistré.')
    expect(query('[data-testid="my-opinion-form"]')).toBeNull()
  })

  it('quitter une section modifiée (autre onglet, fermeture) demande confirmation, sans window.confirm', async () => {
    const confirm = vi.fn()
    const original = window.confirm
    window.confirm = confirm
    const wrapper = mountPanel({ tab: 'bien' })
    await flushPromises()
    await click('[data-testid="edit-notes"]')
    await type('#f-notes', 'Vu en visite')
    await openTab('budget')
    expect(wrapper.emitted('update:tab')).toBeUndefined()
    const bar = query('[data-testid="unsaved-changes"]')
    expect(bar?.getAttribute('role')).toBe('alertdialog')
    expect(bar?.textContent).toContain(
      '« Description de l’annonce et nos notes »'
    )
    await click('[data-testid="unsaved-stay"]')
    expect(query('[data-testid="unsaved-changes"]')).toBeNull()
    expect(query<HTMLTextAreaElement>('#f-notes')?.value ?? '').toBe(
      'Vu en visite'
    )
    await click('[data-testid="listing-back"]')
    expect(wrapper.emitted('close')).toBeUndefined()
    await click('[data-testid="unsaved-leave"]')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(apiMock.listings.update).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    window.confirm = original
  })

  it('lot 22 : le bouton retour sur une section modifiée montre le même bandeau, puis navigue si on abandonne', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/annonces', component: { render: () => null } },
        { path: '/annonces/:id', component: { render: () => null } },
      ],
    })
    installLeaveGuard(router, () => useLeaveGuardStore(), {
      addEventListener: () => undefined,
      history: { state: null } as unknown as History,
    })
    await router.push(`/annonces/${item.listing.id}?onglet=bien`)
    mountPanel({ tab: 'bien' })
    await flushPromises()
    await click('[data-testid="edit-notes"]')
    await type('#f-notes', 'Vu en visite')
    await router.push('/annonces')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(`/annonces/${item.listing.id}`)
    const bar = query('[data-testid="unsaved-changes"]')
    expect(bar?.textContent).toContain(
      '« Description de l’annonce et nos notes »'
    )
    expect(document.activeElement?.getAttribute('data-testid')).toBe(
      'unsaved-stay'
    )
    // Changer d'onglet par l'URL est aussi une sortie de la section.
    await click('[data-testid="unsaved-stay"]')
    await router.push(`/annonces/${item.listing.id}?onglet=budget`)
    await flushPromises()
    expect(router.currentRoute.value.query.onglet).toBe('bien')
    await click('[data-testid="unsaved-leave"]')
    await flushPromises()
    expect(router.currentRoute.value.query.onglet).toBe('budget')
    await router.push('/annonces')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/annonces')
    expect(apiMock.listings.update).not.toHaveBeenCalled()
  })

  it('lot 22 : une fiche illisible dit pourquoi et propose « Réessayer »', async () => {
    apiMock.listings.get.mockRejectedValueOnce(
      new ApiError(500, 'Le serveur ne répond pas.')
    )
    mountPanel()
    await flushPromises()
    expect(query('[role="alert"]')?.textContent).toContain(
      'Le serveur ne répond pas.'
    )
    expect(text()).not.toContain('Chargement')
    await click('[data-testid="retry"]')
    await flushPromises()
    expect(apiMock.listings.get).toHaveBeenCalledTimes(2)
    expect(query('[data-testid="listing-header"]')).not.toBeNull()
  })

  it('lot 22 : « Annuler » après la réponse du vendeur remet la réponse d’avant', async () => {
    const offer = fakeOffer({ response: 'pending', counterAmount: null })
    const withOffer = fakeEvaluated({}, { offers: [offer] })
    apiMock.listings.get.mockResolvedValue(withOffer)
    apiMock.listings.markSeen.mockResolvedValue(withOffer)
    apiMock.offers.update.mockResolvedValue({
      offer,
      suggestedStatus: null,
    })
    const wrapper = mountPanel({ tab: 'negocier' })
    await flushPromises()
    wrapper
      .findComponent({ name: 'NegotiateTab' })
      .vm.$emit('updateOffer', offer.id, {
        response: 'countered',
        counterAmount: 190_000,
      })
    await flushPromises()
    expect(text()).toContain('Réponse enregistrée.')
    await click('[data-testid="feedback-action"]')
    await flushPromises()
    expect(apiMock.offers.update).toHaveBeenLastCalledWith(
      withOffer.listing.id,
      offer.id,
      { response: 'pending', counterAmount: null }
    )
  })

  it('lot 22 : un refus d’offre se dit sous « Prix et offres », plus en haut de la fiche', async () => {
    apiMock.offers.create.mockRejectedValueOnce(
      new ApiError(409, 'La fiche a changé entre-temps.')
    )
    const wrapper = mountPanel({ tab: 'negocier' })
    await flushPromises()
    wrapper
      .findComponent({ name: 'NegotiateTab' })
      .vm.$emit('addOffer', { amount: 1, channel: null, notes: null })
    await flushPromises()
    expect(query('[data-testid="negotiate-error"]')?.textContent).toContain(
      'La fiche a changé entre-temps.'
    )
  })

  it('« Préciser l’adresse » mène à Le bien, section de l’adresse ouverte, champ atteint', async () => {
    const pending = fakeEvaluated(
      {
        location: {
          ...item.listing.location,
          addressRaw: null,
          precision: 'district',
          placement: null,
        },
      },
      {
        criteriaFit: {
          ...item.criteriaFit,
          level: 'to_confirm',
          activeCriteria: 1,
          locationPending: true,
          name: '[Exemple] Talence',
        },
      }
    )
    apiMock.listings.get.mockResolvedValue(pending)
    apiMock.listings.markSeen.mockResolvedValue(pending)
    const wrapper = mountPanel()
    await flushPromises()
    await click('[data-testid="fit-toggle"]')
    await click('[data-testid="fit-precise"]')
    expect(wrapper.emitted('update:tab')).toEqual([['bien']])
    await wrapper.setProps({ tab: 'bien' })
    await flushPromises()
    await flushPromises()
    expect(
      query('[data-section="listing"]')?.getAttribute('data-editing')
    ).toBe('true')
    expect(document.activeElement?.id).toBe('f-address')
  })

  it('Négocier : la sensibilité n’est demandée qu’à l’ouverture ; une offre propose le statut sans le forcer', async () => {
    mountPanel({ tab: 'negocier' })
    await flushPromises()
    expect(apiMock.listings.sensitivity).not.toHaveBeenCalled()
    const details = query<HTMLDetailsElement>('[data-testid="sensitivity"]')
    if (details) {
      details.open = true
      details.dispatchEvent(new Event('toggle'))
    }
    await flushPromises()
    expect(apiMock.listings.sensitivity).toHaveBeenCalled()
    await type('input[aria-label="Montant de l\'offre"]', '150000')
    query<HTMLFormElement>(
      'form[aria-label="Préparer une offre"]'
    )?.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    expect(apiMock.offers.create).toHaveBeenCalledWith(item.listing.id, {
      amount: 150_000,
      channel: null,
      notes: null,
    })
    const suggestion = query('[data-testid="suggested-status"]')
    expect(suggestion?.textContent).toContain('Offre faite')
    expect(apiMock.listings.setStatus).not.toHaveBeenCalled()
    suggestion?.querySelector('button')?.click()
    await flushPromises()
    expect(apiMock.listings.setStatus).toHaveBeenCalledWith(item.listing.id, {
      status: 'offer_made',
      reason: null,
      expectedStatus: 'to_study',
    })
  })

  it('change le statut avec le garde-fou du statut courant', async () => {
    mountPanel()
    await flushPromises()
    const select = query<HTMLSelectElement>(
      'select[aria-label="Changer le statut"]'
    )
    expect(select).not.toBeNull()
    if (select) {
      select.value = 'to_visit'
      select.dispatchEvent(new Event('change'))
    }
    await flushPromises()
    expect(apiMock.listings.setStatus).toHaveBeenCalledWith(item.listing.id, {
      status: 'to_visit',
      reason: null,
      expectedStatus: 'to_study',
    })
  })

  it('Budget : retient le loyer de marché dans la phase 2 avec le garde-fou ; sans phase 2, invite à la renseigner', async () => {
    const wrapper = mountPanel({ tab: 'budget' })
    await flushPromises()
    expect(query('[data-testid="tab-question"]')?.textContent?.trim()).toBe(
      'Peut-on se le permettre, et après ?'
    )
    expect(text()).toContain('Calculé avec les hypothèses de l’espace')
    wrapper
      .findComponent({ name: 'BudgetTab' })
      .vm.$emit('retainMarketRent', 765)
    await flushPromises()
    expect(apiMock.listings.update).toHaveBeenCalledWith(item.listing.id, {
      rentalPlan: { ...item.listing.rentalPlan, marketRent: 765 },
      expectedUpdatedAt: item.listing.updatedAt,
    })
    expect(text()).toContain('Loyer de marché retenu')
    wrapper.unmount()

    const withoutPlan = fakeEvaluated(
      { rentalPlan: null },
      { isNewForMe: false }
    )
    apiMock.listings.get.mockResolvedValue(withoutPlan)
    apiMock.listings.markSeen.mockResolvedValue(withoutPlan)
    apiMock.listings.update.mockClear()
    const bare = mountPanel({ tab: 'budget' })
    await flushPromises()
    bare.findComponent({ name: 'BudgetTab' }).vm.$emit('retainMarketRent', 700)
    await flushPromises()
    expect(apiMock.listings.update).not.toHaveBeenCalled()
    expect(text()).toContain('Renseigne d’abord le loyer visé')
  })

  it('À faire et Historique : la liste fusionnée et la chronologie se chargent à l’ouverture', async () => {
    apiMock.agency.exchanges.mockResolvedValue(
      fakeExchanges({
        requests: [
          fakeAgencyRequest({
            id: '99999999-0000-4999-8999-000000000001',
            status: 'draft',
            sentAt: null,
          }),
        ],
      })
    )
    const withTasks = fakeEvaluated(
      {},
      {
        tasks: [
          fakeTask(),
          fakeTask({
            id: 'cccccccc-0000-4ccc-8ccc-000000000002',
            label: 'Vérifier la cave',
            origin: 'manual',
            position: 1,
          }),
        ],
      }
    )
    apiMock.listings.get.mockResolvedValue(withTasks)
    apiMock.listings.markSeen.mockResolvedValue(withTasks)
    mountPanel()
    await flushPromises()
    // Deux tâches ouvertes et un message à valider.
    expect(query('[data-testid="todo-count"]')?.textContent).toContain('3')
    await openTab('a-faire')
    expect(query('[data-testid="tab-question"]')?.textContent?.trim()).toBe(
      'Qu’est-ce qu’il reste à faire ?'
    )
    expect(query('[data-testid="todo-progress"]')?.textContent).toContain(
      '0 sur 2 faits'
    )
    expect(apiMock.visits.list).toHaveBeenCalledWith(withTasks.listing.id)
    await openTab('historique')
    expect(apiMock.activity.forListing).toHaveBeenCalledWith(
      withTasks.listing.id,
      expect.objectContaining({ page: 1, limit: 200 })
    )
    expect(query('[data-testid="history-footer"]')?.textContent).toContain(
      'Ajoutée le'
    )
  })

  it('montre l’adéquation dans l’en-tête et le message de création', async () => {
    const matched = {
      ...item,
      isNewForMe: false,
      criteriaFit: {
        ...item.criteriaFit,
        level: 'in' as const,
        activeCriteria: 1,
        criteriaId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        name: 'Talence fictif',
      },
    }
    apiMock.listings.get.mockResolvedValue(matched)
    apiMock.listings.markSeen.mockResolvedValue(matched)
    mountPanel({
      notice: 'Annonce créée. Entre dans le critère « Talence fictif ».',
    })
    await flushPromises()
    expect(
      query('[data-testid="listing-pills"] [data-testid="fit-badge"]')
        ?.textContent
    ).toContain('Dans les critères')
    expect(text()).toContain('Entre dans le critère « Talence fictif »')
  })

  it('lit ce qui a changé avant de marquer la fiche vue ; les champs changés se marquent dans Le bien', async () => {
    const seen = fakeEvaluated({}, { isNewForMe: false })
    apiMock.listings.get.mockResolvedValue(seen)
    apiMock.listings.markSeen.mockResolvedValue(seen)
    let resolveChanges: (value: unknown) => void = () => undefined
    apiMock.whatsNew.listingChanges.mockReturnValue(
      new Promise(resolve => {
        resolveChanges = resolve
      })
    )
    const wrapper = mountPanel()
    await flushPromises()
    // Tant que les changements ne sont pas lus, la fiche n'est pas marquée vue.
    expect(apiMock.listings.markSeen).not.toHaveBeenCalled()
    resolveChanges({
      listingId: seen.listing.id,
      since: '2026-11-02T10:00:00.000Z',
      changedFields: ['surface'],
      entries: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          createdAt: '2026-11-03T09:00:00.000Z',
          action: 'listing.updated',
          kind: 'listing',
          channel: 'web',
          channelLabel: 'Web',
          actor: { id: MEMBERS[1]?.id, handle: 'chloe', displayName: 'Chloé' },
          listing: { id: seen.listing.id, title: 'T2 fictif' },
          summary: 'a modifié la fiche',
          changes: [
            {
              field: 'surface',
              label: 'Surface Carrez',
              before: '44 m²',
              after: '45 m²',
            },
          ],
        },
      ],
    })
    await flushPromises()
    expect(apiMock.listings.markSeen).toHaveBeenCalledTimes(1)
    const box = query('[data-testid="listing-changes"]')
    expect(box?.textContent).toContain('Chloé')
    expect(box?.textContent).toContain('a modifié la fiche')
    await wrapper.setProps({ tab: 'bien' })
    await flushPromises()
    expect(query('[data-section="features"]')?.textContent).toContain('modifié')
  })
})
