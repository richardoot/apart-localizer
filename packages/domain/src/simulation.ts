import type {
  Assumptions,
  ListingFinancials,
  ListingMetrics,
} from '@apart/contracts'
import { monthsBetween } from './dates.js'
import { loanSchedule } from './loan-schedule.js'
import type { LoanMonth } from './loan-schedule.js'

/**
 * Simulation mois par mois depuis l'acquisition (lot 5) : phase 1 (le foyer
 * habite le bien) puis phase 2 (il le loue). Les coûts, le loyer actuel et
 * la taxe foncière suivent l'indexation annuelle des hypothèses à chaque
 * anniversaire de l'acquisition ; le loyer encaissé, à chaque anniversaire
 * du bail. La vacance s'étale sur l'année : (12 − v) / 12 du loyer chaque mois.
 */

export interface SimulationInput {
  financials: ListingFinancials
  metrics: ListingMetrics
  assumptions: Assumptions
  purchaseDate: string
  rentalStartDate: string
  /** Nombre de mois simulés (horizon × 12). */
  months: number
}

export interface SimulatedMonth {
  /** Rang du mois depuis l'acquisition, à partir de 0. */
  index: number
  phase: 1 | 2
  /** Année de détention, à partir de 1. */
  holdingYear: number
  rentAvoided: number
  rentCollected: number
  payment: number
  interest: number
  principal: number
  insurance: number
  charges: number
  propertyTax: number
  maintenance: number
  fixedCosts: number
  /** Capital restant dû après ce mois. */
  remaining: number
}

export interface Simulation {
  phase1Months: number
  schedule: LoanMonth[]
  months: SimulatedMonth[]
}

export function simulateMonths(input: SimulationInput): Simulation {
  const { financials, metrics, assumptions: a } = input
  const months = Math.max(0, Math.floor(input.months))
  const phase1Months = Math.min(
    months,
    Math.max(0, monthsBetween(input.purchaseDate, input.rentalStartDate))
  )
  const schedule = loanSchedule(
    metrics.loanAmount,
    a.interestRate,
    a.durationYears,
    a.insuranceRate
  )
  const growth = 1 + a.rentIndexationRate
  const occupancyFactor = Math.max(0, 12 - a.vacancyMonths) / 12
  const out: SimulatedMonth[] = []
  for (let index = 0; index < months; index++) {
    const loan = schedule[index]
    const costIndex = Math.pow(growth, Math.floor(index / 12))
    const phase: 1 | 2 = index < phase1Months ? 1 : 2
    const base = {
      index,
      phase,
      holdingYear: Math.floor(index / 12) + 1,
      payment: loan?.payment ?? 0,
      interest: loan?.interest ?? 0,
      principal: loan?.principal ?? 0,
      insurance: loan?.insurance ?? 0,
      propertyTax: (metrics.propertyTax / 12) * costIndex,
      remaining: loan?.remaining ?? 0,
    }
    if (phase === 1) {
      out.push({
        ...base,
        rentAvoided: (a.currentRent ?? 0) * costIndex,
        rentCollected: 0,
        charges: ((financials.annualCharges ?? 0) / 12) * costIndex,
        maintenance: ((a.maintenanceAnnual ?? 0) / 12) * costIndex,
        fixedCosts: 0,
      })
    } else {
      const leaseYears = Math.floor((index - phase1Months) / 12)
      out.push({
        ...base,
        rentAvoided: 0,
        rentCollected:
          metrics.rent * Math.pow(growth, leaseYears) * occupancyFactor,
        charges: metrics.nonRecoverableChargesMonthly * costIndex,
        maintenance: 0,
        fixedCosts: (a.fixedCostsAnnual / 12) * costIndex,
      })
    }
  }
  return { phase1Months, schedule, months: out }
}
