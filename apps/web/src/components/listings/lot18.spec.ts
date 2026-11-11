/**
 * Lot 18 : une annonce, plusieurs portails, dans la fiche et la liste.
 * « Où la trouver » (liens, écart de prix, ajout et refus, retrait jamais du
 * dernier, prix proposé), « Qui la vend » (vendeur, particulier, copier,
 * garde-fou), pastilles des portails, colonnes et filtres de la liste ⇄
 * URL, vérification d'un lien parmi plusieurs et « Lien ajouté », bulle de
 * la carte. Données fictives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { EvaluatedListing } from '@apart/contracts'
import { fakeEvaluated, fakeLink } from '@/test/fixtures'
import { mapLibreMock } from '@/test/setup'
import {
  filtersFromQuery,
  queryFromFilters,
  sellerChoiceOf,
  useFiltersStore,
} from '@/stores/filters'

const apiMock = vi.hoisted(() => ({
  listings: {
    update: vi.fn(),
    recordPriceChange: vi.fn(),
    checks: vi.fn(),
    applyCheck: vi.fn(),
  },
  links: { add: vi.fn(), update: vi.fn(), remove: vi.fn(), list: vi.fn() },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import { useFeedbackStore } from '@/stores/feedback'
import FiltersBar from './FiltersBar.vue'
import ListingCards from './ListingCards.vue'
import ListingLinksSection from './ListingLinksSection.vue'
import ListingsMap from './ListingsMap.vue'
import ListingsTable from './ListingsTable.vue'
import PortalChips from './PortalChips.vue'
import SellerSection from './SellerSection.vue'

enableAutoUnmount(afterEach)

const LISTING = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-11-06T10:00:00.000Z')
/** Espaces fines et insécables des montants ramenées à des espaces. */
const n = (value: string): string => value.replace(/[\u202f\u00a0]/g, ' ')

const LBC = fakeLink({
  id: 'ffffffff-ffff-4fff-8fff-ffffffffff01',
  price: 214_000,
  lastSeenOnlineAt: '2026-11-05T09:00:00.000Z',
})
const SL = fakeLink({
  id: 'ffffffff-ffff-4fff-8fff-ffffffffff02',
  portal: 'seloger',
  url: 'https://www.seloger.com/annonces/0000000202.htm',
  normalizedUrl: 'https://seloger.com/annonces/0000000202.htm',
  externalId: null,
  price: 219_000,
  primary: false,
  origin: 'claude',
  readReference: 'EX-2041',
  lastSeenOnlineAt: '2026-11-05T09:00:00.000Z',
  createdAt: '2026-11-03T10:00:00.000Z',
})
const BI = fakeLink({
  id: 'ffffffff-ffff-4fff-8fff-ffffffffff03',
  portal: 'bienici',
  url: 'https://www.bienici.com/annonce/0000000303',
  normalizedUrl: 'https://bienici.com/annonce/0000000303',
  externalId: null,
  price: 214_000,
  primary: false,
  online: false,
  offlineSince: '2026-11-04T09:00:00.000Z',
  origin: 'manual',
  createdAt: '2026-11-03T12:00:00.000Z',
})

function chartrons(
  over: Partial<EvaluatedListing['listing']> = {},
  links = [LBC, SL, BI]
): EvaluatedListing {
  return fakeEvaluated(
    {
      id: LISTING,
      title: '[Exemple] T3 68 m², balcon sud',
      price: 214_000,
      updatedAt: '2026-11-05T12:00:00.000Z',
      sellerType: 'agency',
      sellerName: '[Exemple] Immobilier des Chartrons',
      sellerReference: 'EX-2041',
      sellerReferenceKey: 'EX2041',
      fieldSources: {
        sellerReference: {
          source: 'listing',
          evidence: 'Lue par Claude sur SeLoger',
          recordedAt: '2026-11-03T10:00:00.000Z',
        },
      },
      ...over,
    },
    { links }
  )
}

