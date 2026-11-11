/**
 * Lot 19 : l'onglet « Historique » de la fiche. Une seule chronologie qui
 * fusionne journal, vérifications sur les portails (lots 15 et 18), prix et
 * adéquation ; filtres par type ; « Vérifier sur les portails » et ses
 * constats à la main (« Vue en ligne aujourd'hui », « Plus en ligne » et le
 * statut proposé appliqué seulement sur accord, lien vérifié parmi
 * plusieurs, garde-fou) ; le pied (ajout, source, champs lus par l'IA,
 * modification). API simulée ; données fictives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type {
  ActivityEntry,
  ActivityPage,
  EvaluatedListing,
  ListingCheck,
  Member,
} from '@apart/contracts'
import { MEMBERS, fakeEvaluated, fakeLink } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  activity: { forListing: vi.fn() },
  listings: {
    checks: vi.fn(),
    applyCheck: vi.fn(),
    criteriaFitHistory: vi.fn(),
  },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import { useFeedbackStore } from '@/stores/feedback'
import HistoryTab from '../tabs/HistoryTab.vue'

enableAutoUnmount(afterEach)

/** Lot 22 : le dernier message de la zone commune. */
const lastMessage = () => useFeedbackStore().messages.at(-1)?.text ?? null

const LISTING = '11111111-1111-4111-8111-111111111111'
const OTHER = '99999999-9999-4999-8999-999999999999'
const RICHARD = MEMBERS[0] as Member
const CHLOE = MEMBERS[1] as Member
/** Espaces fines et insécables des montants ramenées à des espaces. */
const n = (value: string): string => value.replace(/[\u202f\u00a0]/g, ' ')

const LBC = fakeLink({
  id: 'ffffffff-ffff-4fff-8fff-ffffffffff01',
  price: 214_000,
})
const SL = fakeLink({
  id: 'ffffffff-ffff-4fff-8fff-ffffffffff02',
  portal: 'seloger',
  url: 'https://www.seloger.com/annonces/0000000202.htm',
  normalizedUrl: 'https://seloger.com/annonces/0000000202.htm',
  externalId: null,
  primary: false,
  createdAt: '2026-11-03T10:00:00.000Z',
})
const BI = fakeLink({
  id: 'ffffffff-ffff-4fff-8fff-ffffffffff03',
  portal: 'bienici',
  url: 'https://www.bienici.com/annonce/0000000303',
  normalizedUrl: 'https://bienici.com/annonce/0000000303',
  externalId: null,
  primary: false,
  online: false,
  createdAt: '2026-11-03T12:00:00.000Z',
})

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
    link: null,
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
    outcome: 'link_added',
    checkedAt: '2026-11-03T10:00:00.000Z',
    summary: 'Lien SeLoger ajouté : 219 000 €',
    checkedUrl: SL.url,
    link: { id: SL.id, portal: 'seloger', url: SL.url },
  }),
]

function entry(over: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: '2026-11-02T10:00:00.000Z',
    action: 'listing.updated',
    kind: 'listing',
    channel: 'web',
    channelLabel: 'Web',
    actor: { id: RICHARD.id, handle: 'richard', displayName: 'Richard' },
    listing: { id: LISTING, title: 'T2 fictif' },
    summary: 'a modifié l’annonce',
    changes: [],
    ...over,
  } as ActivityEntry
}

const JOURNAL: ActivityEntry[] = [
  entry({
    action: 'agency_request.sent',
    kind: 'agency',
    createdAt: '2026-11-04T10:00:00.000Z',
    summary: 'a noté l’envoi du message à l’annonceur',
  }),
  entry({
    action: 'listing.updated',
    createdAt: '2026-10-30T10:00:00.000Z',
    actor: { id: CHLOE.id, handle: 'chloe', displayName: 'Chloé' },
    summary: 'a modifié l’annonce',
    changes: [
      { field: 'renovation', label: 'Travaux', before: '—', after: '18 000 €' },
    ],
  }),
  entry({
    action: 'listing.checked',
    kind: 'check',
    createdAt: '2026-11-05T09:00:00.000Z',
  }),
  entry({
    action: 'listing.created',
    createdAt: '2026-10-08T09:00:00.000Z',
    summary: 'a ajouté l’annonce',
  }),
]

