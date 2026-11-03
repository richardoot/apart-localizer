/**
 * Brief de négociation (besoins N2, N5) : décote par critère, offre suggérée
 * au millier inférieur, marge, arguments factuels. Aucune IA, fonction pure.
 */
import { describe, expect, it } from 'vitest'
import type { NegotiationArgumentKind } from '@apart/contracts'
import { floorToThousand, negotiationBrief, targetPrice } from '../src/index.js'
import type { NegotiationListing } from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS, DOC_EXAMPLE, financials } from './helpers.js'

const A = ARTIFACT_ASSUMPTIONS
const NOW = new Date('2026-11-03T12:00:00.000Z')

const base: NegotiationListing = {
  price: 200_000,
  publishedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  dpeClass: 'D',
  renovationTotal: 0,
  annualCharges: null,
  surface: 45,
  priceEvents: [
    {
      occurredAt: '2026-11-01T10:00:00.000Z',
      oldPrice: null,
      newPrice: 200_000,
    },
  ],
  offers: [],
}

const kinds = (
  b: ReturnType<typeof negotiationBrief>
): NegotiationArgumentKind[] => b.arguments.map(x => x.kind)

describe('negotiationBrief', () => {
  it('exemple § 8 : offre à 147 000 €, marge ≈ 568 €, hors de portée, aucun argument', () => {
    const t = targetPrice(DOC_EXAMPLE, A)
    const brief = negotiationBrief(base, t, A, { now: NOW })
    expect(brief.listedPrice).toBe(200_000)
    expect(brief.bindingCriterion).toBe('gross_yield')
    expect(brief.discountClass).toBe('out_of_reach')
    expect(brief.suggestedOffer).toBe(147_000)
    expect(brief.suggestedOfferDiscount).toBeCloseTo(0.265, 3)
    // P_b ≈ 147 568 € : la marge est la fraction de millier abandonnée.
    expect(brief.marginToTarget).toBeGreaterThan(568)
    expect(brief.marginToTarget).toBeLessThan(570)
    const byCriterion = Object.fromEntries(
      brief.criteria.map(c => [c.criterion, c])
    )
    expect(byCriterion.gross_yield?.discountClass).toBe('out_of_reach')
    expect(Math.round((byCriterion.effort?.discount ?? 0) * 100)).toBe(19)
    expect(byCriterion.net_yield?.maxPrice).toBeNull()
    expect(byCriterion.net_yield?.discountClass).toBeNull()
    expect(byCriterion.market?.active).toBe(false)
    expect(brief.daysOnline).toBe(2)
    expect(brief.daysOnlineSince).toBe('added')
    expect(brief.priceDrops).toEqual({
      count: 0,
      firstPrice: 200_000,
      totalDrop: 0,
      totalDropRate: 0,
    })
    expect(brief.lastOffer).toBeNull()
    expect(brief.arguments).toEqual([])
  })

  it('durée en ligne : depuis la publication, sinon depuis l’ajout, à partir de 30 jours', () => {
    const published = negotiationBrief(
      { ...base, publishedAt: '2026-08-01T00:00:00.000Z' },
      targetPrice(DOC_EXAMPLE, A),
      A,
      { now: NOW }
    )
    expect(published.daysOnline).toBe(94)
    expect(published.daysOnlineSince).toBe('published')
    expect(kinds(published)).toEqual(['time_on_market'])
    expect(published.arguments[0]?.text).toContain('94 jours')

    const added = negotiationBrief(
      { ...base, createdAt: '2026-09-01T00:00:00.000Z' },
      targetPrice(DOC_EXAMPLE, A),
      A,
      { now: NOW }
    )
    expect(added.arguments[0]?.text).toContain('date de publication inconnue')

    const unknown = negotiationBrief(
      { ...base, createdAt: null },
      targetPrice(DOC_EXAMPLE, A),
      A,
      { now: NOW }
    )
    expect(unknown.daysOnline).toBeNull()
    expect(unknown.daysOnlineSince).toBeNull()
  })

  it('baisses de prix : comptées depuis le premier prix constaté', () => {
    const listing: NegotiationListing = {
      ...base,
      price: 190_000,
      priceEvents: [
        {
          occurredAt: '2026-10-20T10:00:00.000Z',
          oldPrice: 215_000,
          newPrice: 200_000,
        },
        {
          occurredAt: '2026-09-01T10:00:00.000Z',
          oldPrice: null,
          newPrice: 215_000,
        },
        {
          occurredAt: '2026-11-02T10:00:00.000Z',
          oldPrice: 200_000,
          newPrice: 190_000,
        },
      ],
    }
    const brief = negotiationBrief(
      listing,
      targetPrice(financials({ price: 190_000 }), A),
      A,
      { now: NOW }
    )
    expect(brief.priceDrops.count).toBe(2)
    expect(brief.priceDrops.firstPrice).toBe(215_000)
    expect(brief.priceDrops.totalDrop).toBe(25_000)
    expect(brief.priceDrops.totalDropRate).toBeCloseTo(25_000 / 215_000, 9)
    expect(kinds(brief)).toContain('price_drops')
    expect(brief.arguments.find(x => x.kind === 'price_drops')?.text).toContain(
      '2 baisses'
    )
    // Une hausse n'est pas une baisse.
    const raised = negotiationBrief(
      {
        ...base,
        price: 210_000,
        priceEvents: [
          ...base.priceEvents,
          {
            occurredAt: '2026-11-02T10:00:00.000Z',
            oldPrice: 200_000,
            newPrice: 210_000,
          },
        ],
      },
      targetPrice(financials({ price: 210_000 }), A),
      A,
      { now: NOW }
    )
    expect(raised.priceDrops.count).toBe(0)
    expect(raised.priceDrops.totalDrop).toBe(-10_000)
    expect(kinds(raised)).not.toContain('price_drops')
  })

  it('DPE, travaux, charges élevées', () => {
    const brief = negotiationBrief(
      {
        ...base,
        dpeClass: 'F',
        renovationTotal: 12_000,
        annualCharges: 2400,
      },
      targetPrice(financials({ dpeClass: 'F', renovationTotal: 12_000 }), A),
      A,
      { now: NOW }
    )
    expect(kinds(brief)).toEqual(['dpe', 'renovation', 'charges'])
    expect(brief.arguments[0]?.text).toContain('2028')
    expect(brief.arguments[0]?.text).toContain('prévue en 2028')
    expect(brief.arguments[1]?.text).toMatch(/12\s000 €/)
    expect(brief.arguments[2]?.text).toMatch(/53 €\/m²\/an/)
    // Des charges modérées ou une surface inconnue ne font pas d'argument.
    expect(
      kinds(
        negotiationBrief(
          { ...base, annualCharges: 1200 },
          targetPrice(DOC_EXAMPLE, A),
          A,
          { now: NOW }
        )
      )
    ).toEqual([])
    expect(
      kinds(
        negotiationBrief(
          { ...base, annualCharges: 5000, surface: null },
          targetPrice(DOC_EXAMPLE, A),
          A,
          { now: NOW }
        )
      )
    ).toEqual([])
    // DPE E : interdiction en 2034, après la mise en location prévue.
    const e = negotiationBrief(
      { ...base, dpeClass: 'E' },
      targetPrice(financials({ dpeClass: 'E' }), A),
      A,
      { now: NOW }
    )
    expect(e.arguments[0]?.text).toContain('2034')
    expect(e.arguments[0]?.text).not.toContain('prévue en')
  })

  it('dernière offre : refusée, contre-proposition, en attente, acceptée', () => {
    const t = targetPrice(DOC_EXAMPLE, A)
    const at = (
      response: NegotiationListing['offers'][number]['response'],
      counterAmount: number | null = null
    ) =>
      negotiationBrief(
        {
          ...base,
          offers: [
            {
              madeAt: '2026-10-01T10:00:00.000Z',
              amount: 140_000,
              response: 'refused',
              counterAmount: null,
            },
            {
              madeAt: '2026-10-15T10:00:00.000Z',
              amount: 150_000,
              response,
              counterAmount,
            },
          ],
        },
        t,
        A,
        { now: NOW }
      )
    expect(at('refused').lastOffer?.amount).toBe(150_000)
    expect(at('refused').arguments[0]?.text).toContain(
      'refusée le 15 octobre 2026'
    )
    expect(at('counter_offer', 160_000).arguments[0]?.text).toContain(
      'au-dessus du prix cible'
    )
    expect(at('counter_offer', 145_000).arguments[0]?.text).toContain(
      'sous le prix cible : acceptable'
    )
    expect(at('counter_offer', null).arguments[0]?.text).toContain(
      'montant inconnu'
    )
    expect(at('pending').arguments[0]?.text).toContain('en attente')
    expect(at('accepted').arguments[0]?.text).toContain('acceptée')
  })

  it('déjà dans la cible : offre au prix affiché arrondi, marge positive, argument in_target', () => {
    const cheap = financials({ price: 120_500, furnitureValue: 0 })
    const t = targetPrice(cheap, A)
    expect(t.discountClass).toBe('in_target')
    const brief = negotiationBrief({ ...base, price: 120_500 }, t, A, {
      now: NOW,
    })
    expect(brief.suggestedOffer).toBe(120_000)
    expect(brief.marginToTarget).toBeGreaterThan(0)
    expect(kinds(brief)).toEqual(['in_target'])
  })

  it('sans prix cible calculable : pas d’offre suggérée', () => {
    // Sans loyer, le brut n'a pas de prix ; sans effort admis, l'effort non plus.
    const strict = { ...A, maxMonthlyEffort: 0 }
    const t = targetPrice(financials({ targetRent: 0 }), strict)
    expect(t.targetPrice).toBeNull()
    const brief = negotiationBrief(base, t, strict, { now: NOW })
    expect(brief.suggestedOffer).toBeNull()
    expect(brief.suggestedOfferDiscount).toBeNull()
    expect(brief.marginToTarget).toBeNull()
    expect(
      negotiationBrief(
        { ...base, price: 0 },
        targetPrice(financials({ price: 0 }), A),
        A,
        { now: NOW }
      ).suggestedOffer
    ).toBeNull()
  })

  it('arrondit au millier inférieur', () => {
    expect(floorToThousand(147_568.4)).toBe(147_000)
    expect(floorToThousand(999)).toBe(0)
    expect(floorToThousand(150_000)).toBe(150_000)
  })
})
