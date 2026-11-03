import { describe, expect, it } from 'vitest'
import {
  buyerFees,
  compute,
  financialsFromListing,
  rentalChecks,
  sensitivity,
} from '../src/index.js'
import type { RentalChecksInput } from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS, DOC_EXAMPLE, financials } from './helpers.js'

const A = ARTIFACT_ASSUMPTIONS
const baseRental: RentalChecksInput = {
  dpeClass: 'D',
  year: null,
  marketRent: null,
  demand: null,
  coOwnershipAllowsRental: 'unknown',
  decencyCompliant: 'unknown',
  rentalPermitRequired: 'unknown',
}

describe('contrôles de louabilité', () => {
  const metrics = compute(DOC_EXAMPLE, A)
  const level = (key: string, input: Partial<RentalChecksInput>) =>
    rentalChecks({ ...baseRental, ...input }, metrics, A).checks.find(
      c => c.key === key
    )?.level

  it('calendrier DPE : table paramétrable, année par défaut des hypothèses', () => {
    expect(level('dpe_ban', { dpeClass: 'G' })).toBe('bad')
    expect(level('dpe_ban', { dpeClass: 'F' })).toBe('bad')
    expect(level('dpe_ban', { dpeClass: 'E' })).toBe('warn')
    expect(level('dpe_ban', { dpeClass: 'F', year: 2027 })).toBe('warn')
    expect(level('dpe_ban', { dpeClass: 'A' })).toBe('ok')
    expect(level('dpe_ban', { dpeClass: null })).toBe('unknown')
    const custom = rentalChecks({ ...baseRental, dpeClass: 'D' }, metrics, A, {
      banSchedule: { D: 2028 },
    })
    expect(custom.checks[0]?.level).toBe('bad')
    expect(
      rentalChecks(baseRental, metrics, { ...A, rentalYear: 2030 }).year
    ).toBe(2030)
  })

  it('encadrement : plafond connu, à saisir, dépassé', () => {
    const controlled = compute(
      financials({ rentControlled: true, referenceRentPerM2: 20 }),
      A
    )
    expect(rentalChecks(baseRental, controlled, A).checks[1]?.level).toBe('ok')
    const unknownCap = compute(financials({ rentControlled: true }), A)
    expect(rentalChecks(baseRental, unknownCap, A).checks[1]?.level).toBe(
      'unknown'
    )
    const exceeded = compute(
      financials({ rentControlled: true, referenceRentPerM2: 10 }),
      A
    )
    const check = rentalChecks(baseRental, exceeded, A).checks[1]
    expect(check?.level).toBe('warn')
    expect(check?.message).toContain('450 €')
  })

  it('loyer de marché : écart > 8 % = risque de vacance', () => {
    expect(level('market_rent', { marketRent: 600 })).toBe('warn')
    expect(level('market_rent', { marketRent: 700 })).toBe('ok')
    expect(level('market_rent', { marketRent: 0 })).toBe('unknown')
  })

  it('copropriété, décence, permis, demande', () => {
    expect(level('co_ownership', { coOwnershipAllowsRental: 'yes' })).toBe('ok')
    expect(level('co_ownership', { coOwnershipAllowsRental: 'no' })).toBe('bad')
    expect(level('decency', { decencyCompliant: 'no' })).toBe('bad')
    expect(level('decency', { decencyCompliant: 'unknown' })).toBe('unknown')
    expect(level('rental_permit', { rentalPermitRequired: 'yes' })).toBe('warn')
    expect(level('rental_permit', { rentalPermitRequired: 'no' })).toBe('ok')
    expect(level('rental_permit', { rentalPermitRequired: 'unknown' })).toBe(
      'unknown'
    )
    expect(level('demand', { demand: 'strong' })).toBe('ok')
    expect(level('demand', { demand: 'medium' })).toBe('warn')
    expect(level('demand', { demand: 'weak' })).toBe('bad')
    expect(level('demand', { demand: null })).toBe('unknown')
  })

  it('effort une fois loué', () => {
    expect(level('effort', {})).toBe('warn')
    const cheap = compute(financials({ price: 100_000, furnitureValue: 0 }), A)
    const check = rentalChecks(baseRental, cheap, A).checks.find(
      c => c.key === 'effort'
    )
    expect(check?.level).toBe('ok')
    const noLoan = compute(financials({ price: 20_000, furnitureValue: 0 }), A)
    expect(
      rentalChecks(baseRental, noLoan, A).checks.find(c => c.key === 'effort')
        ?.message
    ).toContain('aucun')
  })

  it('verdict : incompatible dès un bloquant, sous conditions à trois inconnus', () => {
    const good = compute(
      financials({ price: 100_000, furnitureValue: 0, propertyTax: 700 }),
      A
    )
    const all = {
      ...baseRental,
      marketRent: 750,
      demand: 'strong' as const,
      coOwnershipAllowsRental: 'yes' as const,
      decencyCompliant: 'yes' as const,
      rentalPermitRequired: 'no' as const,
    }
    expect(rentalChecks(all, good, A).verdict).toBe('compatible')
    expect(rentalChecks(all, good, A).rank).toBe(2)
    expect(rentalChecks({ ...all, demand: 'weak' }, good, A).verdict).toBe(
      'incompatible'
    )
    expect(rentalChecks({ ...all, demand: 'weak' }, good, A).rank).toBe(0)
    expect(rentalChecks({ ...all, demand: 'medium' }, good, A).verdict).toBe(
      'conditional'
    )
    const threeUnknown = {
      ...all,
      marketRent: null,
      demand: null,
      rentalPermitRequired: 'unknown' as const,
    }
    expect(rentalChecks(threeUnknown, good, A).unknownCount).toBe(3)
    expect(rentalChecks(threeUnknown, good, A).verdict).toBe('conditional')
    const twoUnknown = { ...all, marketRent: null, demand: null }
    expect(rentalChecks(twoUnknown, good, A).verdict).toBe('compatible')
  })
})