function page(items: ActivityEntry[], pageCount = 1, p = 1): ActivityPage {
  return { items, total: items.length, page: p, limit: 200, pageCount }
}

function item(over: Partial<EvaluatedListing['listing']> = {}, links = [LBC]) {
  return fakeEvaluated(
    {
      id: LISTING,
      status: 'to_study',
      url: LBC.url,
      createdAt: '2026-10-08T09:00:00.000Z',
      updatedAt: '2026-11-05T08:00:00.000Z',
      lastCheckedAt: '2026-11-05T09:00:00.000Z',
      lastSeenOnlineAt: '2026-11-02T09:00:00.000Z',
      fieldSources: {
        price: {
          source: 'ai',
          confidence: 0.95,
          recordedAt: '2026-10-08T09:00:00.000Z',
        },
      },
      ...over,
    },
    {
      links,
      priceEvents: [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          listingId: LISTING,
          occurredAt: '2026-10-12T09:00:00.000Z',
          oldPrice: 220_000,
          newPrice: 214_000,
          source: 'listing',
        },
      ],
    }
  )
}

function mountTab(listing = item()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(HistoryTab, {
    props: { item: listing, members: MEMBERS },
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { template: '<a data-router-link><slot /></a>' } },
    },
  })
}

const rows = (wrapper: ReturnType<typeof mountTab>) =>
  wrapper.findAll('[data-testid="timeline-entry"]')

