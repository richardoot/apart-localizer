/**
 * Lot 5 : projection sur l'horizon de détention (E6, E7) et scénarios « et
 * si » (E4), sur l'exemple chiffré § 8.
 */
import { describe, expect, it } from 'vitest'
import { AssumptionsSchema } from '@apart/contracts'
import type { Assumptions, ProjectionReport } from '@apart/contracts'
import {
  wealthSeries,
  mergeScenarioOverrides,
  applyScenario,
  compareScenario,
  compute,
  irr,
  npv,
  projection,
  remainingPrincipal,
  scenarioDeltas,
  scenarioOutcome,
} from '../src/index.js'
import type { StudyInput } from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS, DOC_EXAMPLE } from './helpers.js'

const AT = new Date('2026-11-03T10:00:00Z')

const A: Assumptions = AssumptionsSchema.parse({
  ...ARTIFACT_ASSUMPTIONS,
  purchaseDate: '2026-01-01',
  rentalStartDate: '2028-01-01',
  rentIndexationRate: 0,
  appreciationRate: 0,
  resaleCostsRate: 0.05,
  horizonYears: 15,
  currentRent: 850,
  marginalTaxRate: 0.3,
})

const INPUT: StudyInput = {
  financials: { ...DOC_EXAMPLE, annualCharges: 1200 },
  rental: {
    dpeClass: 'D',
    year: null,
    marketRent: null,
    demand: 'strong',
    coOwnershipAllowsRental: 'yes',
    decencyCompliant: 'yes',
    rentalPermitRequired: 'no',
  },
  leaseType: 'unfurnished',
}

/** Les flux du TRI reconstitués à partir du rapport. */
function flows(report: ProjectionReport, after: boolean): number[] {
  const out = [
    -report.summary.equity,
    ...report.rows.map(r =>
      after ? (r.cashFlowAfterTax as number) : r.cashFlowBeforeTax
    ),
  ]
  const last = out.length - 1
  out[last] =
    (out[last] as number) +
    (after ? report.sale.netProceeds : report.sale.netProceedsBeforeTax)
  return out
}

