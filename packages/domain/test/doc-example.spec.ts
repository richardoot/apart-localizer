/**
 * L'exemple chiffré du modèle de calcul (§ 8), reproduit au centime quand le
 * document donne un chiffre exact, et à l'arrondi indiqué sinon.
 */
import { describe, expect, it } from 'vitest'
import { AssumptionsSchema } from '@apart/contracts'
import {
  compareScenario,
  compute,
  occupancyReport,
  projection,
  rentalChecks,
  targetPrice,
} from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS, DOC_EXAMPLE } from './helpers.js'

describe('modèle de calcul § 8', () => {
  const metrics = compute(DOC_EXAMPLE, ARTIFACT_ASSUMPTIONS)

  it('coût et financement', () => {
    expect(metrics.notaryFees).toBe(15_000)
    expect(metrics.totalCost).toBe(220_000)
    expect(metrics.loanAmount).toBe(180_000)
    expect(metrics.monthlyFactor).toBeCloseTo(0.00517, 6)
    expect(Math.round(metrics.monthlyPayment)).toBe(931)
    // 916 € de crédit + 15 € d'assurance
    const insurance =
      (metrics.loanAmount * ARTIFACT_ASSUMPTIONS.insuranceRate) / 12
    expect(Math.round(insurance)).toBe(15)
    expect(Math.round(metrics.monthlyPayment - insurance)).toBe(916)
  })

  it('exploitation', () => {
    expect(metrics.propertyTax).toBe(750)
    expect(metrics.propertyTaxEstimated).toBe(true)
    expect(metrics.collectedRent).toBe(8625)
    expect(metrics.netOperating).toBe(6825)
    expect(metrics.grossYield * 100).toBeCloseTo(4.09, 2)
    expect(metrics.netYield * 100).toBeCloseTo(3.1, 2)
    expect(Math.round(metrics.effort)).toBe(-362)
    expect(metrics.maxCostRule220).toBe(165_000)
  })

  it('verdict hors cible, brut et effort en échec', () => {
    expect(metrics.verdict).toBe('off_target')
    expect(metrics.failures).toEqual(['gross_yield', 'effort'])
    expect(metrics.nearMisses).toEqual([])
  })

  it('prix cible', () => {
    const target = targetPrice(DOC_EXAMPLE, ARTIFACT_ASSUMPTIONS)
    const by = Object.fromEntries(
      target.criteria.map(c => [c.criterion, c.maxPrice])
    )
    expect(Math.round((by.gross_yield as number) / 100) * 100).toBe(147_600)
    expect(Math.round((by.effort as number) / 100) * 100).toBe(161_900)
    expect(Math.round((by.rent_x220 as number) / 100) * 100).toBe(148_800)
    expect(by.net_yield).toBeNull()
    expect(by.market).toBeNull()
    expect(target.bindingCriterion).toBe('gross_yield')
    expect(Math.round((target.targetPrice as number) / 100) * 100).toBe(147_600)
    expect(Math.round((target.discount as number) * 100)).toBe(26)
    expect(target.discountClass).toBe('out_of_reach')
  })

  it('louabilité : sous conditions (loyer de marché, copro, décence, permis inconnus)', () => {
    const rental = rentalChecks(
      {
        dpeClass: 'D',
        year: null,
        marketRent: null,
        demand: 'strong',
        coOwnershipAllowsRental: 'unknown',
        decencyCompliant: 'unknown',
        rentalPermitRequired: 'unknown',
      },
      metrics,
      ARTIFACT_ASSUMPTIONS
    )
    expect(rental.year).toBe(2028)
    expect(rental.verdict).toBe('conditional')
    expect(rental.unknownCount).toBe(4)
    expect(rental.checks.find(c => c.key === 'effort')?.level).toBe('warn')
  })
})

describe('modèle de calcul § 8, exemple étendu (lot 5)', () => {
  const A = AssumptionsSchema.parse({
    ...ARTIFACT_ASSUMPTIONS,
    purchaseDate: '2026-01-01',
    rentalStartDate: '2028-01-01',
    currentRent: 850,
    maintenanceAnnual: 600,
    marginalTaxRate: 0.3,
  })
  const input = {
    financials: { ...DOC_EXAMPLE, annualCharges: 1200 },
    rental: {
      dpeClass: 'D' as const,
      year: null,
      marketRent: null,
      demand: 'strong' as const,
      coOwnershipAllowsRental: 'yes' as const,
      decencyCompliant: 'yes' as const,
      rentalPermitRequired: 'no' as const,
    },
    leaseType: 'unfurnished' as const,
  }
  const at = new Date('2026-11-03T10:00:00Z')

  it('phase 1 : coût d’occupation, capital, coût réel, écarts, bascule', () => {
    const o = occupancyReport(input, A, { at })
    expect(Math.round(o.monthly.total)).toBe(1143)
    expect(Math.round(o.monthly.credit)).toBe(916)
    expect(Math.round(o.capitalMonthly)).toBe(381)
    expect(Math.round(o.realCostMonthly)).toBe(762)
    expect(Math.round(o.gapToCurrentRent ?? 0)).toBe(293)
    expect(Math.round(o.realGapToCurrentRent ?? 0)).toBe(-88)
    expect(Math.round(o.phase1.netCost ?? 0)).toBe(-2236)
    expect(Math.round(o.remainingPrincipalAtSwitch)).toBe(170_848)
  })

  it('projection sur quinze ans : 3e année, revente, TRI, régimes', () => {
    const r = projection(input, A, { at })
    const third = r.rows[2]
    expect(third?.rentCollected).toBe(8625)
    expect(Math.round(third?.tax?.taxableIncome ?? 0)).toBe(6038)
    expect(Math.round(third?.tax?.total ?? 0)).toBe(2850)
    expect(Math.round(r.summary.firstRentalYearMonthlyAfterTax ?? 0)).toBe(-630)
    expect(Math.round(r.sale.remainingPrincipal)).toBe(91_944)
    expect(r.sale.capitalGains.grossGain).toBe(0)
    expect(Math.round(r.sale.netProceeds)).toBe(98_056)
    expect(Math.round((r.summary.irrBeforeTax ?? 0) * 1000) / 10).toBe(-0.2)
    expect(Math.round((r.summary.irrAfterTax ?? 0) * 1000) / 10).toBe(-4.2)
    const reel = r.regimes.find(x => x.regime === 'reel_foncier')
    expect(Math.round((reel?.irrAfterTax ?? 0) * 1000) / 10).toBe(-1.4)
    expect(Math.round(r.summary.netWealthAfterTax ?? 0)).toBe(-42_445)
    expect(Math.round(reel?.netWealthAfterTax ?? 0)).toBe(-13_879)
    const furnished = projection({ ...input, leaseType: 'furnished' }, A, {
      at,
    })
    const [micro, lmnp] = furnished.regimes
    expect(Math.round((micro?.irrAfterTax ?? 0) * 1000) / 10).toBe(-3.1)
    expect(Math.round((lmnp?.irrAfterTax ?? 0) * 1000) / 10).toBe(-0.2)
    expect(lmnp?.totalRentalTax).toBe(0)
  })

  it('scénario « prix négocié à 150 000 € »', () => {
    const s = compareScenario(input, A, { price: 150_000 }, { at })
    expect(s.base.verdict).toBe('off_target')
    expect(s.result.verdict).toBe('to_dig')
    expect(s.result.totalCost).toBe(166_250)
    expect(Math.round(s.result.effort)).toBe(-109)
    expect(Math.round((s.result.irrAfterTax ?? 0) * 1000) / 10).toBe(-1.5)
  })
})
