/**
 * Lot 5, phase 1 : dates, date de mise en location, tableau
 * d'amortissement, simulation mensuelle, coût d'occupation (E3).
 */
import { describe, expect, it } from 'vitest'
import { AssumptionsSchema } from '@apart/contracts'
import type { Assumptions } from '@apart/contracts'
import {
  addMonths,
  compute,
  fullYearsBetween,
  loanSchedule,
  monthlyPayment,
  monthsBetween,
  occupancyReport,
  previousDay,
  purchaseDate,
  remainingPrincipal,
  rentalChecks,
  rentalChecksInputFromListing,
  rentalStartDate,
  rentalStartYear,
  simulateMonths,
  studyInputFromListing,
  yearOf,
} from '../src/index.js'
import type { StudyInput } from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS, DOC_EXAMPLE } from './helpers.js'

const A: Assumptions = AssumptionsSchema.parse({
  ...ARTIFACT_ASSUMPTIONS,
  purchaseDate: '2026-01-01',
  rentalStartDate: '2028-01-01',
  rentIndexationRate: 0,
})

const INPUT: StudyInput = {
  financials: DOC_EXAMPLE,
  rental: {
    dpeClass: 'D',
    year: null,
    marketRent: null,
    demand: 'strong',
    coOwnershipAllowsRental: 'unknown',
    decencyCompliant: 'unknown',
    rentalPermitRequired: 'unknown',
  },
  leaseType: 'unfurnished',
}

const AT = new Date('2026-11-03T10:00:00Z')

describe('dates', () => {
  it('années, mois révolus, ajout de mois, veille', () => {
    expect(yearOf('2028-06-15')).toBe(2028)
    expect(() => yearOf('2028-6-15')).toThrow(RangeError)
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-11-03', 14)).toBe('2028-01-03')
    expect(addMonths('2026-03-01', -3)).toBe('2025-12-01')
    expect(previousDay('2027-01-01')).toBe('2026-12-31')
    expect(monthsBetween('2026-01-15', '2026-03-14')).toBe(1)
    expect(monthsBetween('2026-01-15', '2026-03-15')).toBe(2)
    expect(monthsBetween('2026-03-15', '2026-01-16')).toBe(-1)
    expect(monthsBetween('2026-03-15', '2026-01-15')).toBe(-2)
    expect(fullYearsBetween('2026-01-01', '2041-01-01')).toBe(15)
    expect(fullYearsBetween('2026-01-02', '2041-01-01')).toBe(14)
    expect(fullYearsBetween('2027-01-01', '2026-01-01')).toBe(0)
  })
})

describe('date de mise en location et d’acquisition', () => {
  it('l’année de la phase 2 de l’annonce l’emporte, la date précise des hypothèses si elle tombe la même année', () => {
    const a = { rentalYear: 2028, rentalStartDate: '2028-09-01' }
    expect(rentalStartDate(null, a)).toBe('2028-09-01')
    expect(rentalStartDate(2028, a)).toBe('2028-09-01')
    expect(rentalStartDate(2029, a)).toBe('2029-01-01')
    expect(
      rentalStartDate(null, { rentalYear: 2030, rentalStartDate: null })
    ).toBe('2030-01-01')
    expect(rentalStartYear(null, a)).toBe(2028)
    // Des hypothèses lues sans le schéma n'ont pas le champ.
    expect(
      rentalStartDate(null, { rentalYear: 2028 } as Pick<
        Assumptions,
        'rentalYear' | 'rentalStartDate'
      >)
    ).toBe('2028-01-01')
    expect(purchaseDate({ purchaseDate: null }, AT)).toBe('2026-11-03')
    expect(purchaseDate({ purchaseDate: '2027-02-01' }, AT)).toBe('2027-02-01')
  })

  it('les contrôles de louabilité lisent l’année de la date de mise en location', () => {
    const metrics = compute(DOC_EXAMPLE, A)
    const g = { ...INPUT.rental, dpeClass: 'F' as const }
    expect(rentalChecks(g, metrics, A).year).toBe(2028)
    const later = AssumptionsSchema.parse({
      ...A,
      rentalStartDate: '2027-03-01',
    })
    expect(rentalChecks(g, metrics, later).year).toBe(2027)
  })

  it('entrée de l’étude d’après une annonce', () => {
    const input = studyInputFromListing({
      price: 200_000,
      surface: 45,
      dpeClass: 'C',
      rentalPlan: {
        targetRent: 750,
        year: 2029,
        leaseType: 'furnished',
        marketRent: 760,
        demand: 'medium',
        coOwnershipAllowsRental: 'yes',
        decencyCompliant: 'yes',
        rentalPermitRequired: 'no',
      },
    })
    expect(input.leaseType).toBe('furnished')
    expect(input.financials.targetRent).toBe(750)
    expect(input.rental).toEqual({
      dpeClass: 'C',
      year: 2029,
      marketRent: 760,
      demand: 'medium',
      coOwnershipAllowsRental: 'yes',
      decencyCompliant: 'yes',
      rentalPermitRequired: 'no',
    })
    const bare = studyInputFromListing({ price: 100_000 })
    expect(bare.leaseType).toBe('unfurnished')
    expect(rentalChecksInputFromListing({ price: 1 })).toEqual({
      dpeClass: null,
      year: null,
      marketRent: null,
      demand: null,
      coOwnershipAllowsRental: 'unknown',
      decencyCompliant: 'unknown',
      rentalPermitRequired: 'unknown',
    })
  })
})