describe('sensibilité', () => {
  it('grille 4 × 3 × 3 par défaut, cohérente avec compute', () => {
    const s = sensitivity(DOC_EXAMPLE, A)
    expect(s.cells).toHaveLength(36)
    const reference = s.cells.find(
      c => c.priceFactor === 1 && c.rateDelta === 0 && c.rentFactor === 1
    )
    const m = compute(DOC_EXAMPLE, A)
    expect(reference?.grossYield).toBe(m.grossYield)
    expect(reference?.effort).toBe(m.effort)
    expect(reference?.verdict).toBe(m.verdict)
    const cheaper = s.cells.find(
      c => c.priceFactor === 0.85 && c.rateDelta === 0 && c.rentFactor === 1
    )
    expect(cheaper?.grossYield).toBeGreaterThan(m.grossYield)
  })

  it('grille personnalisée et taux jamais négatif', () => {
    const s = sensitivity(
      DOC_EXAMPLE,
      { ...A, interestRate: 0.002 },
      {
        priceFactors: [1],
        rateDeltas: [-0.005],
        rentFactors: [1],
      }
    )
    expect(s.cells).toHaveLength(1)
    expect(s.cells[0]?.interestRate).toBe(0)
  })
})

describe("entrée financière dérivée d'une annonce", () => {
  it('honoraires acquéreur : montant, pourcentage, ou rien', () => {
    expect(
      buyerFees({ price: 100_000, feesPayer: 'buyer', feesAmount: 4000 })
    ).toBe(4000)
    expect(
      buyerFees({ price: 100_000, feesPayer: 'buyer', feesPercent: 0.05 })
    ).toBe(5000)
    expect(buyerFees({ price: 100_000, feesPayer: 'buyer' })).toBe(0)
    expect(
      buyerFees({ price: 100_000, feesPayer: 'seller', feesAmount: 4000 })
    ).toBe(0)
    expect(buyerFees({ price: 100_000 })).toBe(0)
  })

  it("reprend les champs de l'annonce et de la phase 2, avec des défauts sûrs", () => {
    expect(financialsFromListing({ price: 150_000 })).toEqual({
      price: 150_000,
      buyerFees: 0,
      surface: 0,
      targetRent: 0,
      rentControlled: false,
      referenceRentPerM2: null,
      furnitureValue: 0,
      renovationTotal: 0,
      propertyTax: null,
      annualCharges: null,
      nonRecoverableChargesMonthly: null,
      dpeClass: null,
      marketPricePerM2: null,
    })
    const full = financialsFromListing({
      price: 199_000,
      surface: 62,
      furnitureValue: 1000,
      propertyTax: 800,
      annualCharges: 1440,
      nonRecoverableChargesMonthly: 30,
      dpeClass: 'D',
      location: { commune: 'Bordeaux' },
      renovation: { active: true, items: [{ amount: 2000 }, { amount: 500 }] },
      rentalPlan: {
        targetRent: 850,
        rentControl: 'auto',
        referenceRentPerM2: 14.5,
      },
    })
    expect(full.rentControlled).toBe(true)
    expect(full.renovationTotal).toBe(2500)
    expect(full.targetRent).toBe(850)
    expect(full.referenceRentPerM2).toBe(14.5)
    expect(full.marketPricePerM2).toBeNull()
    // Le prix médian DVF enregistré nourrit le critère « marché », pas sous cinq ventes.
    expect(
      financialsFromListing({
        price: 1,
        openDataContext: { market: { medianPricePerM2: 4200, count: 12 } },
      }).marketPricePerM2
    ).toBe(4200)
    expect(
      financialsFromListing({
        price: 1,
        openDataContext: { market: { medianPricePerM2: 4200, count: 4 } },
      }).marketPricePerM2
    ).toBeNull()
    expect(
      financialsFromListing({
        price: 1,
        location: { commune: 'Bordeaux' },
        rentalPlan: { rentControl: 'no' },
      }).rentControlled
    ).toBe(false)
  })
})