function plugins() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return [[VueQueryPlugin, { queryClient: client }]] as never
}

const stubs = { RouterLink: { template: '<a data-router-link><slot /></a>' } }

function writeResult(item: EvaluatedListing, summary: string) {
  return {
    link: null,
    check: null,
    listing: item,
    priceProposal: null,
    summary,
  }
}

describe('Lot 18 : « Où la trouver »', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mountLinks(item: EvaluatedListing) {
    return mount(ListingLinksSection, {
      props: { item, now: NOW },
      attachTo: document.body,
      global: { plugins: plugins(), stubs },
    })
  }

  it('les liens, le principal d’abord : origine, prix et écart, vue en ligne ou plus en ligne', () => {
    const wrapper = mountLinks(chartrons())
    expect(wrapper.get('[data-testid="links-count"]').text()).toBe(
      '3 liens · 2 en ligne'
    )
    const rows = wrapper.findAll('[data-testid="links-list"] > li')
    expect(rows.map(r => r.attributes('data-portal'))).toEqual([
      'leboncoin',
      'seloger',
      'bienici',
    ])
    expect(rows[0]?.text()).toContain('lien principal')
    expect(rows[0]?.text()).toContain('lien d’origine · n° 0000000101')
    expect(rows[0]?.text()).toContain('vue hier')
    expect(rows[1]?.text()).toContain('rattaché par Claude, même référence')
    expect(n(rows[1]?.get('[data-testid="link-gap"]').text() ?? '')).toBe(
      '+5 000 € : frais inclus ?'
    )
    expect(rows[2]?.attributes('data-online')).toBe('false')
    expect(rows[2]?.get('[data-testid="link-state"]').text()).toBe(
      'Plus en ligne · le 4 nov.'
    )
    expect(rows[2]?.find('[data-testid="link-gap"]').exists()).toBe(false)
    const open = rows[1]?.findAll('a').find(a => a.text() === 'Ouvrir')
    expect(open?.attributes('href')).toBe(SL.url)
    expect(open?.attributes('target')).toBe('_blank')
    expect(open?.attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.text()).toContain('Le prix de la fiche est le plus bas')
    expect(wrapper.find('[data-testid="price-proposal"]').exists()).toBe(false)
  })

  it('ajoute un lien collé : portail reconnu, rien d’autre de lu, avec le garde-fou', async () => {
    const item = chartrons()
    apiMock.links.add.mockResolvedValue(
      writeResult(item, 'Lien Logic-Immo ajouté')
    )
    const wrapper = mountLinks(item)
    expect(wrapper.get('[data-testid="new-link-hint"]').text()).toContain(
      'Rien n’est téléchargé'
    )
    const url = 'https://www.logic-immo.com/detail-vente-0000000404.htm'
    await wrapper.get('[data-testid="new-link-url"]').setValue(url)
    expect(wrapper.get('[data-testid="new-link-hint"]').text()).toContain(
      'Portail reconnu : Logic-Immo.'
    )
    await wrapper.get('[data-testid="add-link-form"]').trigger('submit')
    await flushPromises()
    expect(apiMock.links.add).toHaveBeenCalledWith(LISTING, {
      url,
      origin: 'manual',
      expectedUpdatedAt: '2026-11-05T12:00:00.000Z',
    })
    expect(useFeedbackStore().messages.at(-1)?.text).toBe(
      'Lien Logic-Immo ajouté. Claude relèvera son prix à la prochaine tournée.'
    )
  })

  it('un site inconnu se range en site d’agence ; prix et « vu en ligne » facultatifs', async () => {
    const item = chartrons()
    apiMock.links.add.mockResolvedValue(writeResult(item, 'Lien ajouté'))
    const wrapper = mountLinks(item)
    const url = 'https://agence.exemple.invalid/biens/EX-2041'
    await wrapper.get('[data-testid="new-link-url"]').setValue(url)
    expect(wrapper.get('[data-testid="new-link-hint"]').text()).toContain(
      'Portail non reconnu'
    )
    await wrapper.get('input[value="agence"]').setValue(true)
    await wrapper.get('[data-testid="new-link-price"]').setValue('214 000')
    await wrapper.get('[data-testid="new-link-online"]').setValue(true)
    await wrapper.get('[data-testid="add-link-form"]').trigger('submit')
    await flushPromises()
    expect(apiMock.links.add).toHaveBeenCalledWith(LISTING, {
      url,
      origin: 'manual',
      portal: 'agence',
      price: 214_000,
      online: true,
      expectedUpdatedAt: '2026-11-05T12:00:00.000Z',
    })
  })

  it('une URL déjà sur une autre fiche : le refus nomme cette annonce, sans identifiant', async () => {
    const { ApiError } =
      await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
    apiMock.links.add.mockRejectedValue(
      new ApiError(
        409,
        'Ce lien est déjà celui de l’annonce « [Exemple] T2 52 m², parquet » [id 22222222-2222-4222-8222-222222222222] : une même URL ne peut pas être sur deux fiches.'
      )
    )
    const wrapper = mountLinks(chartrons())
    await wrapper
      .get('[data-testid="new-link-url"]')
      .setValue('https://www.pap.fr/annonces/r0000000505')
    await wrapper.get('[data-testid="add-link-form"]').trigger('submit')
    await flushPromises()
    const failure = wrapper.get('[data-testid="links-failure"]').text()
    expect(failure).toContain(
      'Ce lien est déjà celui de l’annonce « [Exemple] T2 52 m², parquet »'
    )
    expect(failure).not.toContain('[id')
    expect(wrapper.get('[data-testid="links-conflict"]').text()).toBe(
      'Ouvrir « [Exemple] T2 52 m², parquet »'
    )
  })

  it('relève un lien à la main (plus en ligne, prix) et retire un lien après confirmation', async () => {
    const item = chartrons()
    apiMock.links.update.mockResolvedValue(
      writeResult(item, 'SeLoger : plus en ligne')
    )
    apiMock.links.remove.mockResolvedValue(
      writeResult(item, 'Lien Bien’ici retiré')
    )
    const wrapper = mountLinks(item)
    const sl = wrapper.get(`[data-link="${SL.id}"]`)
    await sl.get('[data-action="toggle-online"]').trigger('click')
    await flushPromises()
    expect(apiMock.links.update).toHaveBeenCalledWith(LISTING, SL.id, {
      online: false,
      expectedUpdatedAt: '2026-11-05T12:00:00.000Z',
    })
    expect(
      wrapper.get(`[data-link="${BI.id}"] [data-action="toggle-online"]`).text()
    ).toBe('De nouveau en ligne')
    await sl.get('[data-action="edit-price"]').trigger('click')
    await wrapper.get('[data-testid="link-price-input"]').setValue('217 000')
    await wrapper.get('[data-testid="link-price-form"]').trigger('submit')
    await flushPromises()
    expect(apiMock.links.update).toHaveBeenLastCalledWith(LISTING, SL.id, {
      price: 217_000,
      expectedUpdatedAt: '2026-11-05T12:00:00.000Z',
    })
    const bi = wrapper.get(`[data-link="${BI.id}"]`)
    await bi.get('[data-action="remove"]').trigger('click')
    expect(apiMock.links.remove).not.toHaveBeenCalled()
    await bi.get('[data-action="confirm-remove"]').trigger('click')
    await flushPromises()
    expect(apiMock.links.remove).toHaveBeenCalledWith(LISTING, BI.id)
    expect(useFeedbackStore().messages.at(-1)?.text).toBe(
      'Lien Bien’ici retiré.'
    )
  })

  it('le dernier lien ne se retire pas', () => {
    const wrapper = mountLinks(chartrons({}, [LBC]))
    const remove = wrapper.get('[data-action="remove"]')
    expect(remove.attributes('disabled')).toBeDefined()
    expect(remove.attributes('title')).toContain('ne se retire pas')
    expect(wrapper.get('[data-testid="last-link-note"]').text()).toContain(
      'une annonce garde au moins un lien'
    )
    expect(wrapper.get('[data-testid="links-count"]').text()).toBe(
      '1 lien · en ligne'
    )
  })

  it('un prix saisi à la main n’est jamais remplacé : « Prendre ce prix »', async () => {
    const item = chartrons({
      price: 200_000,
      fieldSources: { price: { source: 'user' } },
    })
    apiMock.listings.recordPriceChange.mockResolvedValue(chartrons())
    const wrapper = mountLinks(item)
    const proposal = wrapper.get('[data-testid="price-proposal"]')
    expect(n(proposal.text())).toContain(
      'Prix de la fiche saisi à la main : 200 000 €. Le plus bas affiché en ligne est 214 000 € (Leboncoin).'
    )
    await proposal.get('[data-action="take-price"]').trigger('click')
    await flushPromises()
    expect(apiMock.listings.recordPriceChange).toHaveBeenCalledWith(LISTING, {
      newPrice: 214_000,
      expectedPrice: 200_000,
      source: 'listing',
    })
  })

  it('sans lien : le dit et propose d’en ajouter un', () => {
    const wrapper = mountLinks(chartrons({}, []))
    expect(wrapper.get('[data-testid="links-empty"]').text()).toContain(
      'Aucun lien'
    )
    expect(wrapper.get('[data-testid="links-count"]').text()).toBe('Aucun lien')
  })
})

