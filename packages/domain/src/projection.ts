import type {
  Assumptions,
  ListingMetrics,
  ProjectionReport,
  ProjectionSale,
  ProjectionSummary,
  ProjectionYear,
  RegimeComparison,
  TaxRegime,
} from '@apart/contracts'
import { STUDY_DISCLAIMER, TAX_REGIME_LABELS } from '@apart/contracts'
import { capitalGainsTax } from './capital-gains.js'
import { compute } from './compute.js'
import { addMonths, previousDay } from './dates.js'
import { formatPercent } from './format.js'
import { irr, npv } from './irr.js'
import { simulateMonths } from './simulation.js'
import type { SimulatedMonth } from './simulation.js'
import type { StudyInput } from './study-input.js'
import { purchaseDate, rentalStartDate } from './study-input.js'
import {
  EMPTY_TAX_STATE,
  isBicRegime,
  regimesFor,
  rentalTaxYear,
  resolveRegime,
} from './tax.js'
import type { TaxCarryState, TaxContext } from './tax.js'

/**
 * Projection annuelle sur l'horizon de détention (modèle § 7, besoins E6 et
 * E7) : phase 1 puis phase 2, loyers indexés, charges, impôt du régime
 * choisi, mensualités et capital restant dû, revente au terme avec l'impôt
 * sur la plus-value, TRI et VAN des flux du foyer. Les flux comptent le
 * loyer actuel évité en phase 1 : le TRI compare l'achat au fait de rester
 * locataire. Une estimation, pas un conseil fiscal.
 */

export interface ProjectionOptions {
  at: Date
  horizonYears?: number | undefined
  regime?: TaxRegime | undefined
  listingId?: string | null
  title?: string
}

interface RegimeRun {
  regime: TaxRegime
  rows: ProjectionYear[]
  sale: ProjectionSale
  summary: ProjectionSummary
  ineligibleYear: number | null
}

/** La valeur de départ du bien : prix et travaux (supposés valorisés à leur coût). */
function initialValue(input: StudyInput): number {
  return input.financials.price + input.financials.renovationTotal
}

interface DepreciationPlan {
  building: (monthIndex: number) => number
  furniture: (monthIndex: number) => number
}

/**
 * Dotations mensuelles du LMNP réel, à partir de la mise en location : le
 * bâti entre à sa valeur estimée à cette date (valeur vénale à l'affectation,
 * approchée par la revalorisation), terrain déduit, par composants ; le
 * mobilier sur sa durée.
 */
function depreciationPlan(
  input: StudyInput,
  a: Assumptions,
  phase1Months: number
): DepreciationPlan {
  const params = a.taxParameters.lmnpReal
  const valueAtStart =
    initialValue(input) * Math.pow(1 + a.appreciationRate, phase1Months / 12)
  const buildingBase = valueAtStart * (1 - params.landShare)
  const furniture = input.financials.furnitureValue
  return {
    building: monthIndex => {
      const elapsed = monthIndex - phase1Months
      if (elapsed < 0) return 0
      return params.components.reduce(
        (sum, c) =>
          elapsed < c.years * 12
            ? sum + (buildingBase * c.share) / (c.years * 12)
            : sum,
        0
      )
    },
    furniture: monthIndex => {
      const elapsed = monthIndex - phase1Months
      if (elapsed < 0 || elapsed >= params.furnitureYears * 12) return 0
      return furniture / (params.furnitureYears * 12)
    },
  }
}

const sumOf = (
  months: readonly SimulatedMonth[],
  pick: (m: SimulatedMonth) => number
): number => months.reduce((acc, m) => acc + pick(m), 0)

