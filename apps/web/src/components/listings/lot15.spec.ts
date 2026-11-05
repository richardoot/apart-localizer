import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { ListingCheck, Member, NegotiationBrief } from '@apart/contracts'
import {
  financialsFromListing,
  negotiationBrief,
  targetPrice,
} from '@apart/domain'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import { MEMBERS, fakeEvaluated, fakeListing } from '@/test/fixtures'
import { useFiltersStore, queryFromFilters } from '@/stores/filters'

const apiMock = vi.hoisted(() => ({
  listings: { checks: vi.fn(), applyCheck: vi.fn() },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import ChecksSection from './ChecksSection.vue'
import CheckFreshnessBadge from './CheckFreshnessBadge.vue'
import FiltersBar from './FiltersBar.vue'
import TargetPriceSection from './TargetPriceSection.vue'

const LISTING = '11111111-1111-4111-8111-111111111111'
const OTHER = '99999999-9999-4999-8999-999999999999'
const RICHARD = MEMBERS[0] as Member
const CHLOE = MEMBERS[1] as Member

function check(over: Partial<ListingCheck>): ListingCheck {
  return {
    id: crypto.randomUUID(),
    listingId: LISTING,
    checkedAt: '2026-11-05T09:00:00.000Z',
    authorId: RICHARD.id,
    channel: 'mcp',
    outcome: 'unchanged',
    changes: [],
    summary: 'Inchangée',
    evidence: null,
    checkedUrl: null,
    linkedListing: null,
    suggestedStatus: null,
    ...over,
  }
}

const CHECKS: ListingCheck[] = [
  check({
    outcome: 'republished',
    checkedAt: '2026-11-05T09:00:00.000Z',
    summary: 'Republication de « T2 fictif (1re publication) »',
    linkedListing: {
      id: OTHER,
      title: 'T2 fictif (1re publication)',
      status: 'to_study',
    },
  }),
  check({
    outcome: 'offline',
    checkedAt: '2026-11-04T09:00:00.000Z',
    authorId: CHLOE.id,
    channel: 'web',
    changes: [
      {
        field: 'status',
        label: 'Statut',
        before: 'to_study',
        after: 'sold_or_withdrawn',
        disposition: 'proposed',
        text: 'Plus en ligne : statut proposé « Vendu ou retiré »',
      },
    ],
    summary: 'Plus en ligne : statut proposé « Vendu ou retiré »',
    evidence: 'Cette annonce a expiré.',
  }),
  check({ outcome: 'unchanged', checkedAt: '2026-11-02T09:00:00.000Z' }),
  check({
    outcome: 'changed',
    checkedAt: '2026-10-28T09:00:00.000Z',
    changes: [
      {
        field: 'price',
        label: 'Prix',
        before: 215000,
        after: 205000,
        disposition: 'applied',
        text: 'Prix 215 000 € → 205 000 €',
      },
    ],
    summary: 'Prix 215 000 € → 205 000 €',
    checkedUrl: 'https://annonces.exemple.invalid/t2',
  }),
  check({
    outcome: 'inaccessible',
    checkedAt: '2026-10-20T09:00:00.000Z',
    summary: 'Non vérifiée : page inaccessible',
  }),
  check({ outcome: 'unchanged', checkedAt: '2026-10-10T09:00:00.000Z' }),
]

function mountSection(props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(ChecksSection, {
    props: {
      listingId: LISTING,
      status: 'to_study',
      updatedAt: '2026-11-05T08:00:00.000Z',
      createdAt: '2026-10-01T08:00:00.000Z',
      lastCheckedAt: '2026-11-05T09:00:00.000Z',
      lastSeenOnlineAt: '2026-11-02T09:00:00.000Z',
      url: 'https://annonces.exemple.invalid/t2',
      members: MEMBERS,
      ...props,
    },
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { template: '<a data-router-link><slot /></a>' } },
    },
  })
}

describe('Lot 15 : section « Mises à jour » de l’onglet Suivi', () => {
  beforeEach(() => {
    apiMock.listings.checks.mockReset()
    apiMock.listings.applyCheck.mockReset()
  })

  it('chronologie : qui, résultat, changements, extrait dépliable, annonce rattachée ; cinq d’abord', async () => {
    apiMock.listings.checks.mockResolvedValue(CHECKS)
    const wrapper = mountSection()
    await flushPromises()
    const items = wrapper.findAll('[data-testid="checks-list"] > li')
    expect(items).toHaveLength(5)
    expect(items.map(i => i.attributes('data-outcome'))).toEqual([
      'republished',
      'offline',
      'unchanged',
      'changed',
      'inaccessible',
    ])
    expect(items[0]?.text()).toContain('Claude (MCP, pour Richard)')
    expect(items[0]?.text()).toContain('Republiée')
    expect(wrapper.get('[data-testid="check-linked"]').text()).toContain(
      'Annonce rattachée : « T2 fictif (1re publication) »'
    )
    expect(items[1]?.text()).toContain('Chloé')
    expect(items[1]?.text()).toContain(
      'Plus en ligne : statut proposé « Vendu ou retiré »'
    )
    expect(items[1]?.text()).toContain('proposé')
    expect(items[1]?.find('details summary').text()).toBe('Extrait de la page')
    expect(items[1]?.find('blockquote').text()).toBe('Cette annonce a expiré.')
    expect(items[3]?.text()).toContain('Prix 215 000 € → 205 000 €')
    expect(items[3]?.text()).toContain('appliqué')
    expect(items[3]?.find('a').attributes('rel')).toBe('noopener noreferrer')
    expect(items[4]?.text()).toContain('Non vérifiée : page inaccessible')
    expect(wrapper.get('[data-testid="checks-freshness"]').text()).toContain(
      'Vérifiée'
    )
    await wrapper.get('[data-testid="checks-toggle"]').trigger('click')
    expect(wrapper.findAll('[data-testid="checks-list"] > li')).toHaveLength(6)
    wrapper.unmount()
  })

  it('sans vérification : le dit, et « jamais revérifiée » pour une annonce ancienne', async () => {
    apiMock.listings.checks.mockResolvedValue([])
    const wrapper = mountSection({
      lastCheckedAt: null,
      lastSeenOnlineAt: null,
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="checks-empty"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="checks-freshness"]').text()).toBe(
      'À revérifier'
    )
    wrapper.unmount()
  })

  it('« Vue en ligne aujourd’hui » enregistre une vérification inchangée, avec le garde-fou', async () => {
    apiMock.listings.checks.mockResolvedValue([])
    apiMock.listings.applyCheck.mockResolvedValue({
      check: check({}),
      listing: fakeEvaluated(),
      suggestion: null,
      linked: null,
    })
    const wrapper = mountSection()
    await flushPromises()
    await wrapper.get('[data-testid="check-online"]').trigger('click')
    await flushPromises()
    expect(apiMock.listings.applyCheck).toHaveBeenCalledWith(LISTING, {
      observed: { online: true },
      outcome: 'unchanged',
      expectedUpdatedAt: '2026-11-05T08:00:00.000Z',
      checkedUrl: 'https://annonces.exemple.invalid/t2',
    })
    expect(wrapper.text()).toContain('Annonce notée en ligne aujourd’hui.')
    wrapper.unmount()
  })

  it('« Plus en ligne » : confirmation, extrait facultatif, puis statut proposé appliqué seulement sur accord', async () => {
    apiMock.listings.checks.mockResolvedValue([])
    apiMock.listings.applyCheck.mockResolvedValue({
      check: check({
        outcome: 'offline',
        suggestedStatus: 'sold_or_withdrawn',
      }),
      listing: fakeEvaluated(),
      suggestion: {
        listingId: LISTING,
        title: 'T2 fictif',
        currentStatus: 'to_study',
        status: 'sold_or_withdrawn',
        reason: 'L’annonce n’est plus en ligne sur le portail.',
      },
      linked: null,
    })
    const wrapper = mountSection({ url: null })
    await flushPromises()
    await wrapper.get('[data-testid="check-offline"]').trigger('click')
    expect(apiMock.listings.applyCheck).not.toHaveBeenCalled()
    await wrapper
      .get('[data-testid="check-offline-evidence"]')
      .setValue('Page introuvable')
    await wrapper.get('[data-testid="check-offline-form"]').trigger('submit')
    await flushPromises()
    expect(apiMock.listings.applyCheck).toHaveBeenCalledWith(LISTING, {
      observed: { online: false },
      outcome: 'offline',
      expectedUpdatedAt: '2026-11-05T08:00:00.000Z',
      evidence: 'Page introuvable',
    })
    // Rien n'est changé tant que le membre n'a pas confirmé.
    expect(wrapper.emitted('set-status')).toBeUndefined()
    const proposal = wrapper.get('[data-testid="check-suggestion"]')
    expect(proposal.text()).toContain(
      'Passer l’annonce à « Vendu ou retiré » ?'
    )
    expect(proposal.text()).toContain('Garder « À étudier »')
    await wrapper.get('[data-testid="check-suggestion-apply"]').trigger('click')
    expect(wrapper.emitted('set-status')).toEqual([['sold_or_withdrawn']])
    expect(wrapper.find('[data-testid="check-suggestion"]').exists()).toBe(
      false
    )
    wrapper.unmount()
  })

  it('un refus de l’API (garde-fou) est affiché', async () => {
    const { ApiError } =
      await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
    apiMock.listings.checks.mockResolvedValue([])
    apiMock.listings.applyCheck.mockRejectedValue(
      new ApiError(409, "L'annonce a changé depuis votre lecture")
    )
    const wrapper = mountSection()
    await flushPromises()
    await wrapper.get('[data-testid="check-online"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "L'annonce a changé depuis votre lecture"
    )
    wrapper.unmount()
  })
})

describe('Lot 15 : liste et filtre « À revérifier »', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mention discrète : « Vérifiée il y a N j », « À revérifier », rien pour une annonce récente', () => {
    const now = Date.now()
    const day = 86_400_000
    const iso = (offset: number) => new Date(now - offset).toISOString()
    const fresh = mount(CheckFreshnessBadge, {
      props: {
        listing: fakeListing({
          lastCheckedAt: iso(3 * day + 3600_000),
          createdAt: iso(40 * day),
        }),
      },
    })
    expect(fresh.text()).toBe('Vérifiée il y a 3 j')
    expect(fresh.get('span').attributes('data-stale')).toBe('false')
    const stale = mount(CheckFreshnessBadge, {
      props: {
        listing: fakeListing({ lastCheckedAt: null, createdAt: iso(20 * day) }),
      },
    })
    expect(stale.text()).toBe('À revérifier')
    expect(stale.get('span').classes()).toContain('text-warn')
    const recent = mount(CheckFreshnessBadge, {
      props: {
        listing: fakeListing({ lastCheckedAt: null, createdAt: iso(day) }),
      },
    })
    expect(recent.find('span').exists()).toBe(false)
    const blocked = mount(CheckFreshnessBadge, {
      props: {
        listing: fakeListing({
          lastCheckedAt: iso(2 * day + 3600_000),
          createdAt: iso(40 * day),
        }),
        lastOutcome: 'inaccessible',
      },
    })
    expect(blocked.text()).toBe('Page inaccessible il y a 2 j')
  })

  it('filtre « À revérifier » : 7 jours dans le store et dans l’URL, compté, retiré', async () => {
    const store = useFiltersStore()
    const wrapper = mount(FiltersBar, { props: { communes: [] } })
    const box = wrapper.get('[data-testid="filter-stale"]')
    await box.setValue(true)
    expect(store.filters.staleDays).toBe(7)
    expect(store.activeCount).toBe(1)
    expect(queryFromFilters(store.filters, 'table')).toMatchObject({
      staleDays: '7',
    })
    await box.setValue(false)
    expect(store.filters.staleDays).toBeUndefined()
    await wrapper.get('#f-sort').setValue('lastCheckedAt')
    expect(store.filters.order).toBe('asc')
  })
})

