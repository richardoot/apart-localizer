import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { fakeEvaluated, fakeTargetPriceReport } from '@/test/fixtures'
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
      },
    })
    expect(wrapper.text()).toContain('À partir de quel prix ?')
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
    expect(offer.find('[data-argument="time_on_market"]').text()).toContain(
      'jours'
    )
    expect(wrapper.text()).toContain('taux forfaitaire')
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
