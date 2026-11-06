/**
 * Lot 19, onglet « Négocier : combien proposer ? » : le prix cible et sa
 * jauge resserrée, la décote, l'aperçu en direct, les ventes comparables, les
 * arguments et la copie du brief, « Préparer une offre » (coût, mensualité,
 * verdict au montant choisi, par `domain`), la sensibilité demandée
 * seulement à l'ouverture. Annonces fictives évaluées par le vrai `domain`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import type { NegotiationBrief } from '@apart/contracts'
import {
  financialsFromListing,
  negotiationBrief,
  outcomeAtPrice,
  priceRangeGauge,
  sensitivityGrid,
  targetPrice,
} from '@apart/domain'
import { formatEuros, formatEurosPerMonth } from '@/lib/format'
import { negotiationBriefText } from '@/lib/negotiation-brief'
import { fakeContext } from '@/test/criteria-fixtures'
import {
  fakeEvaluated,
  fakeListing,
  fakeOffer,
  fakeTargetPriceReport,
} from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  listings: {
    context: vi.fn(),
    sensitivity: vi.fn(),
    areas: vi.fn(),
  },
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock }
})

import HistorySection from '../HistorySection.vue'
import TargetPriceSection from '../TargetPriceSection.vue'
import NegotiateTab from '../tabs/NegotiateTab.vue'
import NegotiationArguments from './NegotiationArguments.vue'

enableAutoUnmount(afterEach)

const A = DEFAULT_ASSUMPTIONS
/** L'exemple du modèle de calcul § 8 : 200 000 €, 45 m², 750 €, mobilier 5 000 €. */
const example = fakeEvaluated({
  publishedAt: '2026-08-01T00:00:00.000Z',
  renovation: null,
  annualCharges: null,
})
const report = fakeTargetPriceReport(example)
/** Les espaces fines insécables de fr-FR, en espaces simples. */
const n = (text: string): string => text.replace(/[\u202f\u00a0]/g, ' ')

