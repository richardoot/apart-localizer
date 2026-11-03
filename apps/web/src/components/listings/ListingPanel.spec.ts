import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import { MEMBERS, fakeEvaluated } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  assumptions: { current: vi.fn() },
  listings: {
    get: vi.fn(),
    markSeen: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    recordPriceChange: vi.fn(),
  },
  opinions: { upsertMine: vi.fn() },
  tasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
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
