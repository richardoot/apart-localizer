import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { fakeCriteria } from '@/test/criteria-fixtures'
import { useLeaveGuardStore } from '@/stores/leave-guard'

const apiMock = vi.hoisted(() => ({
  searchCriteria: {
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    preview: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import CriteriaPage from './CriteriaPage.vue'

function mountPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(CriteriaPage, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

describe('CriteriaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.searchCriteria.list.mockResolvedValue([
      fakeCriteria(),
      fakeCriteria({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        name: 'Archivé',
        active: false,
        perimeter: null,
        perimeterType: null,
        listingCount: 0,
        newCount: 0,
        approximateCount: 0,
      }),
    ])
    apiMock.searchCriteria.update.mockResolvedValue(fakeCriteria())
    apiMock.searchCriteria.remove.mockResolvedValue(undefined)
  })

  it('liste les critères avec leurs compteurs ; archive et supprime', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(apiMock.searchCriteria.list).toHaveBeenCalledWith(false)
    const first = wrapper.get(
      '[data-criteria="cccccccc-cccc-4ccc-8ccc-cccccccccccc"]'
    )
    expect(first.text()).toContain('Talence fictif')
    expect(first.get('[data-testid="count"]').text()).toBe('3')
    expect(first.text()).toContain('1 nouvelle')
    expect(first.text()).toContain('dont 1 à confirmer faute d’adresse')
    // Lot 14 : annonces par niveau d'adéquation et marges appliquées.
    expect(
      first.findAll('[data-testid="fit-counts"] [data-fit]').map(b => b.text())
    ).toEqual([
      'Dans les critères · 2',
      'À confirmer · 1',
      'À la marge · 0',
      'Hors critères · 1',
    ])
    expect(first.get('[data-testid="tolerance-summary"]').text()).toBe(
      'Marges appliquées : périmètre 300 m, prix +5 %.'
    )
    expect(first.text()).toContain('Polygone dessiné')
    expect(first.text()).toContain('≤ 200')
    expect(first.text()).toContain('Voir les annonces')
    await first.get('[data-action="archive"]').trigger('click')
    expect(apiMock.searchCriteria.update).toHaveBeenCalledWith(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      { active: false, expectedUpdatedAt: '2026-11-03T10:00:00.000Z' }
    )
    await flushPromises()
    // Lot 22 : la suppression se confirme sur place, sans `window.confirm`.
    const confirm = vi.fn()
    vi.stubGlobal('confirm', confirm)
    await first.get('[data-action="delete"]').trigger('click')
    expect(apiMock.searchCriteria.remove).not.toHaveBeenCalled()
    expect(first.text()).toContain(
      'Supprimer définitivement le critère « Talence fictif » ?'
    )
    await first.get('[data-action="confirm-delete"]').trigger('click')
    expect(confirm).not.toHaveBeenCalled()
    expect(apiMock.searchCriteria.remove).toHaveBeenCalledWith(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    )
    const archived = wrapper.get(
      '[data-criteria="dddddddd-dddd-4ddd-8ddd-dddddddddddd"]'
    )
    expect(archived.text()).toContain('Réactiver')
    wrapper.unmount()
  })

  it('montre les archivés à la demande', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(apiMock.searchCriteria.list).toHaveBeenLastCalledWith(true)
    wrapper.unmount()
  })

  it('lot 22 : fermer un critère modifié demande confirmation', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const create = wrapper
      .findAll('button')
      .find(b => b.text().includes('Nouveau critère'))
    await create?.trigger('click')
    await flushPromises()
    const close = () =>
      (
        document.body.querySelector('[aria-label="Fermer"]') as HTMLElement
      ).click()
    // Rien de saisi : le panneau se ferme.
    close()
    await flushPromises()
    expect(document.body.querySelector('#c-name')).toBeNull()

    await create?.trigger('click')
    await flushPromises()
    const name = document.body.querySelector('#c-name') as HTMLInputElement
    name.value = 'Talence sud'
    name.dispatchEvent(new Event('input'))
    await flushPromises()
    close()
    await flushPromises()
    const guard = useLeaveGuardStore()
    expect(guard.pending?.title).toBe('Nouveau critère')
    expect(document.body.querySelector('#c-name')).not.toBeNull()
    guard.stay()
    await flushPromises()
    expect(document.body.querySelector('#c-name')).not.toBeNull()
    close()
    guard.confirmLeave()
    await flushPromises()
    expect(document.body.querySelector('#c-name')).toBeNull()
    wrapper.unmount()
  })
})
