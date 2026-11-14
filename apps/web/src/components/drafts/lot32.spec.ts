/**
 * Lot 32 (ADR 0047) : les photos du portail (galerie, image retirée), la
 * carte d'un brouillon (couverture, « Voir tout le détail ») et le
 * brouillon lu comme une fiche (chiffres, faits par thème, « non indiqué »,
 * description entière, ajout depuis le panneau). Données fictives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'
import { DEFAULT_ASSUMPTIONS, ListingInputSchema } from '@apart/contracts'
import { compute, financialsFromListing, targetPrice } from '@apart/domain'
import type { ListingDraft } from '@apart/contracts'
import { fakeDraft } from '@/test/exploration-fixtures'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  assumptions: { current: vi.fn() },
  drafts: {
    list: vi.fn(),
    attached: vi.fn(),
    accept: vi.fn(),
    decide: vi.fn(),
    merge: vi.fn(),
    distinct: vi.fn(),
    acceptInCriteria: vi.fn(),
  },
  explorations: { list: vi.fn() },
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import PortalPhotos from '@/components/listings/PortalPhotos.vue'
import DraftCard from './DraftCard.vue'
import DraftsTab from './DraftsTab.vue'

const photo = (n: number) => `https://img.example.test/annonce/${n}.jpg`

/** Un brouillon né d'une page ouverte : photos, faits, chiffres. */
function openedDraft(over: Partial<ListingDraft> = {}): ListingDraft {
  const listing = ListingInputSchema.parse({
    title: '[Exemple] T3 62 m², page ouverte',
    price: 205_000,
    surface: 62,
    rooms: 3,
    floor: 3,
    floorsTotal: 5,
    elevator: true,
    dpeClass: 'C',
    heatingType: 'gaz',
    lotsCount: 24,
    annualCharges: 1440,
    description: 'Description entière fictive.\nAscenseur, cave.',
    portalPhotos: [photo(1), photo(2), photo(3)],
    location: { commune: 'Bordeaux', district: 'Caudéran' },
  })
  const financials = financialsFromListing({
    ...listing,
    rentalPlan: null,
    renovation: null,
  } as never)
  const metrics = compute(financials, DEFAULT_ASSUMPTIONS)
  return fakeDraft({
    listing,
    evaluation: {
      metrics,
      rental: { verdict: 'unknown', checks: [] } as never,
      targetPrice: targetPrice(financials, DEFAULT_ASSUMPTIONS),
    },
    warnings: ['Taxe foncière non affichée : à demander.'],
    ...over,
  })
}

let wrapper: VueWrapper | null = null

