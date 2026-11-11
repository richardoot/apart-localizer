/**
 * Lot 22 : « Nouvelle annonce » passe par la garde des modifications
 * (fermeture du panneau, bouton retour), et un nombre illisible est refusé
 * au champ avec le focus dessus. API simulée ; données fictives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { RouteLocationNormalized } from 'vue-router'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import { MEMBERS, fakeEvaluated } from '@/test/fixtures'
import { useLeaveGuardStore } from '@/stores/leave-guard'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  assumptions: { current: vi.fn() },
  listings: { extract: vi.fn(), create: vi.fn() },
  drafts: { get: vi.fn(), decide: vi.fn(), list: vi.fn(), merge: vi.fn() },
  links: { add: vi.fn() },
}))
vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRoute: () => ({ query: {} }) }
})
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import ListingCreatePanel from './ListingCreatePanel.vue'

function mountPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(ListingCreatePanel, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}
const el = <T extends Element = HTMLElement>(selector: string): T => {
  const found = document.body.querySelector<T>(selector)
  if (!found) throw new Error(`introuvable : ${selector}`)
  return found
}
async function fill(selector: string, value: string): Promise<void> {
  const input = el<HTMLInputElement>(selector)
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}
async function manual(): Promise<void> {
  ;[
    ...document.body.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Mode de saisie"] button'
    ),
  ][1]?.click()
  await flushPromises()
}
const cancelButton = () =>
  [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    b => b.textContent?.trim() === 'Annuler'
  )
const route = (path: string) => ({ path, query: {} }) as RouteLocationNormalized

describe('Nouvelle annonce : la garde des modifications (lot 22)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.assumptions.current.mockResolvedValue({
      id: 'v1',
      workspaceId: MEMBERS[0]?.workspaceId,
      label: null,
      effectiveFrom: '2026-11-03T10:00:00.000Z',
      createdAt: '2026-11-03T10:00:00.000Z',
      values: DEFAULT_ASSUMPTIONS,
    })
    apiMock.listings.create.mockResolvedValue({
      ...fakeEvaluated(),
      duplicates: [],
      createdTasks: [],
    })
  })

  it('vide, le panneau se ferme sans question', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    cancelButton()?.click()
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(useLeaveGuardStore().pending).toBeNull()
    wrapper.unmount()
  })

  it('rempli : fermer demande ; « Continuer » garde la saisie, « Abandonner » ferme', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await manual()
    await fill('#f-title', 'T3 fictif à garder')
    const store = useLeaveGuardStore()
    cancelButton()?.click()
    await flushPromises()
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(store.pending?.title).toBe('Nouvelle annonce')
    store.stay()
    await flushPromises()
    expect(el<HTMLInputElement>('#f-title').value).toBe('T3 fictif à garder')
    // Le bouton retour quitte /annonces/nouvelle : la garde du routeur le voit.
    expect(
      store.blockingNavigation(route('/annonces'), route('/annonces/nouvelle'))
    ).not.toBeNull()
    cancelButton()?.click()
    await flushPromises()
    store.confirmLeave()
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(store.anyDirty()).toBe(false)
    wrapper.unmount()
  })

  it('un texte collé à analyser compte aussi comme une saisie', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await fill('#x-text', 'Appartement T2 fictif')
    expect(useLeaveGuardStore().anyDirty()).toBe(true)
    wrapper.unmount()
    expect(useLeaveGuardStore().anyDirty()).toBe(false)
  })

  it('« 45 m² » est refusé au champ, qui reçoit le focus ; enregistrée, plus de garde', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await manual()
    await fill('#f-title', 'T2 fictif')
    await fill('#f-price', '189 000')
    await fill('#f-surface', '45 m²')
    el<HTMLButtonElement>('[data-testid="save"]').click()
    await flushPromises()
    expect(apiMock.listings.create).not.toHaveBeenCalled()
    const surface = el<HTMLInputElement>('#f-surface')
    expect(surface.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(surface)
    expect(
      el('[data-field="f-surface"] [data-testid="field-error"]').textContent
    ).toContain('« 45 m² » n’est pas un nombre')
    await fill('#f-surface', '45')
    el<HTMLButtonElement>('[data-testid="save"]').click()
    await flushPromises()
    expect(apiMock.listings.create).toHaveBeenCalled()
    expect(wrapper.emitted('created')).toHaveLength(1)
    expect(useLeaveGuardStore().anyDirty()).toBe(false)
    wrapper.unmount()
  })
})
