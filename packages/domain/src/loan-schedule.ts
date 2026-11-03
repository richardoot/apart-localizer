import { loanTerms } from './loan.js'

/** Une mensualité du tableau d'amortissement. */
export interface LoanMonth {
  /** Rang de la mensualité, de 1 à N. */
  month: number
  interest: number
  principal: number
  insurance: number
  /** Crédit + assurance : la mensualité payée. */
  payment: number
  /** Capital restant dû après cette mensualité. */
  remaining: number
}

/**
 * Tableau d'amortissement à mensualités constantes : intérêts sur le capital
 * restant dû, capital remboursé, assurance sur le capital initial (comme le
 * facteur `k` du modèle § 2). À taux nul, amortissement linéaire. La
 * dernière mensualité solde le capital (aucun reste flottant).
 */
export function loanSchedule(
  loanAmount: number,
  interestRate: number,
  durationYears: number,
  insuranceRate: number
): LoanMonth[] {
  const { monthlyRate: r, months: n } = loanTerms(interestRate, durationYears)
  if (!(loanAmount > 0) || n <= 0) return []
  const zeroRate = r === 0 || 1 + r === 1
  const credit = zeroRate
    ? loanAmount / n
    : loanAmount * (r / (1 - Math.pow(1 + r, -n)))
  const insurance = (loanAmount * insuranceRate) / 12
  const schedule: LoanMonth[] = []
  let remaining = loanAmount
  for (let month = 1; month <= n; month++) {
    const interest = zeroRate ? 0 : remaining * r
    const principal = month === n ? remaining : credit - interest
    remaining = month === n ? 0 : remaining - principal
    schedule.push({
      month,
      interest,
      principal,
      insurance,
      payment: interest + principal + insurance,
      remaining,
    })
  }
  return schedule
}
