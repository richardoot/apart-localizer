import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import { DEFAULT_ASSUMPTIONS as A } from '@apart/contracts'
import { financialsFromListing, sensitivityGrid } from '@apart/domain'
import {
  MEMBERS,
  fakeEvaluated,
  fakeOffer,
  fakeTargetPriceReport,
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
  },
  opinions: { upsertMine: vi.fn() },
  tasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  offers: { create: vi.fn(), update: vi.fn() },
  whatsNew: { listingChanges: vi.fn() },
  visits: { list: vi.fn() },
  activity: { forListing: vi.fn() },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import { fakeContext } from '@/test/criteria-fixtures'
import ListingPanel from './ListingPanel.vue'

const item = fakeEvaluated({}, { isNewForMe: true })

function mountPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(ListingPanel, {
    props: { id: item.listing.id },
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
    },
  })
}

describe('ListingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.listings.context.mockResolvedValue(fakeContext())
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
      values: DEFAULT_ASSUMPTIONS,
    })
    apiMock.listings.get.mockResolvedValue(item)
    apiMock.listings.targetPrice.mockResolvedValue(fakeTargetPriceReport(item))
    apiMock.listings.sensitivity.mockImplementation(
      (_id: string, request: { rowAxis: 'price'; colAxis: 'rent' }) =>
        Promise.resolve(
          sensitivityGrid(financialsFromListing(item.listing), A, request)
        )
    )
    apiMock.offers.create.mockResolvedValue({
      offer: fakeOffer(),
      offers: [fakeOffer()],
      currentStatus: 'to_study',
      suggestedStatus: 'offer_made',
    })
    apiMock.listings.markSeen.mockResolvedValue({ ...item, isNewForMe: false })
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
      limit: 30,
      pageCount: 0,
    })
    apiMock.listings.setStatus.mockResolvedValue({
      ...item,
      listing: { ...item.listing, status: 'to_visit' },
    })
  })

  it("affiche la fiche, le badge « nouvelle », et marque l'annonce vue à l'ouverture", async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(apiMock.listings.get).toHaveBeenCalledWith(item.listing.id)
    expect(document.body.textContent).toContain('T2 fictif')
    expect(apiMock.listings.markSeen).toHaveBeenCalledTimes(1)
    expect(apiMock.listings.markSeen).toHaveBeenCalledWith(item.listing.id)
    expect(document.body.textContent).toContain('Compatibilité location')
    expect(document.body.textContent).toContain('À faire pour cette annonce')
    expect(document.body.textContent).toContain('Nos avis')
    // Lot 3 : prix cible (rapport serveur), sensibilité, historique des offres.
    expect(apiMock.listings.targetPrice).toHaveBeenCalledWith(item.listing.id)
    expect(apiMock.listings.sensitivity).toHaveBeenCalledWith(item.listing.id, {
      rowAxis: 'price',
      colAxis: 'rent',
    })
    expect(document.body.textContent).toContain('À partir de quel prix ?')
    expect(
      document.body.querySelector('[data-testid="rank"]')?.textContent
    ).toContain('sur 3')
    expect(
      document.body.querySelector('[data-testid="sensitivity-grid"]')
    ).not.toBeNull()
    expect(document.body.textContent).toContain(
      'Historique des prix et des offres'
    )
    // Lot 4 : le bloc « Contexte » (tram, DPE, encadrement, DVF).
    expect(apiMock.listings.context).toHaveBeenCalledWith(item.listing.id)
    expect(document.body.textContent).toContain('Contexte (données ouvertes)')
    expect(document.body.textContent).toContain('Arrêt fictif')
    // Lot 5 : l'étude en onglets, phase 1 ouverte.
    expect(document.body.textContent).toContain("Coût d'occupation")
    wrapper.unmount()
  })

  it('enregistre une offre puis propose le statut suggéré sans le forcer', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const amount = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Montant de l\'offre"]'
    )
    expect(amount).not.toBeNull()
    if (amount) {
      amount.value = '150000'
      amount.dispatchEvent(new Event('input'))
    }
    document.body
      .querySelector<HTMLFormElement>('form[aria-label="Nouvelle offre"]')
      ?.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    expect(apiMock.offers.create).toHaveBeenCalledWith(item.listing.id, {
      amount: 150_000,
      channel: null,
      notes: null,
    })
    const suggestion = document.body.querySelector(
      '[data-testid="suggested-status"]'
    )
    expect(suggestion?.textContent).toContain('Offre faite')
    expect(apiMock.listings.setStatus).not.toHaveBeenCalled()
    suggestion?.querySelector('button')?.click()
    await flushPromises()
    expect(apiMock.listings.setStatus).toHaveBeenCalledWith(item.listing.id, {
      status: 'offer_made',
      reason: null,
      expectedStatus: 'to_study',
    })
    wrapper.unmount()
  })

  it('change le statut avec le garde-fou du statut courant', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const select = document.body.querySelector<HTMLSelectElement>(
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
    wrapper.unmount()
  })

  it('retient le loyer de marché estimé dans la phase 2, avec le garde-fou', async () => {
    apiMock.listings.update.mockResolvedValue(item)
    const wrapper = mountPanel()
    await flushPromises()
    const study = wrapper.findComponent({ name: 'StudySection' })
    study.vm.$emit('retainMarketRent', 765)
    await flushPromises()
    expect(apiMock.listings.update).toHaveBeenCalledWith(item.listing.id, {
      rentalPlan: { ...item.listing.rentalPlan, marketRent: 765 },
      expectedUpdatedAt: item.listing.updatedAt,
    })
    expect(document.body.textContent).toContain('Loyer de marché retenu')
    wrapper.unmount()
  })

  it('sans phase 2 : invite à la créer avant de retenir un loyer de marché', async () => {
    const withoutPlan = fakeEvaluated(
      { rentalPlan: null },
      { isNewForMe: false }
    )
    apiMock.listings.get.mockResolvedValueOnce(withoutPlan)
    apiMock.listings.markSeen.mockResolvedValueOnce(withoutPlan)
    const wrapper = mountPanel()
    await flushPromises()
    wrapper
      .findComponent({ name: 'StudySection' })
      .vm.$emit('retainMarketRent', 700)
    await flushPromises()
    expect(apiMock.listings.update).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Ajoutez d’abord la phase 2')
    wrapper.unmount()
  })

  it('montre les critères de l’annonce et le message de création', async () => {
    const matched = {
      ...item,
      isNewForMe: false,
      criteriaMatches: [
        {
          criteriaId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          name: 'Talence fictif',
          matchedAt: '2026-11-03T10:00:00.000Z',
          approximate: false,
        },
      ],
    }
    apiMock.listings.get.mockResolvedValue(matched)
    apiMock.listings.markSeen.mockResolvedValue(matched)
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = mount(ListingPanel, {
      props: {
        id: item.listing.id,
        notice: 'Annonce créée. Entre dans le critère « Talence fictif ».',
      },
      attachTo: document.body,
      global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
    })
    await flushPromises()
    expect(document.body.textContent).toContain('◎ Talence fictif')
    expect(document.body.textContent).toContain(
      'Entre dans le critère « Talence fictif »'
    )
    wrapper.unmount()
  })

  it('lit ce qui a changé avant de marquer la fiche vue, et met les champs en évidence', async () => {
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
      changedFields: ['price', 'rentalPlan', 'rentalPlan.targetRent'],
      entries: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          createdAt: '2026-11-03T09:00:00.000Z',
          action: 'listing.price_changed',
          kind: 'price',
          channel: 'web',
          channelLabel: 'Web',
          actor: { id: MEMBERS[1]?.id, handle: 'chloe', displayName: 'Chloé' },
          listing: { id: seen.listing.id, title: 'T2 fictif' },
          summary: 'a enregistré un nouveau prix',
          changes: [
            {
              field: 'price',
              label: 'Prix',
              before: '210 000 €',
              after: '200 000 €',
            },
          ],
        },
      ],
    })
    await flushPromises()
    expect(apiMock.listings.markSeen).toHaveBeenCalledTimes(1)
    const box = document.body.querySelector('[data-testid="listing-changes"]')
    expect(box?.textContent).toContain('Chloé')
    expect(box?.textContent).toContain('a enregistré un nouveau prix')
    expect(box?.textContent).toContain('210 000 €')
    expect(
      document.body.querySelector('[data-testid="changed-count"]')?.textContent
    ).toContain('3 champ(s) modifié(s)')
    const changed = [...document.body.querySelectorAll('[data-changed="true"]')]
    expect(
      changed.map(el => el.querySelector('label')?.getAttribute('for'))
    ).toEqual(['f-price', 'f-rent'])
    wrapper.unmount()
  })

  it('ouvre les onglets Visites et Journal', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    ;(
      document.body.querySelector('[data-testid="tab-visits"]') as HTMLElement
    ).click()
    await flushPromises()
    expect(apiMock.visits.list).toHaveBeenCalledWith(item.listing.id)
    expect(document.body.textContent).toContain("Aucune visite pour l'instant.")
    ;(
      document.body.querySelector('[data-testid="tab-journal"]') as HTMLElement
    ).click()
    await flushPromises()
    expect(apiMock.activity.forListing).toHaveBeenCalledWith(item.listing.id, {
      page: 1,
      limit: 30,
    })
    expect(document.body.textContent).toContain('Rien dans le journal.')
    wrapper.unmount()
  })
})
