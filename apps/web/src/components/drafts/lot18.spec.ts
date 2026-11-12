/**
 * Lot 18 : « À valider » avec une annonce sur plusieurs portails. Liens
 * rattachés d'office (même agence, même référence) et « Ce n'est pas la
 * même » ; doublon certain ou de même référence, « C'est la même : ajouter
 * ce lien à la fiche » ; vendeur lu. API simulée, données fictives.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import type { Component } from 'vue'
import type { DuplicateCandidate, ListingDraft } from '@apart/contracts'
import { LISTING_ID, fakeDraft } from '@/test/exploration-fixtures'

const apiMock = vi.hoisted(() => ({
  drafts: {
    list: vi.fn(),
    attached: vi.fn(),
    detach: vi.fn(),
    decide: vi.fn(),
    accept: vi.fn(),
    acceptInCriteria: vi.fn(),
    merge: vi.fn(),
    distinct: vi.fn(),
  },
  explorations: { list: vi.fn() },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import AttachedLinks from './AttachedLinks.vue'
import DraftCard from './DraftCard.vue'
import DraftsTab from './DraftsTab.vue'
import { draftSellerLabel, duplicateLead } from '@/lib/drafts'
import { ApiError } from '@/lib/api'

const n = (value: string) =>
  value.replace(/[\u202f\u00a0]/g, ' ').replace(/\s+/g, ' ')

const stubs = { RouterLink: { props: ['to'], template: '<a><slot /></a>' } }

function mountWith(component: Component, props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(component, {
    props,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs,
    },
  })
}

/** Un lien SeLoger rattaché d'office à « [Exemple] T3 68 m², balcon sud ». */
function attachedDraft(over: Partial<ListingDraft> = {}): ListingDraft {
  const base = fakeDraft()
  return fakeDraft({
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd11',
    status: 'merged',
    listingId: LISTING_ID,
    portal: 'seloger',
    url: 'https://www.seloger.com/annonces/0000000202.htm',
    listing: {
      ...base.listing,
      price: 219_000,
      sellerType: 'agency',
      sellerName: '[Exemple] Immobilier des Chartrons',
      sellerReference: 'EX-2041',
    },
    attachment: {
      listingId: LISTING_ID,
      listingTitle: '[Exemple] T3 68 m², balcon sud',
      linkId: 'ffffffff-ffff-4fff-8fff-ffffffffff02',
      portal: 'seloger',
      attachedAt: '2026-11-05T17:40:00.000Z',
      fichePrice: 214_000,
      sellerName: '[Exemple] Immobilier des Chartrons',
      sellerReference: 'EX-2041',
      summary: 'Lien SeLoger ajouté : 219 000 € (+5 000 € : frais inclus ?)',
    },
    ...over,
  })
}

const certain: DuplicateCandidate = {
  listingId: LISTING_ID,
  title: '[Exemple] T3 68 m², balcon sud',
  status: 'to_study',
  price: 214_000,
  surface: 68,
  commune: 'Bordeaux',
  url: null,
  score: 1,
  reasons: [
    {
      kind: 'same_reference',
      score: 1,
      detail: 'même agence, même référence EX-2041',
    },
  ],
  certain: true,
  sellerType: 'agency',
  sellerName: '[Exemple] Immobilier des Chartrons',
  sellerReference: 'EX-2041',
  linkCount: 2,
  differences: [],
}