describe('projection (E6, E7)', () => {
  const report = projection(INPUT, A, { at: AT, title: 'T2 exemple' })
  const metrics = compute(INPUT.financials, A)

  it('quinze lignes annuelles : deux ans habités, puis loués', () => {
    expect(report.title).toBe('T2 exemple')
    expect(report.rows).toHaveLength(15)
    expect(report.rows[0]).toMatchObject({
      year: 1,
      from: '2026-01-01',
      to: '2026-12-31',
      phase1Months: 12,
      phase2Months: 0,
      rentAvoided: 850 * 12,
      rentCollected: 0,
      tax: null,
    })
    expect(report.rows[0]?.charges).toBeCloseTo(1200, 9)
    expect(report.rows[0]?.cashFlowAfterTax).toBe(
      report.rows[0]?.cashFlowBeforeTax
    )
    const third = report.rows[2]
    expect(third?.phase2Months).toBe(12)
    expect(third?.rentCollected).toBeCloseTo(8625, 6)
    expect(third?.fixedCosts).toBeCloseTo(1050, 6)
    expect(third?.charges).toBeCloseTo(
      metrics.nonRecoverableChargesMonthly * 12,
      6
    )
    expect(third?.tax?.regime).toBe('micro_foncier')
    expect(third?.tax?.taxableIncome).toBeCloseTo(8625 * 0.7, 6)
    expect(third?.cashFlowAfterTax).toBeCloseTo(
      (third?.cashFlowBeforeTax ?? 0) - (third?.tax?.total ?? 0),
      6
    )
    expect(report.rows[14]?.remainingPrincipal).toBeCloseTo(
      remainingPrincipal(180_000, 0.0365, 25, 180),
      4
    )
    expect(report.rows[14]?.propertyValue).toBe(200_000)
    expect(report.rows[14]?.netEquity).toBeCloseTo(
      200_000 - (report.rows[14]?.remainingPrincipal ?? 0),
      6
    )
  })

  it('revente au terme, imposable puisque louée ; TRI qui annule la VAN ; enrichissement = somme des flux', () => {
    expect(report.sale.date).toBe('2041-01-01')
    expect(report.sale.salePrice).toBe(200_000)
    expect(report.sale.saleCosts).toBe(10_000)
    expect(report.sale.mainResidenceAtSale).toBe(false)
    expect(report.sale.capitalGains.exempt).toBe(false)
    expect(report.summary.equity).toBe(40_000)
    const before = flows(report, false)
    const after = flows(report, true)
    expect(report.summary.irrBeforeTax).not.toBeNull()
    expect(npv(report.summary.irrBeforeTax as number, before)).toBeCloseTo(0, 6)
    expect(report.summary.irrAfterTax).toBeCloseTo(irr(after) as number, 10)
    expect(report.summary.netWealthBeforeTax).toBeCloseTo(
      before.reduce((s, f) => s + f, 0),
      6
    )
    expect(report.summary.netWealthAfterTax).toBeCloseTo(
      after.reduce((s, f) => s + f, 0),
      6
    )
    expect(report.summary.discountRate).toBe(0.0365)
    expect(report.summary.npvAfterTax).toBeCloseTo(npv(0.0365, after), 6)
    expect(report.summary.firstRentalYear).toBe(3)
    expect(report.summary.firstRentalYearMonthlyAfterTax).toBeCloseTo(
      (report.rows[2]?.cashFlowAfterTax ?? 0) / 12,
      9
    )
    expect(report.summary.totalRentalTax).toBeCloseTo(
      report.rows.reduce((s, r) => s + (r.tax?.total ?? 0), 0),
      6
    )
    expect(report.parameters).toMatchObject({
      purchaseDate: '2026-01-01',
      rentalStartDate: '2028-01-01',
      horizonYears: 15,
      leaseType: 'unfurnished',
      requestedRegime: null,
      marginalTaxRate: 0.3,
    })
    expect(report.disclaimer).toMatch(/pas un conseil fiscal/)
  })

  it('compare micro-foncier et réel, retient le plus enrichissant', () => {
    expect(report.regimes.map(r => r.regime)).toEqual([
      'micro_foncier',
      'reel_foncier',
    ])
    const best = [...report.regimes].sort(
      (x, y) => (y.netWealthAfterTax ?? 0) - (x.netWealthAfterTax ?? 0)
    )[0]
    expect(report.bestRegime).toBe(best?.regime)
    const reel = projection(INPUT, A, { at: AT, regime: 'reel_foncier' })
    expect(reel.summary.regime).toBe('reel_foncier')
    expect(
      reel.regimes.find(r => r.regime === 'reel_foncier')?.netWealthAfterTax
    ).toBeCloseTo(reel.summary.netWealthAfterTax as number, 6)
  })

  it('sans TMI : TRI et enrichissement après impôt inconnus, avertissement', () => {
    const noTmi = projection(
      INPUT,
      AssumptionsSchema.parse({ ...A, marginalTaxRate: null }),
      { at: AT }
    )
    expect(noTmi.summary.irrAfterTax).toBeNull()
    expect(noTmi.summary.netWealthAfterTax).toBeNull()
    expect(noTmi.summary.npvAfterTax).toBeNull()
    expect(noTmi.summary.totalRentalTax).toBeNull()
    expect(noTmi.summary.irrBeforeTax).not.toBeNull()
    expect(noTmi.bestRegime).toBeNull()
    expect(noTmi.rows[2]?.cashFlowAfterTax).toBeNull()
    expect(noTmi.summary.firstRentalYearMonthlyAfterTax).toBeNull()
    expect(noTmi.warnings.join(' ')).toMatch(/TMI du foyer non renseignée/)
  })

  it('vente avant la mise en location : résidence principale, exonérée', () => {
    const early = projection(INPUT, A, { at: AT, horizonYears: 2 })
    expect(early.sale.mainResidenceAtSale).toBe(true)
    expect(early.sale.capitalGains.exempt).toBe(true)
    expect(early.summary.firstRentalYear).toBeNull()
    expect(early.warnings.join(' ')).toMatch(/plus-value exonérée/)
  })

  it('meublé : micro-BIC et LMNP réel ; amortissements réintégrés à la revente en réel', () => {
    const furnished = projection({ ...INPUT, leaseType: 'furnished' }, A, {
      at: AT,
      regime: 'lmnp_reel',
      horizonYears: 20,
    })
    expect(furnished.regimes.map(r => r.regime)).toEqual([
      'micro_bic',
      'lmnp_reel',
    ])
    expect(furnished.summary.regime).toBe('lmnp_reel')
    const used = furnished.rows.reduce(
      (s, r) => s + (r.tax?.depreciation ?? 0),
      0
    )
    expect(used).toBeGreaterThan(0)
    expect(
      furnished.sale.capitalGains.depreciationReintegrated
    ).toBeGreaterThan(0)
    expect(
      furnished.sale.capitalGains.depreciationReintegrated
    ).toBeLessThanOrEqual(used + 1e-6)
    expect(furnished.warnings.join(' ')).toMatch(
      /Prélèvements sociaux sur les loyers meublés/
    )
  })

  it('régime inadapté au bail, colocation, loyer absent, plafond du micro dépassé, horizon borné', () => {
    const adjusted = projection(INPUT, A, { at: AT, regime: 'micro_bic' })
    expect(adjusted.summary.regime).toBe('micro_foncier')
    expect(adjusted.warnings.join(' ')).toMatch(/ne convient pas à ce bail/)
    const shared = projection({ ...INPUT, leaseType: 'shared' }, A, { at: AT })
    expect(shared.summary.regime).toBe('micro_bic')
    expect(shared.warnings.join(' ')).toMatch(/Colocation supposée meublée/)
    const noRent = projection(
      { ...INPUT, financials: { ...INPUT.financials, targetRent: 0 } },
      A,
      { at: AT }
    )
    expect(noRent.warnings.join(' ')).toMatch(/Loyer visé non renseigné/)
    const rich = projection(
      { ...INPUT, financials: { ...INPUT.financials, targetRent: 1500 } },
      A,
      { at: AT }
    )
    expect(rich.regimes[0]?.eligible).toBe(false)
    expect(rich.regimes[0]?.reason).toMatch(/année 3/)
    expect(rich.warnings.join(' ')).toMatch(/plafond du régime micro/)
    expect(
      projection(INPUT, A, { at: AT, horizonYears: 99 }).rows
    ).toHaveLength(40)
    expect(projection(INPUT, A, { at: AT, horizonYears: 0 }).rows).toHaveLength(
      1
    )
  })

  it('sans loyer actuel : avertissement sur le TRI sous-estimé', () => {
    const noRent = projection(
      INPUT,
      AssumptionsSchema.parse({ ...A, currentRent: null }),
      { at: AT }
    )
    expect(noRent.rows[0]?.rentAvoided).toBe(0)
    expect(noRent.warnings.join(' ')).toMatch(/Loyer actuel non renseigné/)
    expect(noRent.listingId).toBeNull()
    expect(noRent.title).toBe('Annonce')
  })

  it('revalorisation et indexation : valeur, loyers', () => {
    const grow = projection(
      INPUT,
      AssumptionsSchema.parse({
        ...A,
        appreciationRate: 0.02,
        rentIndexationRate: 0.01,
      }),
      { at: AT }
    )
    expect(grow.rows[0]?.propertyValue).toBeCloseTo(204_000, 6)
    expect(grow.rows[3]?.rentCollected).toBeCloseTo(8625 * 1.01, 6)
    expect(grow.sale.salePrice).toBeCloseTo(200_000 * 1.02 ** 15, 6)
  })
})