function mountTab(props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(NegotiateTab, {
    props: {
      item: example,
      evaluation: example.evaluation,
      targetPrice: report.targetPrice,
      negotiation: report.negotiation,
      rank: report.rank,
      assumptions: A,
      ...props,
    },
    attachTo: document.body,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.listings.context.mockResolvedValue(fakeContext())
  apiMock.listings.sensitivity.mockImplementation(
    (_id: string, request: { rowAxis: 'price'; colAxis: 'rent' }) =>
      Promise.resolve(
        sensitivityGrid(financialsFromListing(example.listing), A, request)
      )
  )
})

describe('Prix cible (lot 19)', () => {
  it('le prix cible en grand, la décote, la limite, le critère liant, le rang, l’offre suggérée', () => {
    const wrapper = mount(TargetPriceSection, {
      props: {
        price: report.price,
        targetPrice: report.targetPrice,
        negotiation: report.negotiation,
        rank: report.rank,
        notaryFees: report.notaryFees,
        assumptions: A,
        rent: example.evaluation.metrics.rent,
      },
    })
    const target = report.targetPrice.targetPrice as number
    expect(wrapper.get('h2').text()).toContain('Prix cible')
    expect(n(wrapper.get('[data-testid="target-price"]').text())).toMatch(
      /147 56\d €/
    )
    expect(wrapper.get('[data-testid="target-discount-text"]').text()).toBe(
      '26,2 % sous le prix affiché'
    )
    expect(n(wrapper.get('[data-testid="target-limit"]').text())).toBe(
      `au-dessus de ${n(formatEuros(target))}, l’annonce n’est plus « Cible »`
    )
    const pill = wrapper.get('[data-testid="discount-class"]')
    expect(pill.attributes('data-discount-class')).toBe('out_of_reach')
    expect(pill.text()).toContain('Décote nécessaire 26,2 % · Hors de portée')
    expect(wrapper.text()).toContain(
      'Fixé par le rendement brut (critère liant)'
    )
    expect(wrapper.get('[data-testid="rank"]').text()).toContain('sur 3')
    const offer = wrapper.get('[data-testid="suggested-offer"]')
    expect(n(offer.text())).toContain('147 000 €')
    expect(offer.text()).toContain('Prix cible arrondi au millier inférieur')
    expect(offer.text()).toContain('de marge sous le prix cible')
    // Au prix cible : l'encart « Et au prix cible ? » du lot 9.
    const at = wrapper.get('[data-testid="at-target"]')
    expect(n(at.get('[data-testid="at-target-cost"]').text())).toBe('163 636 €')
    expect(at.text()).toContain('5,5 %')
    expect(n(at.text())).toContain('−70 €/mois')
    expect(at.get('[data-verdict]').attributes('data-verdict')).toBe('target')
    // Le détail par critère et les frais de notaire, repliés.
    const details = wrapper.get('[data-testid="target-details"]')
    expect(details.attributes('open')).toBeUndefined()
    expect(details.get('[data-criterion="gross_yield"]').classes()).toContain(
      'bg-accent-soft'
    )
    expect(details.text()).toContain('taux forfaitaire')
    expect(
      wrapper.findAll('[data-term]').map(b => b.attributes('data-term'))
    ).toEqual([
      'target_price',
      'discount',
      'binding_criterion',
      'suggested_offer',
    ])
  })

  it('la jauge resserrée : zone cible jusqu’au prix cible, offre suggérée, prix affiché ; dite en texte', () => {
    const wrapper = mount(TargetPriceSection, {
      props: {
        price: report.price,
        targetPrice: report.targetPrice,
        negotiation: report.negotiation,
        rank: null,
        notaryFees: null,
      },
    })
    const target = report.targetPrice.targetPrice as number
    const g = priceRangeGauge(200_000, target, 147_000)
    expect(g).not.toBeNull()
    const gauge = wrapper.get('[data-testid="price-gauge"]')
    expect(gauge.attributes('aria-hidden')).toBe('true')
    const pct = (share: number) => `${Math.round(share * 10_000) / 100}%`
    expect(
      gauge.get('[data-marker="target-zone"]').attributes('style')
    ).toContain(`width: ${pct(g?.targetShare ?? 0)}`)
    expect(gauge.get('[data-marker="offer"]').attributes('style')).toContain(
      `left: ${pct(g?.offerShare ?? 0)}`
    )
    expect(gauge.get('[data-marker="listed"]').attributes('style')).toContain(
      `left: ${pct(g?.listedShare ?? 0)}`
    )
    const range = n(wrapper.get('[data-testid="price-range"]').text())
    expect(range).toContain(n(formatEuros(g?.min ?? 0)))
    expect(n(wrapper.get('[data-testid="gauge-target"]').text())).toBe(
      `Cible jusqu’à ${n(formatEuros(target))}`
    )
    expect(n(wrapper.get('[data-testid="gauge-listed"]').text())).toBe(
      '200 000 € affiché'
    )
  })

  it('déjà sous le prix cible : une marge ; sans offre, pas de repère ; sans prix cible, un message', () => {
    const cheap = fakeEvaluated({ price: 120_000, renovation: null })
    const brief: NegotiationBrief = {
      ...fakeTargetPriceReport(cheap).negotiation,
      suggestedOffer: null,
    }
    const wrapper = mount(TargetPriceSection, {
      props: {
        price: 120_000,
        targetPrice: cheap.evaluation.targetPrice,
        negotiation: brief,
        rank: null,
        notaryFees: null,
      },
    })
    expect(wrapper.get('[data-testid="target-discount-text"]').text()).toMatch(
      /^marge : le prix affiché est déjà .* sous le prix cible$/
    )
    expect(wrapper.get('[data-testid="discount-class"]').text()).toContain(
      'Marge'
    )
    expect(wrapper.find('[data-marker="offer"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="suggested-offer"]').exists()).toBe(false)
    const none = mount(TargetPriceSection, {
      props: {
        price: 200_000,
        targetPrice: null,
        negotiation: null,
        rank: null,
        notaryFees: null,
      },
    })
    expect(none.text()).toContain('Prix cible non calculable')
    expect(none.find('[data-testid="target-price"]').exists()).toBe(false)
  })

  it('au prix cible : DPE G reste hors cible, DPE inconnu reste à creuser', () => {
    const g = fakeEvaluated({ dpeClass: 'G' })
    const off = mount(TargetPriceSection, {
      props: {
        price: g.listing.price,
        targetPrice: g.evaluation.targetPrice,
        negotiation: null,
        rank: null,
        notaryFees: null,
      },
    })
    expect(off.get('[data-testid="at-target-why"]').text()).toBe(
      'même à ce prix, en échec : DPE E, F ou G'
    )
    const unknown = fakeEvaluated({ dpeClass: null, price: 120_000 })
    const dig = mount(TargetPriceSection, {
      props: {
        price: 120_000,
        targetPrice: unknown.evaluation.targetPrice,
        negotiation: null,
        rank: null,
        notaryFees: null,
      },
    })
    expect(dig.get('[data-testid="at-target-why"]').text()).toBe(
      'de peu : DPE inconnu'
    )
  })

  it('aperçu en direct : la mention, et l’onglet ne montre pas le rang', async () => {
    const wrapper = mountTab({ live: true })
    await flushPromises()
    expect(wrapper.get('[data-testid="target-live"]').text()).toBe(
      'aperçu en direct'
    )
    expect(wrapper.find('[data-testid="rank"]').exists()).toBe(false)
    const stored = mountTab()
    await flushPromises()
    expect(stored.find('[data-testid="target-live"]').exists()).toBe(false)
    expect(stored.get('[data-testid="rank"]').text()).toContain('sur 3')
  })
})

describe('Ventes comparables et arguments (lot 19)', () => {
  it('médiane, prix de marché, écart de l’annonce, ventes datées, raisons, lien vers la carte', async () => {
    const wrapper = mountTab()
    await flushPromises()
    expect(apiMock.listings.context).toHaveBeenCalledWith(example.listing.id)
    const market = wrapper.get('[data-testid="market"]')
    expect(n(market.text())).toContain(
      'DVF, 6 ventes à moins de 500 m depuis 2023'
    )
    expect(n(market.get('[data-testid="market-median"]').text())).toBe(
      'Médiane 4 250 €/m², soit 191 250 € pour 45 m²'
    )
    const gap = market.get('[data-testid="market-gap"]')
    expect(n(gap.text())).toBe('l’annonce : 4 444 €/m², +4,6 %')
    expect(gap.classes()).toContain('text-warn')
    const rows = market.findAll('[data-testid="market-sales"] tbody tr')
    expect(rows).toHaveLength(1)
    expect(n(rows[0]?.text() ?? '')).toContain('120 m')
    expect(rows[0]?.text()).toContain('12 juin 2024')
    expect(rows[0]?.text()).toContain('3 rue Fictive')
    expect(n(rows[0]?.text() ?? '')).toContain('44 m² · 2 p.')
    expect(market.get('[data-testid="market-reasons"]').text()).toContain(
      "jusqu'en 2024"
    )
    await market.get('[data-testid="market-map"]').trigger('click')
    expect(wrapper.emitted('go')).toEqual([['quartier']])
  })

  it('sans vente retenue ni point : pas de tableau ni de lien vers la carte', async () => {
    apiMock.listings.context.mockResolvedValueOnce(
      fakeContext({
        point: null,
        market: {
          ...fakeContext().market,
          stats: null,
          comparables: [],
          status: 'to_verify',
          gapToMarket: null,
        },
      })
    )
    const wrapper = mountTab()
    await flushPromises()
    const market = wrapper.get('[data-testid="market"]')
    expect(market.text()).toContain('À vérifier')
    expect(market.find('[data-testid="market-sales"]').exists()).toBe(false)
    expect(market.find('[data-testid="market-map"]').exists()).toBe(false)
  })

  it('arguments du brief et copie : texte composé, « Copié » ou refus', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const wrapper = mount(NegotiationArguments, {
      props: {
        title: example.listing.title,
        price: 200_000,
        targetPrice: report.targetPrice,
        negotiation: report.negotiation,
      },
    })
    expect(wrapper.find('[data-argument="time_on_market"]').text()).toContain(
      'jours'
    )
    await wrapper.get('[data-testid="copy-brief"]').trigger('click')
    await flushPromises()
    const expected = negotiationBriefText({
      title: example.listing.title,
      price: 200_000,
      targetPrice: report.targetPrice,
      negotiation: report.negotiation,
    })
    expect(writeText).toHaveBeenCalledWith(expected)
    expect(n(expected)).toContain('Prix affiché : 200 000 €')
    expect(n(expected)).toMatch(
      /Prix cible : 147 56\d € \(26,2 % sous le prix affiché\)/
    )
    expect(n(expected)).toContain('Offre suggérée : 147 000 €')
    expect(expected).toContain('Arguments :\n- ')
    expect(wrapper.get('[data-testid="copy-state"]').text()).toContain('Copié')
    writeText.mockRejectedValueOnce(new Error('refusé'))
    await wrapper.get('[data-testid="copy-brief"]').trigger('click')
    await flushPromises()
    const state = wrapper.get('[data-testid="copy-state"]')
    expect(state.text()).toContain('Copie impossible')
    expect(state.attributes('role')).toBe('alert')
  })

  it('le brief sans prix cible ni argument se réduit au prix affiché', () => {
    expect(
      negotiationBriefText({
        title: 'T2 fictif',
        price: 100_000,
        targetPrice: null,
        negotiation: null,
      })
    ).toBe(
      'Brief de négociation : T2 fictif\nPrix affiché : 100 000 €'.replace(
        / 000/,
        '\u202f000'
      )
    )
    const empty = mount(NegotiationArguments, {
      props: {
        title: 'T2 fictif',
        price: 100_000,
        targetPrice: null,
        negotiation: null,
      },
    })
    expect(empty.text()).toContain('Aucun levier factuel pour l’instant')
  })

  it('lot 15 : la durée en ligne et les baisses partent de la première publication', () => {
    const listing = fakeListing({ price: 200_000 })
    const target = targetPrice(financialsFromListing(listing), A)
    const brief = negotiationBrief(
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
            id: '99999999-9999-4999-8999-999999999999',
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
      A,
      { now: new Date('2026-11-05T12:00:00.000Z') }
    )
    const wrapper = mount(NegotiationArguments, {
      props: {
        title: listing.title,
        price: 200_000,
        targetPrice: target,
        negotiation: brief,
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

describe('Préparer une offre (lot 19)', () => {
  const financials = financialsFromListing(example.listing)
  const target = report.targetPrice.targetPrice as number

  function mountHistory(over: Record<string, unknown> = {}) {
    return mount(HistorySection, {
      props: {
        events: example.priceEvents,
        offers: [],
        currentPrice: 200_000,
        financials,
        assumptions: A,
        suggestedOffer: 147_000,
        targetPrice: target,
        ...over,
      },
    })
  }

  it('un montant proposé, puis libre : coût tout compris, mensualité et verdict à ce prix, par domain', async () => {
    const wrapper = mountHistory()
    const prep = wrapper.get('[data-testid="offer-prep"]')
    expect(prep.text()).toContain('aucune offre faite pour l’instant')
    const suggested = prep.get('[data-proposal="suggested"]')
    const targeted = prep.get('[data-proposal="target"]')
    expect(n(suggested.text())).toBe('Offre suggérée · 147 000 €')
    expect(suggested.attributes('aria-pressed')).toBe('false')
    expect(prep.find('[data-testid="offer-outcome"]').exists()).toBe(false)

    await suggested.trigger('click')
    expect(suggested.attributes('aria-pressed')).toBe('true')
    expect(
      (
        prep.get('input[aria-label="Montant de l\'offre"]')
          .element as HTMLInputElement
      ).value
    ).toBe('147000')
    const at = outcomeAtPrice(financials, A, 147_000)
    expect(n(prep.get('[data-testid="offer-outcome"]').text())).toBe(
      n(
        `À ${formatEuros(147_000)} : coût tout compris ${formatEuros(at.totalCost)}, mensualité ${formatEurosPerMonth(at.monthlyPayment)}. Verdict Cible.`
      )
    )

    await targeted.trigger('click')
    expect(targeted.attributes('aria-pressed')).toBe('true')
    expect(suggested.attributes('aria-pressed')).toBe('false')

    await prep
      .get('input[aria-label="Montant de l\'offre"]')
      .setValue('195 000')
    const high = outcomeAtPrice(financials, A, 195_000)
    expect(high.verdict).toBe('off_target')
    const text = n(prep.get('[data-testid="offer-outcome"]').text())
    expect(text).toContain(
      n(`coût tout compris ${formatEuros(high.totalCost)}`)
    )
    expect(text).toContain('Verdict Hors cible (en échec : rendement brut')
    await prep.trigger('submit')
    expect(
      (wrapper.emitted('addOffer')?.[0] as [{ amount: number }])[0].amount
    ).toBe(195_000)
  })

  it('sans prix cible ni offre suggérée : pas de montant proposé ; une offre faite se compte', () => {
    const wrapper = mountHistory({
      suggestedOffer: null,
      targetPrice: null,
      offers: [fakeOffer()],
    })
    const prep = wrapper.get('[data-testid="offer-prep"]')
    expect(prep.find('[data-proposal]').exists()).toBe(false)
    expect(prep.text()).toContain('1 offre faite')
  })
})

describe('Onglet Négocier (lot 19)', () => {
  it('les blocs dans l’ordre, la sensibilité demandée seulement à l’ouverture', async () => {
    const wrapper = mountTab()
    await flushPromises()
    const order = [
      '[data-testid="target-price-section"]',
      '[data-testid="market"]',
      '[data-testid="negotiation-arguments"]',
      '[data-testid="prices-offers"]',
      '[data-testid="sensitivity"]',
    ].map(selector => wrapper.get(selector).element)
    for (let i = 1; i < order.length; i += 1) {
      expect(
        (order[i - 1] as Element).compareDocumentPosition(order[i] as Element) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    }
    expect(apiMock.listings.sensitivity).not.toHaveBeenCalled()
    const details = wrapper.get('[data-testid="sensitivity"]')
    expect(details.attributes('open')).toBeUndefined()
    ;(details.element as HTMLDetailsElement).open = true
    await details.trigger('toggle')
    await flushPromises()
    expect(apiMock.listings.sensitivity).toHaveBeenCalledWith(
      example.listing.id,
      { rowAxis: 'price', colAxis: 'rent', includeTargetPrice: true }
    )
    expect(details.find('table').exists()).toBe(true)
  })

  it('relaie le nouveau prix, l’offre, la réponse et le statut suggéré', async () => {
    const wrapper = mountTab({
      item: { ...example, offers: [fakeOffer()] },
      suggestedStatus: 'offer_made',
    })
    await flushPromises()
    const priceForm = wrapper.get('form[aria-label="Nouveau prix constaté"]')
    await priceForm.get('input').setValue('190 000')
    await priceForm.trigger('submit')
    expect(wrapper.emitted('recordPrice')).toEqual([[190_000]])
    const prep = wrapper.get('[data-testid="offer-prep"]')
    await prep.get('[data-proposal="suggested"]').trigger('click')
    await prep.trigger('submit')
    expect(
      (wrapper.emitted('addOffer')?.[0] as [{ amount: number }])[0].amount
    ).toBe(147_000)
    await wrapper
      .get(`select[aria-label="Réponse à l'offre de ${formatEuros(150_000)}"]`)
      .setValue('accepted')
    expect(wrapper.emitted('updateOffer')?.[0]).toEqual([
      fakeOffer().id,
      { response: 'accepted', expectedResponse: 'pending' },
    ])
    await wrapper
      .get('[data-testid="suggested-status"] button')
      .trigger('click')
    expect(wrapper.emitted('setStatus')).toEqual([['offer_made']])
  })
})