describe('Lot 15 : négociation avec une republication rattachée', () => {
  it('dit que la durée en ligne et les baisses partent de la première publication', () => {
    const listing = fakeListing({ price: 200_000 })
    const target = targetPrice(
      financialsFromListing(listing),
      DEFAULT_ASSUMPTIONS
    )
    const brief: NegotiationBrief = negotiationBrief(
      {
        price: listing.price,
        publishedAt: '2026-10-20T00:00:00.000Z',
        createdAt: listing.createdAt,
        dpeClass: null,
        renovationTotal: 0,
        annualCharges: null,
        surface: 45,
        priceEvents: [
          {
            occurredAt: '2026-10-21T00:00:00.000Z',
            oldPrice: null,
            newPrice: 200_000,
          },
        ],
        predecessors: [
          {
            id: OTHER,
            title: 'T2 fictif (1re publication)',
            publishedAt: '2026-08-02T00:00:00.000Z',
            createdAt: '2026-08-02T00:00:00.000Z',
            priceEvents: [
              {
                occurredAt: '2026-08-02T00:00:00.000Z',
                oldPrice: null,
                newPrice: 220_000,
              },
            ],
          },
        ],
        offers: [],
      },
      target,
      DEFAULT_ASSUMPTIONS,
      { now: new Date('2026-11-05T12:00:00.000Z') }
    )
    const wrapper = mount(TargetPriceSection, {
      props: {
        price: 200_000,
        targetPrice: target,
        negotiation: brief,
        rank: null,
        notaryFees: null,
        assumptions: DEFAULT_ASSUMPTIONS,
        rent: 750,
        live: false,
      },
    })
    const note = wrapper.get('[data-testid="negotiation-republication"]')
    expect(note.text()).toContain(
      'Annonce republiée : durée en ligne (95 jours)'
    )
    expect(note.text()).toContain('baisses (1)')
    expect(note.text()).toContain('« T2 fictif (1re publication) »')
    expect(wrapper.find('[data-argument="republished"]').exists()).toBe(true)
  })
})