describe('Lot 18 : « Qui la vend »', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mountSeller(item: EvaluatedListing) {
    return mount(SellerSection, {
      props: { item },
      attachTo: document.body,
      global: { plugins: plugins(), stubs },
    })
  }

  it('agence, nom, référence et d’où elle vient ; « Copier »', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const wrapper = mountSeller(
      chartrons({}, [{ ...LBC, readReference: 'Réf. EX 2041' }, SL, BI])
    )
    expect(
      (wrapper.get('[data-seller="agency"]').element as HTMLInputElement)
        .checked
    ).toBe(true)
    expect(
      (wrapper.get('[data-testid="seller-name"]').element as HTMLInputElement)
        .value
    ).toBe('[Exemple] Immobilier des Chartrons')
    expect(wrapper.get('[data-testid="reference-provenance"]').text()).toBe(
      'Lue par Claude sur SeLoger le 3 nov., la même sur Leboncoin.'
    )
    expect(wrapper.text()).toContain('Jamais le nom d’une personne')
    await wrapper.get('[data-action="copy-reference"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('EX-2041')
    expect(wrapper.get('[data-action="copy-reference"]').text()).toBe('Copiée')
    // Rien n'a changé : pas de bouton d'enregistrement.
    expect(wrapper.find('[data-action="save-seller"]').exists()).toBe(false)
    // Lot 19 : le contact de l'annonceur est dans l'onglet « À faire ».
    await wrapper.get('[data-action="go-todo"]').trigger('click')
    expect(wrapper.emitted('go')).toEqual([['a-faire']])
  })

  it('un particulier n’a ni agence ni référence ; enregistré avec le garde-fou', async () => {
    const item = chartrons()
    apiMock.listings.update.mockResolvedValue(item)
    const wrapper = mountSeller(item)
    await wrapper.get('[data-seller="private"]').setValue(true)
    expect(wrapper.find('[data-testid="seller-name"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="seller-reference"]').exists()).toBe(
      false
    )
    expect(wrapper.get('[data-testid="seller-private"]').text()).toContain(
      'pas de frais d’agence, pas de référence'
    )
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(apiMock.listings.update).toHaveBeenCalledWith(LISTING, {
      sellerType: 'private',
      expectedUpdatedAt: '2026-11-05T12:00:00.000Z',
    })
  })

  it('un mandataire : le nom est celui du réseau ; un refus est affiché', async () => {
    const { ApiError } =
      await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
    apiMock.listings.update.mockRejectedValue(
      new ApiError(409, "L'annonce a changé depuis votre lecture")
    )
    const wrapper = mountSeller(
      chartrons({
        sellerType: 'unknown',
        sellerName: null,
        sellerReference: null,
        sellerReferenceKey: null,
        fieldSources: {},
      })
    )
    expect(wrapper.get('[data-testid="seller-unknown"]').text()).toContain(
      'Pas encore lu'
    )
    await wrapper.get('[data-seller="mandatary"]').setValue(true)
    expect(wrapper.get('label[for="seller-name"]').text()).toBe('Réseau')
    await wrapper
      .get('[data-testid="seller-name"]')
      .setValue('[Exemple] Réseau des conseillers')
    await wrapper.get('[data-testid="seller-reference"]').setValue(' EX-3310 ')
    expect(
      wrapper.get('[data-action="copy-reference"]').attributes('disabled')
    ).toBeDefined()
    await wrapper.get('[data-action="save-seller"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(apiMock.listings.update).toHaveBeenCalledWith(LISTING, {
      sellerType: 'mandatary',
      sellerName: '[Exemple] Réseau des conseillers',
      sellerReference: 'EX-3310',
      expectedUpdatedAt: '2026-11-05T12:00:00.000Z',
    })
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "L'annonce a changé depuis votre lecture"
    )
  })
})