function runRegime(
  input: StudyInput,
  a: Assumptions,
  metrics: ListingMetrics,
  regime: TaxRegime,
  dates: { purchase: string; start: string },
  horizonYears: number
): RegimeRun {
  const sim = simulateMonths({
    financials: input.financials,
    metrics,
    assumptions: a,
    purchaseDate: dates.purchase,
    rentalStartDate: dates.start,
    months: horizonYears * 12,
  })
  const plan = depreciationPlan(input, a, sim.phase1Months)
  const ctx: TaxContext = {
    params: a.taxParameters,
    marginalTaxRate: a.marginalTaxRate,
    furnishedKind: a.furnishedRentalKind,
  }
  const value0 = initialValue(input)
  let state: TaxCarryState = EMPTY_TAX_STATE
  let ineligibleYear: number | null = null
  const rows: ProjectionYear[] = []
  for (let y = 1; y <= horizonYears; y++) {
    const months = sim.months.slice((y - 1) * 12, y * 12)
    const rented = months.filter(m => m.phase === 2)
    const rentCollected = sumOf(months, m => m.rentCollected)
    const loanPayment = sumOf(months, m => m.payment)
    const charges = sumOf(months, m => m.charges)
    const propertyTax = sumOf(months, m => m.propertyTax)
    const maintenance = sumOf(months, m => m.maintenance)
    const fixedCosts = sumOf(months, m => m.fixedCosts)
    const rentAvoided = sumOf(months, m => m.rentAvoided)
    const cashFlowBeforeTax =
      rentAvoided +
      rentCollected -
      loanPayment -
      charges -
      propertyTax -
      maintenance -
      fixedCosts
    let tax: ProjectionYear['tax'] = null
    if (rented.length > 0) {
      const result = rentalTaxYear(
        regime,
        {
          grossRent: rentCollected,
          operatingCosts: sumOf(rented, m => m.charges + m.fixedCosts),
          propertyTax: sumOf(rented, m => m.propertyTax),
          interest: sumOf(rented, m => m.interest),
          loanInsurance: sumOf(rented, m => m.insurance),
          rentedMonths: rented.length,
          depreciation: {
            building: sumOf(rented, m => plan.building(m.index)),
            furniture: sumOf(rented, m => plan.furniture(m.index)),
          },
        },
        state,
        ctx
      )
      tax = result.tax
      state = result.state
      if (!tax.eligible && ineligibleYear === null) ineligibleYear = y
    }
    const remainingPrincipal = months[months.length - 1]?.remaining ?? 0
    const propertyValue = value0 * Math.pow(1 + a.appreciationRate, y)
    rows.push({
      year: y,
      from: addMonths(dates.purchase, (y - 1) * 12),
      to: previousDay(addMonths(dates.purchase, y * 12)),
      phase1Months: months.length - rented.length,
      phase2Months: rented.length,
      rentAvoided,
      rentCollected,
      loanPayment,
      interest: sumOf(months, m => m.interest),
      principal: sumOf(months, m => m.principal),
      insurance: sumOf(months, m => m.insurance),
      charges,
      propertyTax,
      maintenance,
      fixedCosts,
      cashFlowBeforeTax,
      tax,
      cashFlowAfterTax:
        tax === null
          ? cashFlowBeforeTax
          : tax.total === null
            ? null
            : cashFlowBeforeTax - tax.total,
      remainingPrincipal,
      propertyValue,
      netEquity: propertyValue - remainingPrincipal,
    })
  }

  const last = rows[rows.length - 1] as ProjectionYear
  const salePrice = last.propertyValue
  const saleCosts = salePrice * a.resaleCostsRate
  const mainResidenceAtSale = sim.phase1Months >= horizonYears * 12
  const capitalGains = capitalGainsTax({
    salePrice,
    saleCosts,
    acquisitionPrice: input.financials.price - input.financials.buyerFees,
    acquisitionCosts: metrics.notaryFees + input.financials.buyerFees,
    works: input.financials.renovationTotal,
    holdingYears: horizonYears,
    depreciationDeducted:
      regime === 'lmnp_reel' ? state.deductedBuildingDepreciation : 0,
    mainResidenceAtSale,
    params: a.taxParameters,
  })
  const netProceedsBeforeTax = salePrice - saleCosts - last.remainingPrincipal
  const sale: ProjectionSale = {
    date: addMonths(dates.purchase, horizonYears * 12),
    salePrice,
    saleCosts,
    remainingPrincipal: last.remainingPrincipal,
    mainResidenceAtSale,
    capitalGains,
    netProceedsBeforeTax,
    netProceeds: netProceedsBeforeTax - capitalGains.total,
  }

  const equity = Math.min(a.downPayment, metrics.totalCost)
  const before = [-equity, ...rows.map(r => r.cashFlowBeforeTax)]
  before[horizonYears] = (before[horizonYears] ?? 0) + netProceedsBeforeTax
  const afterYears = rows.map(r => r.cashFlowAfterTax)
  const after = afterYears.every((v): v is number => v !== null)
    ? [-equity, ...afterYears]
    : null
  if (after) after[horizonYears] = (after[horizonYears] ?? 0) + sale.netProceeds
  const discountRate = a.discountRate ?? a.interestRate
  const taxes = rows.map(r => r.tax).filter(t => t !== null)
  const firstRental = rows.find(r => r.phase2Months === 12) ?? null
  const totalRentalTax = taxes.every(t => t.total !== null)
    ? taxes.reduce((s, t) => s + (t.total ?? 0), 0)
    : null
  const summary: ProjectionSummary = {
    regime,
    horizonYears,
    equity,
    irrBeforeTax: irr(before),
    irrAfterTax: after ? irr(after) : null,
    discountRate,
    npvBeforeTax: npv(discountRate, before),
    npvAfterTax: after ? npv(discountRate, after) : null,
    netWealthBeforeTax: before.reduce((s, f) => s + f, 0),
    netWealthAfterTax: after ? after.reduce((s, f) => s + f, 0) : null,
    totalRentalTax,
    totalSocialContributions: taxes.reduce(
      (s, t) => s + t.socialContributions,
      0
    ),
    capitalGainsTax: capitalGains.total,
    firstRentalYear: firstRental?.year ?? null,
    firstRentalYearCashFlowAfterTax: firstRental?.cashFlowAfterTax ?? null,
    firstRentalYearMonthlyAfterTax:
      firstRental?.cashFlowAfterTax == null
        ? null
        : firstRental.cashFlowAfterTax / 12,
  }
  return { regime, rows, sale, summary, ineligibleYear }
}

