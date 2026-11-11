import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { fakeCriteria } from '@/test/criteria-fixtures'
import { fakeEvaluated } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  listings: { list: vi.fn() },
  searchCriteria: { list: vi.fn() },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRouter: () => ({ push: vi.fn() }) }
})

import DashboardPage from './DashboardPage.vue'

function mountPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(DashboardPage, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.workspace.mockResolvedValue({
      workspace: { id: 'w', name: 'Espace fictif' },
      members: [],
    })
    apiMock.listings.list.mockResolvedValue({
      items: [fakeEvaluated({}, { isNewForMe: true })],
      total: 1,
    })
    apiMock.searchCriteria.list.mockResolvedValue([fakeCriteria()])
  })

  it('compte les annonces de chaque critère actif et les nouvelles pour moi (G6)', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(apiMock.searchCriteria.list).toHaveBeenCalledWith(false)
    // Lot 14 : la synthèse compte toutes les annonces, hors critères comprises.
    expect(apiMock.listings.list).toHaveBeenCalledWith(
      expect.objectContaining({ fit: ['in', 'to_confirm', 'margin', 'out'] })
    )
    const row = wrapper.get(
      '[data-criteria-count="cccccccc-cccc-4ccc-8ccc-cccccccccccc"]'
    )
    expect(row.text()).toContain('Talence fictif')
    expect(row.text()).toContain('3 annonces')
    expect(row.text()).toContain('1 nouvelle')
    expect(row.text()).toContain('dont 1 à confirmer')
    wrapper.unmount()
  })

  it('sans critère, pas de bloc', async () => {
    apiMock.searchCriteria.list.mockResolvedValue([])
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[aria-label="Critères de recherche"]').exists()).toBe(
      false
    )
    expect(wrapper.text()).toContain('Nouvelles annonces')
    wrapper.unmount()
  })
})