describe('onglet « Historique » (lot 19)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.activity.forListing.mockResolvedValue(page(JOURNAL))
    apiMock.listings.checks.mockResolvedValue(CHECKS)
    apiMock.listings.criteriaFitHistory.mockResolvedValue({
      listingId: LISTING,
      items: [
        {
          at: '2026-10-09T09:00:00.000Z',
          what: 'Entrée dans « [Exemple] Caudéran T3 »',
          why: '',
        },
        { at: '2026-10-08T09:00:00.000Z', what: 'Enregistrée', why: '' },
      ],
    })
  })

  it('fusionne journal, vérifications, prix et adéquation, du plus récent au plus ancien', async () => {
    const wrapper = mountTab()
    await flushPromises()
    expect(apiMock.activity.forListing).toHaveBeenCalledWith(LISTING, {
      page: 1,
      limit: 200,
    })
    const list = rows(wrapper)
    expect(
      list.map(r => [r.attributes('data-source'), r.attributes('data-kind')])
    ).toEqual([
      ['check', 'check'],
      ['journal', 'talk'],
      ['check', 'check'],
      ['check', 'check'],
      ['journal', 'edit'],
      ['check', 'check'],
      ['price', 'price'],
      ['fit', 'edit'],
      ['journal', 'edit'],
    ])
    expect(
      list.map(r => r.get('[data-testid="timeline-kind"]').text())
    ).toEqual([
      'Vérification',
      'Échange',
      'Vérification',
      'Vérification',
      'Fiche',
      'Vérification',
      'Prix',
      'Fiche',
      'Fiche',
    ])
    // La vérification : qui, résultat, annonce rattachée.
    expect(list[0]?.text()).toContain('Claude (MCP, pour Richard)')
    expect(list[0]?.text()).toContain('Republiée')
    expect(wrapper.get('[data-testid="check-linked"]').text()).toContain(
      'Annonce rattachée : « T2 fictif (1re publication) »'
    )
    expect(list[1]?.text()).toContain(
      'Richard a noté l’envoi du message à l’annonceur'
    )
    // « Plus en ligne » par Chloé : statut proposé, extrait dépliable.
    expect(list[2]?.text()).toContain('Chloé')
    expect(list[2]?.text()).toContain(
      'Plus en ligne : statut proposé « Vendu ou retiré »'
    )
    expect(list[2]?.text()).toContain('proposé')
    expect(list[2]?.find('details summary').text()).toBe('Extrait de la page')
    expect(list[2]?.find('blockquote').text()).toBe('Cette annonce a expiré.')
    // Lien ajouté sur SeLoger (lot 18), avec son portail.
    expect(list[3]?.text()).toContain('Lien ajouté')
    expect(list[3]?.text()).toContain('sur SeLoger')
    // Une modification de la fiche : avant → après.
    expect(list[4]?.text()).toContain('Chloé a modifié l’annonce')
    expect(list[4]?.text()).toContain('Travaux')
    expect(list[4]?.text()).toContain('18 000 €')
    expect(list[5]?.text()).toContain('Prix 215 000 € → 205 000 €')
    expect(list[5]?.text()).toContain('appliqué')
    expect(list[5]?.find('a').attributes('rel')).toBe('noopener noreferrer')
    expect(n(list[6]?.text() ?? '')).toContain(
      'Baisse de prix : 220 000 € → 214 000 € (−6 000 €)'
    )
    expect(list[7]?.text()).toContain('Entrée dans « [Exemple] Caudéran T3 »')
    expect(list[8]?.text()).toContain('Richard a ajouté l’annonce')
    expect(wrapper.get('[data-testid="history-footer"]').text()).toBe(
      'Ajoutée le 8 oct. 2026 depuis Leboncoin, 1 champ lu par l’IA · modifiée le 5 nov. 2026 · l’export CSV et JSON reste dans la liste.'
    )
  })

  it('filtres Tout, Prix, Vérifications, Échanges, Avis, Décisions, Fiche ; rien de ce type', async () => {
    apiMock.listings.checks.mockResolvedValue([])
    const wrapper = mountTab()
    await flushPromises()
    const filters = wrapper.get('[data-testid="history-filters"]')
    expect(filters.findAll('button').map(b => b.text())).toEqual([
      'Tout5',
      'Prix1',
      'Vérifications0',
      'Échanges1',
      'Avis0',
      'Décisions0',
      'Fiche3',
    ])
    await filters.get('[data-filter="talk"]').trigger('click')
    expect(filters.get('[data-filter="talk"]').attributes('aria-pressed')).toBe(
      'true'
    )
    expect(rows(wrapper)).toHaveLength(1)
    await filters.get('[data-filter="price"]').trigger('click')
    expect(rows(wrapper).map(r => r.attributes('data-source'))).toEqual([
      'price',
    ])
    await filters.get('[data-filter="check"]').trigger('click')
    expect(wrapper.get('[data-testid="timeline-empty"]').text()).toBe(
      'Rien de ce type pour cette annonce : choisis « Tout » pour voir le reste.'
    )
    await filters.get('[data-filter="all"]').trigger('click')
    expect(rows(wrapper)).toHaveLength(5)
  })

  it('« Plus anciens » charge la page suivante du journal', async () => {
    apiMock.activity.forListing.mockImplementation(
      (_id: string, query: { page: number }) =>
        Promise.resolve(
          query.page === 1
            ? page([JOURNAL[0] as ActivityEntry], 2, 1)
            : page(
                [
                  entry({
                    createdAt: '2026-09-01T09:00:00.000Z',
                    summary: 'a importé l’annonce',
                  }),
                ],
                2,
                2
              )
        )
    )
    apiMock.listings.checks.mockResolvedValue([])
    apiMock.listings.criteriaFitHistory.mockResolvedValue({
      listingId: LISTING,
      items: [],
    })
    const wrapper = mountTab()
    await flushPromises()
    expect(rows(wrapper)).toHaveLength(2)
    await wrapper.get('[data-testid="history-more"]').trigger('click')
    await flushPromises()
    expect(apiMock.activity.forListing).toHaveBeenLastCalledWith(LISTING, {
      page: 2,
      limit: 200,
    })
    expect(rows(wrapper)).toHaveLength(3)
    expect(rows(wrapper)[2]?.text()).toContain('a importé l’annonce')
    expect(wrapper.find('[data-testid="history-more"]').exists()).toBe(false)
  })

  it('« Vérifier sur les portails » : fraîcheur, « Vue en ligne aujourd’hui » avec le garde-fou', async () => {
    apiMock.listings.applyCheck.mockResolvedValue({
      check: check({}),
      listing: item(),
      suggestion: null,
      linked: null,
    })
    const wrapper = mountTab()
    await flushPromises()
    const toggle = wrapper.get('[data-testid="history-check"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="check-actions"]').exists()).toBe(false)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const actions = wrapper.get('[data-testid="check-actions"]')
    expect(actions.get('[data-testid="checks-freshness"]').text()).toContain(
      'Vérifiée'
    )
    expect(actions.text()).toContain('demande « Tournée de mise à jour »')
    expect(actions.find('[data-testid="check-link"]').exists()).toBe(false)
    await actions.get('[data-testid="check-online"]').trigger('click')
    await flushPromises()
    expect(apiMock.listings.applyCheck).toHaveBeenCalledWith(LISTING, {
      observed: { online: true },
      outcome: 'unchanged',
      expectedUpdatedAt: '2026-11-05T08:00:00.000Z',
      checkedUrl: LBC.url,
    })
    expect(lastMessage()).toBe('Annonce notée en ligne aujourd’hui.')
  })

  it('« Plus en ligne » : confirmation, extrait facultatif, statut proposé appliqué seulement sur accord', async () => {
    apiMock.listings.applyCheck.mockResolvedValue({
      check: check({
        outcome: 'offline',
        suggestedStatus: 'sold_or_withdrawn',
      }),
      listing: item(),
      suggestion: {
        listingId: LISTING,
        title: 'T2 fictif',
        currentStatus: 'to_study',
        status: 'sold_or_withdrawn',
        reason: 'L’annonce n’est plus en ligne sur le portail.',
      },
      linked: null,
    })
    const wrapper = mountTab(item({ url: null }, []))
    await flushPromises()
    await wrapper.get('[data-testid="history-check"]').trigger('click')
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
    expect(wrapper.emitted('setStatus')).toBeUndefined()
    const proposal = wrapper.get('[data-testid="check-suggestion"]')
    expect(proposal.text()).toContain(
      'Passer l’annonce à « Vendu ou retiré » ?'
    )
    expect(proposal.text()).toContain('Garder « À étudier »')
    await wrapper.get('[data-testid="check-suggestion-apply"]').trigger('click')
    expect(wrapper.emitted('setStatus')).toEqual([['sold_or_withdrawn']])
    expect(wrapper.find('[data-testid="check-suggestion"]').exists()).toBe(
      false
    )
  })

  it('plusieurs portails : le lien vérifié se choisit ; « plus en ligne » ne propose rien tant qu’un autre l’est', async () => {
    apiMock.listings.applyCheck.mockResolvedValue({
      check: check({}),
      listing: item(),
      suggestion: null,
      linked: null,
    })
    const wrapper = mountTab(item({}, [LBC, SL, BI]))
    await flushPromises()
    await wrapper.get('[data-testid="history-check"]').trigger('click')
    const select = wrapper.get('[data-testid="check-link"]')
    expect(select.findAll('option').map(o => o.text())).toEqual([
      'Leboncoin (lien principal)',
      'SeLoger',
      'Bien’ici (plus en ligne)',
    ])
    await select.setValue(SL.id)
    await wrapper.get('[data-testid="check-online"]').trigger('click')
    await flushPromises()
    expect(apiMock.listings.applyCheck).toHaveBeenCalledWith(LISTING, {
      observed: { online: true },
      outcome: 'unchanged',
      expectedUpdatedAt: '2026-11-05T08:00:00.000Z',
      linkId: SL.id,
      checkedUrl: SL.url,
    })
    expect(lastMessage()).toBe('Lien SeLoger noté en ligne aujourd’hui.')
    await wrapper.get('[data-testid="check-offline"]').trigger('click')
    expect(wrapper.get('[data-testid="check-offline-form"]').text()).toContain(
      'ne sera proposé que si plus aucun lien n’est en ligne'
    )
  })

  it('un refus de l’API (garde-fou) est dit ; jamais vérifiée : « À revérifier »', async () => {
    const { ApiError } =
      await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
    apiMock.listings.checks.mockResolvedValue([])
    apiMock.listings.applyCheck.mockRejectedValue(
      new ApiError(409, "L'annonce a changé depuis votre lecture")
    )
    const wrapper = mountTab(
      item({ lastCheckedAt: null, lastSeenOnlineAt: null })
    )
    await flushPromises()
    await wrapper.get('[data-testid="history-check"]').trigger('click')
    expect(wrapper.get('[data-testid="checks-freshness"]').text()).toBe(
      'À revérifier'
    )
    await wrapper.get('[data-testid="check-online"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "L'annonce a changé depuis votre lecture"
    )
  })
})
