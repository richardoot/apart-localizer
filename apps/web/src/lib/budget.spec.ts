import { describe, expect, it } from 'vitest'
import {
  AssumptionsSchema,
  DEFAULT_ASSUMPTIONS,
  TAX_REGIME_LABELS,
} from '@apart/contracts'
import {
  assumptionsBanner,
  budgetRentalYear,
  leaseTypeText,
  marketRange,
  notaryText,
  scenarioSummary,
} from './budget'

/** Les espaces fines insécables de fr-FR, en espaces simples. */
const n = (text: string): string => text.replace(/[\u202f\u00a0]/g, ' ')

describe('onglet Budget : les textes (lot 19)', () => {
  it('le bandeau des hypothèses de l’espace : apport, taux et durée, notaire, année, type', () => {
    expect(n(assumptionsBanner(DEFAULT_ASSUMPTIONS))).toBe(
      'apport 40 000 €, 3,65 % sur 25 ans, frais de notaire au taux de 7,5 %, mise en location en 2028, location vide'
    )
    const custom = AssumptionsSchema.parse({
      ...DEFAULT_ASSUMPTIONS,
      notaryMode: 'scale',
      rentalStartDate: '2030-09-01',
      leaseType: 'furnished',
    })
    expect(n(assumptionsBanner(custom))).toBe(
      'apport 40 000 €, 3,65 % sur 25 ans, frais de notaire au barème, mise en location en 2030, location meublée'
    )
  })

  it('l’année : celle de la date de mise en location, sinon `rentalYear`', () => {
    expect(budgetRentalYear({ rentalYear: 2029, rentalStartDate: null })).toBe(
      2029
    )
    expect(
      budgetRentalYear({ rentalYear: 2029, rentalStartDate: '2031-03-01' })
    ).toBe(2031)
  })

  it('type de location et frais de notaire en toutes lettres', () => {
    expect(leaseTypeText({ leaseType: 'shared' })).toBe('colocation')
    expect(leaseTypeText({})).toBe('location vide')
    expect(notaryText({ notaryMode: 'scale', notaryRate: 0.075 })).toBe(
      'frais de notaire au barème'
    )
  })

  it('la fourchette du marché des comparables', () => {
    expect(marketRange({ p25RentPerM2: 15, p75RentPerM2: 17 }, 45)).toEqual({
      low: 675,
      high: 765,
    })
    expect(marketRange(null, 45)).toBeNull()
    expect(marketRange({ p25RentPerM2: 15, p75RentPerM2: 17 }, null)).toBeNull()
    expect(marketRange({ p25RentPerM2: 15, p75RentPerM2: 17 }, 0)).toBeNull()
  })

  it('un scénario en une ligne', () => {
    expect(
      n(
        scenarioSummary({
          price: 190_000,
          targetRent: 800,
          renovationTotal: 5000,
          furnitureValue: 3000,
          propertyTax: 900,
          annualCharges: 1200,
          leaseType: 'furnished',
          assumptions: {
            interestRate: 0.03,
            downPayment: 50_000,
            durationYears: 20,
            vacancyMonths: 1,
            rentalYear: 2030,
            taxRegime: 'micro_bic',
            marginalTaxRate: 0.3,
            appreciationRate: 0.01,
            horizonYears: 10,
          },
        })
      )
    ).toBe(
      `prix 190 000 €, loyer 800 €/mois, travaux 5 000 €, mobilier 3 000 €, taxe foncière 900 €, charges 1 200 €, location meublée, taux 3 %, apport 50 000 €, 20 ans, vacance 1 mois/an, location en 2030, ${TAX_REGIME_LABELS.micro_bic}, TMI 30 %, revalorisation 1 %/an, horizon 10 ans`
    )
    expect(
      scenarioSummary({
        assumptions: { leaseType: 'shared', rentalStartDate: '2029-06-01' },
      })
    ).toBe('colocation, location le 2029-06-01')
    expect(scenarioSummary({})).toBe('')
  })
})
