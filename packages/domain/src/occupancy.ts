import type { Assumptions, OccupancyReport } from '@apart/contracts'
import { compute } from './compute.js'
import { monthsBetween } from './dates.js'
import { formatEuros } from './format.js'
import { remainingPrincipal } from './loan.js'
import { simulateMonths } from './simulation.js'
import type { StudyInput } from './study-input.js'
import { purchaseDate, rentalStartDate } from './study-input.js'

export interface OccupancyOptions {
  /** Date du calcul : date d'acquisition par défaut. */
  at: Date
  listingId?: string | null
}

/**
 * Coût d'occupation en phase 1 (modèle § 4, besoin E3) : mensualité,
 * assurance, toutes les charges de copropriété (le propriétaire occupant les
 * paie), taxe foncière et entretien, comparés au loyer actuel du foyer. La
 * part de capital remboursé est mise en regard : coût réel = coût mensuel −
 * capital remboursé (moyenne sur la phase 1, sinon sur les douze premiers
 * mois). Les cumuls de la phase 1 suivent l'indexation des hypothèses.
 */
export function occupancyReport(
  input: StudyInput,
  a: Assumptions,
  options: OccupancyOptions
): OccupancyReport {
  const metrics = compute(input.financials, a)
  const purchase = purchaseDate(a, options.at)
  const start = rentalStartDate(input.rental.year, a)
  const untilStart = monthsBetween(purchase, start)
  // Toute la phase 1, sans plafond d'horizon (douze mois au moins pour la part de capital).
  const sim = simulateMonths({
    financials: input.financials,
    metrics,
    assumptions: a,
    purchaseDate: purchase,
    rentalStartDate: start,
    months: Math.max(12, untilStart),
  })
  const phase1Months = sim.phase1Months
  const insurance = (metrics.loanAmount * a.insuranceRate) / 12
  const credit = metrics.monthlyPayment - insurance
  const charges = (input.financials.annualCharges ?? 0) / 12
  const propertyTax = metrics.propertyTax / 12
  const maintenance = (a.maintenanceAnnual ?? 0) / 12
  const total = metrics.monthlyPayment + charges + propertyTax + maintenance

  const window = phase1Months > 0 ? phase1Months : 12
  let principalInWindow = 0
  let interestInWindow = 0
  for (let m = 0; m < window; m++) {
    principalInWindow += sim.schedule[m]?.principal ?? 0
    interestInWindow += sim.schedule[m]?.interest ?? 0
  }
  const capitalMonthly = principalInWindow / window
  const interestMonthly = interestInWindow / window
  const realCostMonthly = total - capitalMonthly

  const phase1 = sim.months.slice(0, phase1Months)
  const sum = (pick: (m: (typeof phase1)[number]) => number): number =>
    phase1.reduce((acc, m) => acc + pick(m), 0)
  const chargesTaxMaintenance = sum(
    m => m.charges + m.propertyTax + m.maintenance
  )
  const paid = sum(m => m.payment) + chargesTaxMaintenance
  const principalRepaid = sum(m => m.principal)
  const rentAvoided = a.currentRent === null ? null : sum(m => m.rentAvoided)

  const warnings: string[] = []
  if (a.currentRent === null) {
    warnings.push(
      'Loyer actuel du foyer non renseigné (hypothèse « loyer actuel ») : pas de comparaison avec la location.'
    )
  }
  if (input.financials.annualCharges === null) {
    warnings.push(
      'Charges de copropriété non renseignées : comptées à 0 en phase 1.'
    )
  }
  if (a.maintenanceAnnual === null) {
    warnings.push(
      'Entretien annuel non renseigné (hypothèse « entretien ») : compté à 0.'
    )
  }
  if (metrics.propertyTaxEstimated) {
    warnings.push(
      `Taxe foncière estimée à un mois de loyer (≈ ${formatEuros(metrics.propertyTax)} par an) faute de saisie.`
    )
  }
  if (untilStart <= 0) {
    warnings.push(
      'La mise en location est prévue dès l’acquisition (ou avant) : pas de phase 1.'
    )
  }

  return {
    listingId: options.listingId ?? null,
    purchaseDate: purchase,
    rentalStartDate: start,
    phase1Months,
    monthly: {
      credit,
      insurance,
      charges,
      propertyTax,
      maintenance,
      total,
    },
    propertyTaxEstimated: metrics.propertyTaxEstimated,
    chargesKnown: input.financials.annualCharges !== null,
    maintenanceKnown: a.maintenanceAnnual !== null,
    capitalMonthly,
    interestMonthly,
    realCostMonthly,
    currentRent: a.currentRent,
    gapToCurrentRent: a.currentRent === null ? null : total - a.currentRent,
    realGapToCurrentRent:
      a.currentRent === null ? null : realCostMonthly - a.currentRent,
    phase1: {
      paid,
      principalRepaid,
      interest: sum(m => m.interest),
      insurance: sum(m => m.insurance),
      chargesTaxMaintenance,
      rentAvoided,
      netCost:
        rentAvoided === null ? null : paid - principalRepaid - rentAvoided,
    },
    loanAmount: metrics.loanAmount,
    remainingPrincipalAtSwitch: remainingPrincipal(
      metrics.loanAmount,
      a.interestRate,
      a.durationYears,
      phase1Months
    ),
    warnings,
  }
}