describe('scénarios « et si » (E4)', () => {
  it('surcharges de l’annonce et des hypothèses ; une date de mise en location du scénario l’emporte', () => {
    const { input, assumptions } = applyScenario(
      { ...INPUT, rental: { ...INPUT.rental, year: 2028 } },
      A,
      {
        price: 180_000,
        targetRent: 800,
        renovationTotal: 10_000,
        furnitureValue: 0,
        propertyTax: 900,
        annualCharges: 1500,
        leaseType: 'furnished',
        assumptions: { interestRate: 0.032, rentalStartDate: '2029-06-01' },
      }
    )
    expect(input.financials).toMatchObject({
      price: 180_000,
      targetRent: 800,
      renovationTotal: 10_000,
      furnitureValue: 0,
      propertyTax: 900,
      annualCharges: 1500,
    })
    expect(input.leaseType).toBe('furnished')
    expect(input.rental.year).toBe(2029)
    expect(assumptions.interestRate).toBe(0.032)
    const byYear = applyScenario(INPUT, A, {
      assumptions: { rentalYear: 2030 },
    })
    expect(byYear.input.rental.year).toBe(2030)
    const none = applyScenario(INPUT, A, {})
    expect(none.input).toEqual(INPUT)
    expect(none.assumptions).toEqual(A)
  })

  it('compare la base et le scénario : écarts, sens, changements de verdict', () => {
    const comparison = compareScenario(
      INPUT,
      A,
      { price: 140_000, assumptions: { interestRate: 0.03 } },
      {
        at: AT,
        listingId: '11111111-1111-4111-8111-111111111111',
        title: 'T2',
        scenario: { id: null, name: 'Prix négocié' },
      }
    )
    expect(comparison.persisted).toBe(false)
    expect(comparison.scenario.name).toBe('Prix négocié')
    expect(comparison.result.totalCost).toBeLessThan(comparison.base.totalCost)
    const cost = comparison.deltas.find(d => d.key === 'totalCost')
    expect(cost?.delta).toBeCloseTo(
      comparison.result.totalCost - comparison.base.totalCost,
      9
    )
    expect(cost?.better).toBe(true)
    const gross = comparison.deltas.find(d => d.key === 'grossYield')
    expect(gross?.better).toBe(true)
    expect(comparison.base.verdict).toBe('off_target')
    expect(comparison.verdictChanged).toBe(
      comparison.base.verdict !== comparison.result.verdict
    )
    // Le prix plus bas allège l'effort : la louabilité peut changer aussi.
    expect(comparison.rentalVerdictChanged).toBe(
      comparison.base.rentalVerdict !== comparison.result.rentalVerdict
    )
    expect(comparison.result.effort).toBeGreaterThan(comparison.base.effort)
    const rent = comparison.deltas.find(d => d.key === 'rent')
    expect(rent?.better).toBeNull()
    expect(comparison.disclaimer).toMatch(/estimation/i)
  })

  it('indicateurs inconnus : écart nul ; valeurs par défaut des options', () => {
    const base = scenarioOutcome(
      INPUT,
      AssumptionsSchema.parse({ ...A, marginalTaxRate: null }),
      AT
    )
    expect(base.irrAfterTax).toBeNull()
    const deltas = scenarioDeltas(base, {
      ...base,
      totalCost: base.totalCost + 1000,
    })
    expect(deltas.find(d => d.key === 'irrAfterTax')?.delta).toBeNull()
    expect(deltas.find(d => d.key === 'totalCost')?.better).toBe(false)
    const plain = compareScenario(INPUT, A, {}, { at: AT })
    expect(plain.listingId).toBeNull()
    expect(plain.title).toBe('Annonce')
    expect(plain.scenario.id).toBeNull()
    const zeroSurface = scenarioOutcome(
      {
        ...INPUT,
        financials: {
          ...INPUT.financials,
          price: 0,
          furnitureValue: 0,
          surface: 0,
        },
      },
      A,
      AT
    )
    expect(zeroSurface.grossYield).toBeNull()
  })
})