describe('Lot 18 : pastilles, liste, filtres', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('pastilles : courtes ou longues, barrées quand le lien n’est plus en ligne', () => {
    const short = mount(PortalChips, {
      props: { links: [BI, SL, LBC], short: true },
    })
    const chips = short.findAll('[data-portal]')
    expect(chips.map(c => c.text())).toEqual([
      'LBC',
      'SL',
      'BI (plus en ligne)',
    ])
    expect(chips[2]?.classes()).toContain('line-through')
    expect(chips[2]?.attributes('title')).toBe('Bien’ici : plus en ligne')
    const linked = mount(PortalChips, { props: { links: [LBC], linked: true } })
    const a = linked.get('a')
    expect(a.attributes('href')).toBe(LBC.url)
    expect(a.attributes('rel')).toBe('noopener noreferrer')
    expect(mount(PortalChips, { props: { links: [] } }).html()).not.toContain(
      'portal-chips'
    )
  })

  it('tableau : portails, vendeur, référence, prix selon le portail', () => {
    const unknown = fakeEvaluated(
      { id: '33333333-3333-4333-8333-333333333333', title: 'T2 inconnu' },
      { links: [fakeLink({ id: 'ffffffff-ffff-4fff-8fff-ffffffffff09' })] }
    )
    const wrapper = mount(ListingsTable, {
      props: { items: [chartrons(), unknown] },
    })
    const headers = wrapper.findAll('thead button').map(b => b.text())
    expect(headers.some(h => h.startsWith('Portails'))).toBe(true)
    expect(headers.some(h => h.startsWith('Vendeur'))).toBe(true)
    expect(headers.some(h => h.startsWith('Référence'))).toBe(true)
    const first = wrapper.get(`tr[data-id="${LISTING}"]`)
    expect(first.text()).toContain('LBC')
    expect(first.text()).toContain('BI (plus en ligne)')
    expect(first.get('[data-testid="seller-cell"]').text()).toContain('Agence')
    expect(first.get('[data-testid="seller-cell"]').text()).toContain(
      '[Exemple] Immobilier des Chartrons'
    )
    expect(first.text()).toContain('EX-2041')
    expect(n(first.get('[data-testid="price-range"]').text())).toBe(
      'jusqu’à 219 000 € selon le portail'
    )
    const second = wrapper.get(
      'tr[data-id="33333333-3333-4333-8333-333333333333"]'
    )
    expect(second.get('[data-testid="seller-cell"]').text()).toBe('À relever')
    expect(second.text()).toContain('à relever')
    expect(second.find('[data-testid="price-range"]').exists()).toBe(false)
  })

  it('cartes : portails courts, vendeur et référence', () => {
    const wrapper = mount(ListingCards, { props: { items: [chartrons()] } })
    const line = wrapper.get('[data-testid="card-seller"]').text()
    expect(line).toContain('LBC')
    expect(line).toContain('Agence')
    expect(line).toContain('réf. EX-2041')
    expect(n(wrapper.get('[data-testid="card-price-range"]').text())).toBe(
      'jusqu’à 219 000 € selon le portail'
    )
  })

  it('filtre « Vendeur » et « Sur plusieurs portails » : store, URL, compte', async () => {
    const store = useFiltersStore()
    const wrapper = mount(FiltersBar, { props: { communes: [] } })
    const choices = wrapper.findAll('[data-testid="filter-seller"] button')
    expect(choices.map(c => c.text())).toEqual([
      'Tous',
      'Agence ou mandataire',
      'Particulier',
      'À relever',
    ])
    expect(choices[0]?.attributes('aria-pressed')).toBe('true')
    await wrapper.get('[data-seller="pro"]').trigger('click')
    expect(store.filters.sellerType).toEqual(['agency', 'mandatary'])
    expect(wrapper.get('[data-seller="pro"]').attributes('aria-pressed')).toBe(
      'true'
    )
    await wrapper.get('[data-testid="filter-multi-portal"]').setValue(true)
    expect(store.filters.multiPortal).toBe(true)
    expect(store.activeCount).toBe(2)
    expect(queryFromFilters(store.filters, 'table')).toMatchObject({
      sellerType: 'agency,mandatary',
      multiPortal: 'true',
    })
    await wrapper.get('[data-seller="all"]').trigger('click')
    expect(store.filters.sellerType).toBeUndefined()
    await wrapper.get('[data-testid="filter-multi-portal"]').setValue(false)
    expect(store.filters.multiPortal).toBeUndefined()
    expect(store.activeCount).toBe(0)
    expect(wrapper.get('#f-search').attributes('placeholder')).toContain(
      'référence'
    )
  })

  it('l’URL relit le filtre : « Particulier », « À relever », référence', () => {
    const filters = filtersFromQuery({
      sellerType: 'private',
      multiPortal: 'true',
      reference: 'EX 2041',
    })
    expect(filters).toMatchObject({
      sellerType: ['private'],
      multiPortal: true,
      reference: 'EX 2041',
    })
    expect(sellerChoiceOf(filters.sellerType)).toBe('private')
    expect(sellerChoiceOf(['unknown'])).toBe('unknown')
    expect(sellerChoiceOf(['mandatary'])).toBe('pro')
    expect(sellerChoiceOf(['private', 'unknown'])).toBe('private')
    expect(sellerChoiceOf(undefined)).toBe('all')
  })
})

// Lot 19 : la vérification d'un lien parmi plusieurs (choix du lien,
// « Lien ajouté » dans la chronologie) est dans l'onglet Historique
// (`history/history.spec.ts`).

describe('Lot 18 : la bulle de la carte', () => {
  beforeEach(() => {
    mapLibreMock.reset()
  })

  it('dit les portails (barré : plus en ligne) et le vendeur', async () => {
    const wrapper = mount(ListingsMap, {
      props: { items: [chartrons()], near: undefined, colorBy: 'verdict' },
      attachTo: document.body,
    })
    await nextTick()
    const html = mapLibreMock.markers[0]?.popup?.html ?? ''
    expect(html).toContain(
      'Sur Leboncoin · SeLoger · <s title="plus en ligne">Bien’ici</s> · Agence'
    )
    wrapper.unmount()
  })
})