describe('tableau d’amortissement', () => {
  it('mensualité constante, capital soldé, cohérent avec CRD(m) et la mensualité du modèle', () => {
    const schedule = loanSchedule(180_000, 0.0365, 25, 0.001)
    expect(schedule).toHaveLength(300)
    expect(schedule[0]?.interest).toBeCloseTo((180_000 * 0.0365) / 12, 9)
    expect(schedule[0]?.insurance).toBeCloseTo(15, 9)
    expect(schedule[0]?.payment).toBeCloseTo(
      monthlyPayment(180_000, 0.0365, 25, 0.001),
      6
    )
    const principal = schedule.reduce((s, m) => s + m.principal, 0)
    expect(principal).toBeCloseTo(180_000, 6)
    expect(schedule[299]?.remaining).toBe(0)
    expect(schedule[11]?.remaining).toBeCloseTo(
      remainingPrincipal(180_000, 0.0365, 25, 12),
      6
    )
  })

  it('taux nul linéaire, rien à emprunter, durée nulle', () => {
    const flat = loanSchedule(120_000, 0, 10, 0)
    expect(flat[0]?.principal).toBe(1000)
    expect(flat[0]?.interest).toBe(0)
    expect(flat[119]?.remaining).toBe(0)
    expect(loanSchedule(0, 0.03, 20, 0.001)).toEqual([])
    expect(loanSchedule(100_000, 0.03, 0, 0.001)).toEqual([])
  })
})

describe('simulation mensuelle', () => {
  it('phase 1 puis phase 2, indexation annuelle, vacance étalée, coûts de chaque phase', () => {
    const a = AssumptionsSchema.parse({
      ...A,
      currentRent: 800,
      maintenanceAnnual: 600,
      rentIndexationRate: 0.02,
    })
    const metrics = compute({ ...DOC_EXAMPLE, annualCharges: 1200 }, a)
    const sim = simulateMonths({
      financials: { ...DOC_EXAMPLE, annualCharges: 1200 },
      metrics,
      assumptions: a,
      purchaseDate: '2026-01-01',
      rentalStartDate: '2028-01-01',
      months: 48,
    })
    expect(sim.phase1Months).toBe(24)
    const first = sim.months[0]
    expect(first?.phase).toBe(1)
    expect(first?.rentAvoided).toBe(800)
    expect(first?.charges).toBe(100)
    expect(first?.maintenance).toBe(50)
    expect(first?.rentCollected).toBe(0)
    // Deuxième année : coûts indexés de 2 %.
    expect(sim.months[12]?.rentAvoided).toBeCloseTo(816, 9)
    const rented = sim.months[24]
    expect(rented?.phase).toBe(2)
    expect(rented?.holdingYear).toBe(3)
    expect(rented?.rentCollected).toBeCloseTo((750 * 11.5) / 12, 9)
    expect(rented?.charges).toBeCloseTo(
      metrics.nonRecoverableChargesMonthly * 1.02 ** 2,
      9
    )
    expect(rented?.fixedCosts).toBeCloseTo((1050 / 12) * 1.02 ** 2, 9)
    // Le loyer suit l'anniversaire du bail.
    expect(sim.months[36]?.rentCollected).toBeCloseTo(
      ((750 * 11.5) / 12) * 1.02,
      9
    )
    // Après la fin du crédit, plus de mensualité.
    const short = simulateMonths({
      financials: DOC_EXAMPLE,
      metrics: compute(DOC_EXAMPLE, { ...a, durationYears: 1 }),
      assumptions: { ...a, durationYears: 1 },
      purchaseDate: '2026-01-01',
      rentalStartDate: '2025-01-01',
      months: 13,
    })
    expect(short.phase1Months).toBe(0)
    expect(short.months[12]?.payment).toBe(0)
    expect(short.months[12]?.remaining).toBe(0)
    const none = simulateMonths({
      financials: DOC_EXAMPLE,
      metrics,
      assumptions: a,
      purchaseDate: '2026-01-01',
      rentalStartDate: '2027-01-01',
      months: -3,
    })
    expect(none.months).toEqual([])
  })
})