async function mountTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/annonces',
        name: 'listings',
        component: { render: () => null },
      },
      {
        path: '/annonces/:id',
        name: 'listing',
        component: { render: () => null },
      },
      {
        path: '/annonces/nouvelle',
        name: 'listing-new',
        component: { render: () => null },
      },
      {
        path: '/annonces/tri',
        name: 'triage',
        component: { render: () => null },
      },
      {
        path: '/criteres',
        name: 'criteria',
        component: { render: () => null },
      },
    ],
  })
  await router.push('/annonces')
  await router.isReady()
  wrapper = mount(DraftsTab, {
    props: { view: 'cards' },
    attachTo: document.body,
    global: { plugins: [router, [VueQueryPlugin, { queryClient: client }]] },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.workspace.mockResolvedValue({
    me: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    workspace: { members: [] },
  })
  apiMock.assumptions.current.mockResolvedValue({
    values: DEFAULT_ASSUMPTIONS,
  })
  apiMock.drafts.attached.mockResolvedValue([])
  apiMock.explorations.list.mockResolvedValue([])
  apiMock.drafts.list.mockResolvedValue([])
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('PortalPhotos', () => {
  it('une grande photo, ses vignettes, les flèches qui bouclent', async () => {
    const w = mount(PortalPhotos, {
      props: { photos: [photo(1), photo(2)], portalLabel: 'Leboncoin' },
    })
    const main = () => w.get('[data-testid="portal-photo-main"]')
    expect(main().attributes('src')).toBe(photo(1))
    expect(main().attributes('referrerpolicy')).toBe('no-referrer')
    await w.get('[data-action="next-photo"]').trigger('click')
    expect(main().attributes('src')).toBe(photo(2))
    await w.get('[data-action="next-photo"]').trigger('click')
    expect(main().attributes('src')).toBe(photo(1))
    await w.get('[data-action="previous-photo"]').trigger('click')
    expect(main().attributes('src')).toBe(photo(2))
    await w
      .findAll('[data-testid="portal-photo-thumbs"] button')[0]
      ?.trigger('click')
    expect(main().attributes('src')).toBe(photo(1))
    expect(w.text()).toContain('2 photos de Leboncoin')
  })

  it('une photo retirée disparaît ; toutes retirées, la galerie le dit', async () => {
    const w = mount(PortalPhotos, { props: { photos: [photo(1), photo(2)] } })
    await w.get('[data-testid="portal-photo-main"]').trigger('error')
    expect(w.get('[data-testid="portal-photo-main"]').attributes('src')).toBe(
      photo(2)
    )
    expect(w.find('[data-action="next-photo"]').exists()).toBe(false)
    await w.get('[data-testid="portal-photo-main"]').trigger('error')
    expect(w.find('[data-testid="portal-photos-gone"]').exists()).toBe(true)
  })

  it('rien sans photo', () => {
    const w = mount(PortalPhotos, { props: { photos: [] } })
    expect(w.find('[data-testid="portal-photos"]').exists()).toBe(false)
  })
})

describe('Carte d’un brouillon', () => {
  it('la première photo en tête ; elle et « Voir tout le détail » ouvrent le détail', async () => {
    const w = mount(DraftCard, {
      props: { draft: openedDraft() },
      global: { stubs: { RouterLink: true } },
    })
    const cover = w.get('[data-testid="draft-cover"] img')
    expect(cover.attributes('src')).toBe(photo(1))
    await w.get('[data-testid="draft-cover"]').trigger('click')
    await w.get('[data-action="details"]').trigger('click')
    expect(w.emitted('details')).toHaveLength(2)
    await cover.trigger('error')
    expect(w.find('[data-testid="draft-cover"]').exists()).toBe(false)
  })

  it('sans photo, pas de couverture, mais le détail reste ouvrable', () => {
    const w = mount(DraftCard, {
      props: { draft: fakeDraft() },
      global: { stubs: { RouterLink: true } },
    })
    expect(w.find('[data-testid="draft-cover"]').exists()).toBe(false)
    expect(w.find('[data-action="details"]').exists()).toBe(true)
  })
})

describe('Le brouillon lu comme une fiche', () => {
  it('photos, chiffres, faits par thème, ce qui manque, description entière', async () => {
    const draft = openedDraft()
    apiMock.drafts.list.mockResolvedValue([draft])
    const w = await mountTab()
    await w.get('[data-action="details"]').trigger('click')
    await flushPromises()

    const panel = document.querySelector('[data-testid="draft-detail"]')
    expect(panel).not.toBeNull()
    const text = panel?.textContent?.replace(/[\u202f\u00a0]/g, ' ') ?? ''
    expect(
      panel
        ?.querySelector('[data-testid="portal-photo-main"]')
        ?.getAttribute('src')
    ).toBe(photo(1))
    expect(
      panel?.querySelectorAll('[data-testid="draft-figures"] [data-figure]')
    ).toHaveLength(4)
    const fact = (key: string) =>
      panel
        ?.querySelector(`[data-fact="${key}"] dd`)
        ?.textContent?.replace(/[\u202f\u00a0]/g, ' ')
        .trim()
    expect(fact('floor')).toBe('3e sur 5')
    expect(fact('elevator')).toBe('oui')
    expect(fact('annualCharges')).toBe('1 440 € par an')
    expect(fact('propertyTax')).toBe('non indiqué')
    expect(fact('lotsCount')).toBe('24')
    expect(text).toContain('Taxe foncière non affichée : à demander.')
    expect(
      panel?.querySelector('[data-testid="draft-description"]')?.textContent
    ).toContain('Ascenseur, cave.')
  })

  it('« Ajouter à la liste » depuis le détail ajoute et ferme le panneau', async () => {
    const draft = openedDraft()
    apiMock.drafts.list.mockResolvedValue([draft])
    apiMock.drafts.accept.mockResolvedValue({
      draft: { ...draft, status: 'accepted', listingId: 'l1' },
      listingId: '11111111-1111-4111-8111-111111111111',
      decision: null,
    })
    const w = await mountTab()
    await w.get('[data-action="details"]').trigger('click')
    await flushPromises()
    const add = document.querySelector<HTMLButtonElement>(
      '[data-action="detail-accept"]'
    )
    expect(add?.textContent).toContain('Ajouter à la liste')
    add?.click()
    await flushPromises()
    expect(apiMock.drafts.accept).toHaveBeenCalledWith(draft.id)
    expect(document.querySelector('[data-testid="draft-detail"]')).toBeNull()
    expect(w.find('[data-testid="draft-added"]').exists()).toBe(true)
  })

  it('un ajout refusé se dit dans le panneau, qui reste ouvert', async () => {
    const draft = openedDraft()
    apiMock.drafts.list.mockResolvedValue([draft])
    apiMock.drafts.accept.mockRejectedValue(new Error('Refus fictif'))
    const w = await mountTab()
    await w.get('[data-action="details"]').trigger('click')
    await flushPromises()
    document
      .querySelector<HTMLButtonElement>('[data-action="detail-accept"]')
      ?.click()
    await flushPromises()
    expect(
      document.querySelector('[data-testid="draft-detail"]')
    ).not.toBeNull()
    // Le message est dit dans le panneau (pied) comme sur la carte, derrière.
    const said = document.body.textContent?.split('L’action a échoué.') ?? []
    expect(said.length - 1).toBe(2)
  })
})
