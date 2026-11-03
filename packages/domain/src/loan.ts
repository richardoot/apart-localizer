/**
 * Crédit immobilier : facteur mensuel, mensualité, capital restant dû,
 * intérêts de la première année. Formules du modèle de calcul § 2 et § 4.
 */

/** Taux mensuel et nombre de mensualités. */
export function loanTerms(
  interestRate: number,
  durationYears: number
): { monthlyRate: number; months: number } {
  return { monthlyRate: interestRate / 12, months: durationYears * 12 }
}

/**
 * Facteur mensuel `k` : part du capital à payer chaque mois, crédit et
 * assurance compris. `k = r / (1 − (1 + r)^−N) + a / 12` ; à taux nul,
 * `1 / N + a / 12`.
 */
export function monthlyFactor(
  interestRate: number,
  durationYears: number,
  insuranceRate: number
): number {
  const { monthlyRate: r, months: n } = loanTerms(interestRate, durationYears)
  if (n <= 0) return Number.NaN
  // Un taux si petit que `1 + r` vaut 1 en flottant se traite comme un taux nul.
  const credit = r > 0 && 1 + r !== 1 ? r / (1 - Math.pow(1 + r, -n)) : 1 / n
  return credit + insuranceRate / 12
}

/** Mensualité crédit + assurance pour un capital donné (0 si rien n'est emprunté). */
export function monthlyPayment(
  loanAmount: number,
  interestRate: number,
  durationYears: number,
  insuranceRate: number
): number {
  if (loanAmount <= 0) return 0
  return loanAmount * monthlyFactor(interestRate, durationYears, insuranceRate)
}

/**
 * Capital restant dû après `monthsElapsed` mensualités :
 * `CRD(m) = emprunt × ((1 + r)^N − (1 + r)^m) / ((1 + r)^N − 1)`.
 * À taux nul, l'amortissement est linéaire.
 */
export function remainingPrincipal(
  loanAmount: number,
  interestRate: number,
  durationYears: number,
  monthsElapsed: number
): number {
  const { monthlyRate: r, months: n } = loanTerms(interestRate, durationYears)
  if (loanAmount <= 0 || n <= 0) return 0
  const m = Math.min(Math.max(0, monthsElapsed), n)
  if (r === 0 || 1 + r === 1) return loanAmount * (1 - m / n)
  const growth = Math.pow(1 + r, n)
  return (loanAmount * (growth - Math.pow(1 + r, m))) / (growth - 1)
}

/**
 * Intérêts payés sur les douze premières mensualités, par le tableau
 * d'amortissement exact (le modèle donne `emprunt × t` comme approximation).
 */
export function firstYearInterest(
  loanAmount: number,
  interestRate: number,
  durationYears: number
): number {
  const { monthlyRate: r, months: n } = loanTerms(interestRate, durationYears)
  if (loanAmount <= 0 || n <= 0 || r === 0 || 1 + r === 1) return 0
  const payment = loanAmount * (r / (1 - Math.pow(1 + r, -n)))
  let principal = loanAmount
  let interest = 0
  for (let month = 0; month < Math.min(12, n); month++) {
    const monthInterest = principal * r
    interest += monthInterest
    principal -= payment - monthInterest
  }
  return interest
}

export interface OccupationCostInput {
  monthlyPayment: number
  loanAmount: number
  interestRate: number
  durationYears: number
  insuranceRate: number
  /** Charges de copropriété annuelles totales (le propriétaire occupant paie tout). */
  annualCharges: number
  propertyTax: number
  maintenanceAnnual: number
  currentRent: number | null
}

export interface OccupationCost {
  /** Ce que coûte le logement chaque mois pendant la phase 1. */
  monthly: number
  /** Part de ce coût qui ne construit aucun patrimoine (intérêts, assurance, charges, taxe, entretien). */
  sunkMonthly: number
  /** Écart avec le loyer actuel ; null si le loyer actuel n'est pas connu. */
  rentGap: number | null
}

/** Coût d'occupation en phase 1 (modèle § 4). */
export function occupationCost(input: OccupationCostInput): OccupationCost {
  const monthly =
    input.monthlyPayment +
    input.annualCharges / 12 +
    input.propertyTax / 12 +
    input.maintenanceAnnual / 12
  const sunkMonthly =
    firstYearInterest(
      input.loanAmount,
      input.interestRate,
      input.durationYears
    ) /
      12 +
    (input.loanAmount * input.insuranceRate) / 12 +
    input.annualCharges / 12 +
    input.propertyTax / 12 +
    input.maintenanceAnnual / 12
  return {
    monthly,
    sunkMonthly,
    rentGap: input.currentRent === null ? null : monthly - input.currentRent,
  }
}