describe('fusion des surcharges', () => {
  it('les champs ajoutés l’emportent, les hypothèses sont fusionnées', async () => {
    const base = {
      price: 180_000,
      assumptions: { interestRate: 0.03, downPayment: 50_000 },
    }
    expect(mergeScenarioOverrides(base, null)).toBe(base)
    expect(
      mergeScenarioOverrides(base, {
        targetRent: 800,
        assumptions: { interestRate: 0.032 },
      })
    ).toEqual({
      price: 180_000,
      targetRent: 800,
      assumptions: { interestRate: 0.032, downPayment: 50_000 },
    })
    expect(mergeScenarioOverrides({ price: 1 }, { price: 2 })).toEqual({
      price: 2,
    })
  })
})

describe('série du graphique', () => {
  it('cash-flow net d’impôt quand il est connu, cumul, position latente', async () => {
    const report = projection(INPUT, A, { at: AT })
    const series = wealthSeries(report)
    expect(series).toHaveLength(15)
    expect(series[2]?.afterTax).toBe(true)
    const cumul = report.rows
      .slice(0, 3)
      .reduce((s, r) => s + (r.cashFlowAfterTax ?? 0), 0)
    expect(series[2]?.cumulativeCashFlow).toBeCloseTo(cumul, 6)
    expect(series[2]?.position).toBeCloseTo(
      -40_000 + cumul + (report.rows[2]?.netEquity ?? 0),
      6
    )
    const noTmi = wealthSeries(
      projection(
        INPUT,
        AssumptionsSchema.parse({ ...A, marginalTaxRate: null }),
        { at: AT }
      )
    )
    expect(noTmi[2]?.afterTax).toBe(false)
    expect(noTmi[2]?.cashFlow).toBe(
      projection(
        INPUT,
        AssumptionsSchema.parse({ ...A, marginalTaxRate: null }),
        { at: AT }
      ).rows[2]?.cashFlowBeforeTax
    )
  })
})