export function projection(
  input: StudyInput,
  a: Assumptions,
  options: ProjectionOptions
): ProjectionReport {
  const horizonYears = Math.min(
    40,
    Math.max(1, Math.round(options.horizonYears ?? a.horizonYears))
  )
  const metrics = compute(input.financials, a)
  const dates = {
    purchase: purchaseDate(a, options.at),
    start: rentalStartDate(input.rental.year, a),
  }
  const requested = options.regime ?? a.taxRegime
  const { regime, adjusted } = resolveRegime(requested, input.leaseType)
  const main = runRegime(input, a, metrics, regime, dates, horizonYears)
  const runs = regimesFor(input.leaseType).map(r =>
    r === regime ? main : runRegime(input, a, metrics, r, dates, horizonYears)
  )
  const regimes: RegimeComparison[] = runs.map(run => ({
    regime: run.regime,
    eligible: run.ineligibleYear === null,
    reason:
      run.ineligibleYear === null
        ? null
        : `Plafond du régime micro dépassé à partir de l’année ${run.ineligibleYear} : réel imposé ces années-là.`,
    totalRentalTax: run.summary.totalRentalTax,
    totalSocialContributions: run.summary.totalSocialContributions,
    capitalGainsTax: run.summary.capitalGainsTax,
    irrAfterTax: run.summary.irrAfterTax,
    netWealthAfterTax: run.summary.netWealthAfterTax,
    firstRentalYearCashFlowAfterTax:
      run.summary.firstRentalYearCashFlowAfterTax,
  }))
  let bestRegime: TaxRegime | null = null
  let bestWealth = Number.NEGATIVE_INFINITY
  for (const r of regimes) {
    if (r.netWealthAfterTax !== null && r.netWealthAfterTax > bestWealth) {
      bestWealth = r.netWealthAfterTax
      bestRegime = r.regime
    }
  }

  const warnings: string[] = []
  if (a.marginalTaxRate === null) {
    warnings.push(
      'TMI du foyer non renseignée : l’impôt sur le revenu n’est pas estimé (prélèvements sociaux seuls dans le détail), le TRI et l’enrichissement après impôt ne sont pas calculés.'
    )
  }
  if (a.currentRent === null && main.rows.some(r => r.phase1Months > 0)) {
    warnings.push(
      'Loyer actuel non renseigné : la phase 1 ne compte aucun loyer évité, le TRI est sous-estimé.'
    )
  }
  if (adjusted && requested !== null) {
    warnings.push(
      `${TAX_REGIME_LABELS[requested]} ne convient pas à ce bail : ${TAX_REGIME_LABELS[regime]} retenu.`
    )
  }
  if (input.leaseType === 'shared') {
    warnings.push('Colocation supposée meublée : revenus imposés en BIC.')
  }
  if (metrics.rent <= 0) {
    warnings.push('Loyer visé non renseigné : aucun loyer en phase 2.')
  }
  if (main.sale.mainResidenceAtSale) {
    warnings.push(
      'Vente avant la mise en location : le bien est encore la résidence principale, plus-value exonérée.'
    )
  }
  if (main.ineligibleYear !== null) {
    warnings.push(
      `Recettes au-delà du plafond du régime micro à partir de l’année ${main.ineligibleYear} : réel imposé.`
    )
  }
  if (isBicRegime(regime)) {
    warnings.push(
      `Prélèvements sociaux sur les loyers meublés : ${formatPercent(a.taxParameters.socialContributions.furnishedIncomeRate)} (paramètres du ${a.taxParameters.asOf}, à confirmer).`
    )
  }

  return {
    listingId: options.listingId ?? null,
    title: options.title ?? 'Annonce',
    parameters: {
      purchaseDate: dates.purchase,
      rentalStartDate: dates.start,
      horizonYears,
      leaseType: input.leaseType,
      furnishedRentalKind: a.furnishedRentalKind,
      requestedRegime: requested,
      marginalTaxRate: a.marginalTaxRate,
      appreciationRate: a.appreciationRate,
      rentIndexationRate: a.rentIndexationRate,
      resaleCostsRate: a.resaleCostsRate,
      discountRate: main.summary.discountRate,
      currentRent: a.currentRent,
      maintenanceAnnual: a.maintenanceAnnual,
      taxParametersLabel: a.taxParameters.label,
      taxParametersAsOf: a.taxParameters.asOf,
    },
    rows: main.rows,
    sale: main.sale,
    summary: main.summary,
    regimes,
    bestRegime,
    warnings,
    disclaimer: STUDY_DISCLAIMER,
  }
}

/** Un point du graphique de la projection. */
export interface WealthPoint {
  year: number
  /** Cash-flow de l'année, net d'impôt quand il est connu, sinon avant impôt. */
  cashFlow: number
  afterTax: boolean
  cumulativeCashFlow: number
  /**
   * Position latente en fin d'année : − mise de départ + cash-flows cumulés
   * + valeur − capital restant dû (avant frais et impôt de revente).
   */
  position: number
}

/** La série du graphique : cash-flow annuel et position latente cumulée. */
export function wealthSeries(report: ProjectionReport): WealthPoint[] {
  let cumulative = 0
  return report.rows.map(row => {
    const afterTax = row.cashFlowAfterTax !== null
    const cashFlow = row.cashFlowAfterTax ?? row.cashFlowBeforeTax
    cumulative += cashFlow
    return {
      year: row.year,
      cashFlow,
      afterTax,
      cumulativeCashFlow: cumulative,
      position: -report.summary.equity + cumulative + row.netEquity,
    }
  })
}