describe('coût d’occupation (phase 1, E3)', () => {
  it('exemple § 8 : mensualité, taxe foncière estimée, capital remboursé, comparaison au loyer actuel', () => {
    const a = AssumptionsSchema.parse({
      ...A,
      currentRent: 850,
      maintenanceAnnual: 600,
    })
    const report = occupancyReport(
      { ...INPUT, financials: { ...DOC_EXAMPLE, annualCharges: 1200 } },
      a,
      { at: AT, listingId: '11111111-1111-4111-8111-111111111111' }
    )
    const metrics = compute(DOC_EXAMPLE, a)
    expect(report.listingId).toBe('11111111-1111-4111-8111-111111111111')
    expect(report.purchaseDate).toBe('2026-01-01')
    expect(report.rentalStartDate).toBe('2028-01-01')
    expect(report.phase1Months).toBe(24)
    expect(report.monthly.insurance).toBeCloseTo(15, 9)
    expect(report.monthly.credit + report.monthly.insurance).toBeCloseTo(
      metrics.monthlyPayment,
      9
    )
    expect(report.monthly.charges).toBe(100)
    expect(report.monthly.propertyTax).toBe(62.5)
    expect(report.monthly.maintenance).toBe(50)
    expect(report.monthly.total).toBeCloseTo(metrics.monthlyPayment + 212.5, 9)
    expect(report.propertyTaxEstimated).toBe(true)
    // Capital remboursé en moyenne sur 24 mois : CRD(0) − CRD(24), divisé par 24.
    const repaid = 180_000 - remainingPrincipal(180_000, 0.0365, 25, 24)
    expect(report.capitalMonthly).toBeCloseTo(repaid / 24, 6)
    expect(report.phase1.principalRepaid).toBeCloseTo(repaid, 6)
    expect(report.realCostMonthly).toBeCloseTo(
      report.monthly.total - repaid / 24,
      6
    )
    expect(report.gapToCurrentRent).toBeCloseTo(report.monthly.total - 850, 9)
    expect(report.realGapToCurrentRent).toBeCloseTo(
      report.realCostMonthly - 850,
      9
    )
    expect(report.phase1.rentAvoided).toBe(850 * 24)
    expect(report.phase1.paid).toBeCloseTo(report.monthly.total * 24, 6)
    expect(report.phase1.netCost).toBeCloseTo(
      report.phase1.paid - repaid - 850 * 24,
      6
    )
    expect(report.remainingPrincipalAtSwitch).toBeCloseTo(
      remainingPrincipal(180_000, 0.0365, 25, 24),
      6
    )
    expect(report.warnings).toEqual([
      expect.stringContaining('Taxe foncière estimée'),
    ])
  })

  it('sans loyer actuel ni charges ni entretien, mise en location immédiate : avertissements, capital sur douze mois', () => {
    const a = AssumptionsSchema.parse({
      ...A,
      purchaseDate: '2028-03-01',
      rentalStartDate: '2028-01-01',
    })
    const report = occupancyReport(
      { ...INPUT, financials: { ...DOC_EXAMPLE, propertyTax: 900 } },
      a,
      { at: AT }
    )
    expect(report.listingId).toBeNull()
    expect(report.phase1Months).toBe(0)
    expect(report.gapToCurrentRent).toBeNull()
    expect(report.realGapToCurrentRent).toBeNull()
    expect(report.phase1.rentAvoided).toBeNull()
    expect(report.phase1.netCost).toBeNull()
    expect(report.phase1.paid).toBe(0)
    expect(report.chargesKnown).toBe(false)
    expect(report.maintenanceKnown).toBe(false)
    expect(report.propertyTaxEstimated).toBe(false)
    const repaid12 = 180_000 - remainingPrincipal(180_000, 0.0365, 25, 12)
    expect(report.capitalMonthly).toBeCloseTo(repaid12 / 12, 6)
    expect(report.warnings.join(' ')).toMatch(/Loyer actuel/)
    expect(report.warnings.join(' ')).toMatch(/Charges de copropriété/)
    expect(report.warnings.join(' ')).toMatch(/Entretien/)
    expect(report.warnings.join(' ')).toMatch(/pas de phase 1/)
  })

  it('sans emprunt : ni capital ni intérêts', () => {
    const a = AssumptionsSchema.parse({ ...A, downPayment: 500_000 })
    const report = occupancyReport(INPUT, a, { at: AT })
    expect(report.loanAmount).toBe(0)
    expect(report.capitalMonthly).toBe(0)
    expect(report.interestMonthly).toBe(0)
    expect(report.monthly.credit).toBe(0)
    expect(report.remainingPrincipalAtSwitch).toBe(0)
  })
})