const otherAgency: DuplicateCandidate = {
  ...certain,
  title: '[Exemple] T4 80 m², Arlac',
  score: 0.85,
  certain: false,
  reasons: [
    {
      kind: 'same_reference_other_agency',
      score: 0.85,
      detail:
        'la référence EX-3310 est la même, mais l’agence lue diffère (deux agences ont parfois le même mandat)',
    },
  ],
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('les textes du lot 18', () => {
  it('le début de la phrase du doublon, le vendeur lu', () => {
    expect(duplicateLead(certain)).toBe('Même annonce que')
    expect(duplicateLead(otherAgency)).toBe('Même référence, autre agence que')
    expect(
      duplicateLead({
        certain: false,
        reasons: [{ kind: 'same_address', score: 0.9, detail: 'x' }],
      })
    ).toBe('Peut-être')
    expect(draftSellerLabel(attachedDraft())).toBe('Agence · réf. EX-2041')
    expect(draftSellerLabel(fakeDraft())).toBeNull()
    const privateDraft = fakeDraft()
    privateDraft.listing.sellerType = 'private'
    expect(draftSellerLabel(privateDraft)).toBe('Particulier')
  })
})

describe('Liens rattachés d’office', () => {
  it('l’annonce, le portail, le prix comparé, la référence et l’agence', async () => {
    apiMock.drafts.attached.mockResolvedValue([
      attachedDraft(),
      attachedDraft({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd12',
        portal: 'bienici',
        listing: { ...attachedDraft().listing, price: 214_000 },
        attachment: {
          ...(attachedDraft().attachment as NonNullable<
            ListingDraft['attachment']
          >),
          portal: 'bienici',
          attachedAt: '2026-11-04T17:40:00.000Z',
        },
      }),
    ])
    const wrapper = mountWith(AttachedLinks)
    await flushPromises()
    expect(apiMock.drafts.attached).toHaveBeenCalled()
    const block = wrapper.get('[data-testid="attached-links"]')
    expect(block.text()).toContain(
      'Liens rattachés d’office : même agence, même référence'
    )
    const rows = block.findAll('li')
    expect(rows).toHaveLength(2)
    expect(n(rows[0]?.text() ?? '')).toContain(
      'SeLoger Ajouté à [Exemple] T3 68 m², balcon sud · Réf. EX-2041 · [Exemple] Immobilier des Chartrons'
    )
    expect(n(rows[0]?.get('[data-testid="attached-price"]').text() ?? '')).toBe(
      '219 000 € : 5 000 € de plus'
    )
    expect(rows[1]?.get('[data-testid="attached-price"]').text()).toBe(
      'même prix'
    )
    expect(rows[0]?.text()).toContain('rattaché le 5 nov.')
  })

  it('« Ce n’est pas la même » : confirmation, détachement, l’annonce repasse à valider', async () => {
    const draft = attachedDraft()
    apiMock.drafts.attached.mockResolvedValue([draft])
    apiMock.drafts.detach.mockResolvedValue({
      ...draft,
      status: 'pending',
      attachment: null,
      detachedAt: '2026-11-06T09:00:00.000Z',
    })
    const wrapper = mountWith(AttachedLinks)
    await flushPromises()
    await wrapper.get('[data-action="detach"]').trigger('click')
    expect(apiMock.drafts.detach).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Retirer ce lien de la fiche ?')
    apiMock.drafts.attached.mockResolvedValue([])
    await wrapper.get('[data-action="confirm-detach"]').trigger('click')
    await flushPromises()
    expect(apiMock.drafts.detach).toHaveBeenCalledWith(draft.id)
    // Gardée à sa place, dite détachée.
    expect(wrapper.get('[data-testid="attached-detached"]').text()).toBe(
      'Détachée : elle passe dans les annonces à valider.'
    )
    expect(wrapper.find('[data-action="detach"]').exists()).toBe(false)
  })

  it('un refus est affiché ; rien à montrer sans lien rattaché', async () => {
    apiMock.drafts.attached.mockResolvedValue([attachedDraft()])
    apiMock.drafts.detach.mockRejectedValue(
      new ApiError(
        409,
        'Ce brouillon n’a pas de lien rattaché d’office à détacher.'
      )
    )
    const wrapper = mountWith(AttachedLinks)
    await flushPromises()
    await wrapper.get('[data-action="detach"]').trigger('click')
    await wrapper.get('[data-action="confirm-detach"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'pas de lien rattaché d’office'
    )
    apiMock.drafts.attached.mockResolvedValue([])
    const empty = mountWith(AttachedLinks)
    await flushPromises()
    expect(empty.find('[data-testid="attached-links"]').exists()).toBe(false)
  })
})

describe('Doublons du lot 18 dans une carte « À valider »', () => {
  it('doublon certain : mis en avant, « C’est la même : ajouter ce lien à la fiche »', async () => {
    const wrapper = mountWith(DraftCard, {
      draft: fakeDraft({
        portal: 'bienici',
        url: 'https://www.bienici.com/annonce/0000000303',
        duplicates: [certain],
        listing: {
          ...fakeDraft().listing,
          sellerType: 'agency',
          sellerReference: 'EX-2041',
        },
      }),
    })
    const dup = wrapper.get('[data-testid="draft-duplicate"]')
    expect(dup.attributes('data-certain')).toBe('true')
    expect(n(dup.text())).toContain(
      'Même annonce que [Exemple] T3 68 m², balcon sud, déjà suivie : même agence, même référence EX-2041'
    )
    expect(wrapper.get('[data-action="same"]').text()).toBe(
      'C’est la même : ajouter ce lien à la fiche'
    )
    expect(wrapper.get('[data-testid="draft-seller"]').text()).toBe(
      'Agence · réf. EX-2041'
    )
    await wrapper.get('[data-action="same"]').trigger('click')
    expect(wrapper.emitted('same')).toEqual([[LISTING_ID]])
  })

  it('même référence, autre agence : à trancher ; sans lien, « mettre à jour la fiche »', () => {
    const wrapper = mountWith(DraftCard, {
      draft: fakeDraft({ url: null, duplicates: [otherAgency] }),
    })
    const dup = wrapper.get('[data-testid="draft-duplicate"]')
    expect(dup.attributes('data-certain')).toBe('false')
    expect(n(dup.text())).toContain(
      'Même référence, autre agence que [Exemple] T4 80 m², Arlac'
    )
    expect(wrapper.get('[data-action="same"]').text()).toBe(
      'C’est la même : mettre à jour la fiche'
    )
  })
})

describe('L’onglet « À valider »', () => {
  it('montre les liens rattachés d’office en tête', async () => {
    apiMock.drafts.list.mockResolvedValue([])
    apiMock.drafts.attached.mockResolvedValue([attachedDraft()])
    apiMock.explorations.list.mockResolvedValue([])
    const wrapper = mountWith(DraftsTab)
    await flushPromises()
    expect(wrapper.find('[data-testid="attached-links"]').exists()).toBe(true)
    expect(wrapper.text()).toContain(
      'Seul le lien d’une annonce déjà suivie (même agence, même référence) rejoint sa fiche d’office.'
    )
  })
})
