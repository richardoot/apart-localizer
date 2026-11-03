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
  },
  opinions: { upsertMine: vi.fn() },
  tasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  offers: { create: vi.fn(), update: vi.fn() },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

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
})
