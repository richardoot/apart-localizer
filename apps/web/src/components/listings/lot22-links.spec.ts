/**
 * Lot 22 : « Où la trouver » dit ses réussites dans la zone de messages
 * (« Annuler » remet un lien en ligne), refuse un prix illisible au champ et
 * garde ses erreurs dans la section. API simulée ; données fictives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { EvaluatedListing } from '@apart/contracts'
import { fakeEvaluated, fakeLink } from '@/test/fixtures'
import { useFeedbackStore } from '@/stores/feedback'

const apiMock = vi.hoisted(() => ({
  listings: { recordPriceChange: vi.fn() },
  links: { add: vi.fn(), update: vi.fn(), remove: vi.fn(), list: vi.fn() },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import ListingLinksSection from './ListingLinksSection.vue'

enableAutoUnmount(afterEach)

const LISTING = '11111111-1111-4111-8111-111111111111'
const A = fakeLink({ id: 'ffffffff-ffff-4fff-8fff-ffffffffff01' })
const B = fakeLink({
  id: 'ffffffff-ffff-4fff-8fff-ffffffffff02',
  portal: 'seloger',
  url: 'https://www.seloger.com/annonces/0000000202.htm',
  normalizedUrl: 'https://seloger.com/annonces/0000000202.htm',
  primary: false,
})
const item = (): EvaluatedListing =>
  fakeEvaluated(
    { id: LISTING, updatedAt: '2026-11-05T12:00:00.000Z' },
    { links: [A, B] }
  )

function mountLinks() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(ListingLinksSection, {
    props: { item: item(), now: new Date('2026-11-06T10:00:00.000Z') },
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

describe('« Où la trouver » (lot 22)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('« Plus en ligne » se dit dans la zone de messages ; « Annuler » le remet en ligne', async () => {
    apiMock.links.update.mockResolvedValue({
      link: null,
      check: null,
      listing: item(),
      priceProposal: null,
      summary: 'SeLoger : plus en ligne',
    })
    const wrapper = mountLinks()
    await wrapper
      .get(`[data-link="${B.id}"] [data-action="toggle-online"]`)
      .trigger('click')
    await flushPromises()
    const store = useFeedbackStore()
    const message = store.messages.at(-1)
    expect(message?.text).toBe('SeLoger : plus en ligne.')
    expect(message?.action?.label).toBe('Annuler')
    await store.act(message?.id ?? 0)
    await flushPromises()
    expect(apiMock.links.update).toHaveBeenLastCalledWith(LISTING, B.id, {
      online: true,
    })
  })

  it('un prix illisible est refusé au champ, rien n’est envoyé', async () => {
    const wrapper = mountLinks()
    await wrapper
      .get(`[data-link="${B.id}"] [data-action="edit-price"]`)
      .trigger('click')
    await wrapper.get('[data-testid="link-price-input"]').setValue('217k')
    await wrapper.get('[data-testid="link-price-form"]').trigger('submit')
    expect(apiMock.links.update).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="field-error"]').text()).toContain(
      '« 217k » n’est pas un nombre'
    )
    expect(
      wrapper.get('[data-testid="link-price-input"]').attributes('aria-invalid')
    ).toBe('true')
  })

  it('le prix d’un nouveau lien illisible bloque l’ajout', async () => {
    const wrapper = mountLinks()
    await wrapper
      .get('[data-testid="new-link-url"]')
      .setValue('https://www.pap.fr/annonces/r0000000505')
    await wrapper.get('[data-testid="new-link-price"]').setValue('environ 210')
    await wrapper.get('[data-testid="add-link-form"]').trigger('submit')
    expect(apiMock.links.add).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="field-error"]').text()).toContain(
      '« environ 210 »'
    )
  })
})
