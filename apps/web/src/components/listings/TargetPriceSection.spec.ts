import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { DEFAULT_ASSUMPTIONS } from '@apart/contracts'
import { fakeEvaluated, fakeTargetPriceReport } from '@/test/fixtures'
import TargetCriteriaTable from './TargetCriteriaTable.vue'
import TargetPriceSection from './TargetPriceSection.vue'

describe('TargetPriceSection', () => {
  it('répond « à partir de quel prix » : prix cible, critère liant, décote classée, rang, offre suggérée', () => {
    const item = fakeEvaluated({
      publishedAt: '2026-08-01T00:00:00.000Z',
      renovation: null,
      annualCharges: null,
      assumptionsOverride: null,
    })
    const report = fakeTargetPriceReport(item)
    const wrapper = mount(TargetPriceSection, {
      props: {
        price: report.price,
        targetPrice: report.targetPrice,
        negotiation: report.negotiation,
        rank: report.rank,
        notaryFees: report.notaryFees,
        assumptions: DEFAULT_ASSUMPTIONS,
        rent: item.evaluation.metrics.rent,
      },
    })
    expect(wrapper.text()).toContain('À partir de quel prix ?')
    expect(wrapper.text()).toContain(
      'le prix affiché maximal, et le coût tout compris qu’il entraîne'
    )
    expect(wrapper.get('[data-testid="target-price"]').text()).toMatch(
      /147\s56\d €/
    )
    expect(wrapper.text()).toContain('critère liant')
    expect(wrapper.text()).toContain('Rendement brut')
    const pill = wrapper.get('[data-testid="discount-class"]')
    expect(pill.attributes('data-discount-class')).toBe('out_of_reach')
    expect(pill.text()).toContain('Hors de portée')
    expect(pill.text()).toContain('26,2 %')
    expect(wrapper.get('[data-testid="rank"]').text()).toContain('sur 3')
    expect(wrapper.get('[data-criterion="gross_yield"]').classes()).toContain(
      'bg-accent-soft'
    )
    expect(wrapper.get('[data-criterion="effort"]').text()).toMatch(
      /161\s8\d\d €/
    )
    expect(wrapper.find('[data-criterion="net_yield"]').exists()).toBe(false)
    const offer = wrapper.get('[data-testid="suggested-offer"]')
    expect(offer.text()).toMatch(/147\s000 €/)
    expect(offer.text()).toContain('prix cible arrondi au millier inférieur')
    expect(offer.text()).toContain('de marge sous le prix cible')
    expect(offer.find('[data-argument="time_on_market"]').text()).toContain(
      'jours'
    )
    expect(wrapper.text()).toContain('taux forfaitaire')
    expect(wrapper.text()).toContain('comptés dans le coût tout compris')
  })

  it('aperçu en direct sans rang, et message quand le prix cible manque', () => {
    const item = fakeEvaluated()
    const report = fakeTargetPriceReport(item)
    const live = mount(TargetPriceSection, {
      props: {
        price: report.price,
        targetPrice: report.targetPrice,
        negotiation: report.negotiation,
        rank: null,
        notaryFees: {
          ...report.notaryFees,
          mode: 'scale',
          transferTax: 12_637,
          emoluments: 1995,
          emolumentsVat: 399,
          securityContribution: 200,
          disbursements: 800,
          total: 16_031,
        },
        live: true,
      },
    })
    expect(live.text()).toContain('aperçu en direct')
    expect(live.find('[data-testid="rank"]').exists()).toBe(false)
    expect(live.text()).toContain('barème')
    const empty = mount(TargetPriceSection, {
      props: {
        price: 200_000,
        targetPrice: null,
        negotiation: null,
        rank: null,
        notaryFees: null,
      },
    })
    expect(empty.text()).toContain('Prix cible non calculable')
  })
})

describe('TargetCriteriaTable (lot 9)', () => {
  it('par critère : exigence, prix affiché maximal, coût tout compris maximal, décote ; liant surligné, non retenu grisé', () => {
    const item = fakeEvaluated({
      renovation: null,
      annualCharges: null,
      assumptionsOverride: null,
    })
    const report = fakeTargetPriceReport(item)
    const wrapper = mount(TargetCriteriaTable, {
      props: {
        targetPrice: report.targetPrice,
        assumptions: DEFAULT_ASSUMPTIONS,
        rent: item.evaluation.metrics.rent,
      },
    })
    const headers = wrapper.findAll('thead th').map(th => th.text())
    expect(headers).toEqual([
      'Critère',
      'Exigence',
      'sur le prix Prix affiché max',
      'tout compris Coût tout compris max',
      'Décote',
    ])
    const gross = wrapper.get('[data-criterion="gross_yield"]')
    expect(gross.attributes('data-binding')).toBe('true')
    expect(gross.classes()).toContain('bg-accent-soft')
    expect(gross.text()).toContain('critère liant')
    expect(gross.text()).toContain('≥ 5,5 %')
    expect(gross.get('[data-col="max-cost"]').text()).toMatch(/163\s636 €/)
    expect(gross.get('[data-col="discount"]').text()).toMatch(/^−26,2 %$/)
    const effort = wrapper.get('[data-criterion="effort"]')
    expect(effort.text()).toContain('≤ 150 €/mois')
    expect(effort.get('[data-col="max-cost"]').text()).toMatch(/179\s013 €/)
    const rule = wrapper.get('[data-criterion="rent_x220"]')
    expect(rule.classes()).toContain('text-muted')
    expect(rule.text()).toContain('(non retenu)')
    expect(rule.text()).toMatch(/coût ≤ 220 × 750 €/)
    expect(rule.get('[data-col="max-cost"]').text()).toMatch(/165\s000 €/)
  })

  it('sans hypothèses, les seuils restent à « — » ; le critère marché a son exigence', () => {
    const item = fakeEvaluated({
      openDataContext: {
        market: {
          medianPricePerM2: 4000,
          count: 12,
          radiusMeters: 500,
          computedAt: '2026-11-03T10:00:00.000Z',
        },
        dpe: null,
        rentControl: null,
        transit: null,
      },
    })
    const wrapper = mount(TargetCriteriaTable, {
      props: {
        targetPrice: item.evaluation.targetPrice,
        assumptions: null,
        rent: 750,
      },
    })
    expect(wrapper.get('[data-criterion="gross_yield"]').text()).toContain('—')
    expect(wrapper.get('[data-criterion="market"]').text()).toContain(
      'prix ≤ médiane DVF × surface'
    )
    expect(
      wrapper.get('[data-criterion="market"] [data-col="discount"]').text()
    ).toMatch(/^[−+]/)
  })
})
