/**
 * L'exemple chiffré du modèle de calcul (§ 8), reproduit au centime quand le
 * document donne un chiffre exact, et à l'arrondi indiqué sinon.
 */
import { describe, expect, it } from 'vitest'
import { compute, rentalChecks, targetPrice } from '../src/index.js'
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
