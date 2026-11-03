import type {
  Assumptions,
  AssumptionsOverride,
  ListingFinancials,
  ListingMetrics,
} from '@apart/contracts'
import { monthlyFactor } from './loan.js'
import { notaryFeesDetail } from './notary.js'
import { score, verdict } from './verdict.js'

/** Hypothèses de l'espace surchargées, champ par champ, par celles d'une annonce. */
export function mergeAssumptions(
  base: Assumptions,
  override: AssumptionsOverride | null | undefined
): Assumptions {
  if (!override) return base
  const merged: Assumptions = { ...base }
  for (const [key, value] of Object.entries(override) as [
    keyof Assumptions,
    unknown,
  ][]) {
    if (value !== undefined) {
      ;(merged as Record<string, unknown>)[key] = value
    }
  }
  return merged
}

/** Plafond mensuel d'encadrement, si la commune est encadrée et le loyer de référence connu. */
export function rentCap(input: ListingFinancials): number | null {
  if (!input.rentControlled) return null
  if (input.referenceRentPerM2 === null || input.referenceRentPerM2 <= 0) {
    return null
  }
  if (input.surface <= 0) return null
  return input.referenceRentPerM2 * input.surface
}

/** Loyer retenu : le loyer visé, borné par le plafond s'il existe. */
export function retainedRent(input: ListingFinancials): number {
  const cap = rentCap(input)
  return cap === null ? input.targetRent : Math.min(input.targetRent, cap)
}

/**
 * Frais de notaire : taux × net vendeur (prix moins honoraires acquéreur) en
 * mode « rate », barème détaillé en mode « scale » (voir `notaryFeesDetail`).
 */
export function notaryFees(input: ListingFinancials, a: Assumptions): number {
  return notaryFeesDetail(input, a).total
}

/** Coût total : prix + notaire + travaux + mobilier. */
export function totalCost(input: ListingFinancials, a: Assumptions): number {
  return (
    input.price +
    notaryFees(input, a) +
    input.renovationTotal +
    input.furnitureValue
  )
}

/**
 * Résultat net d'exploitation annuel, indépendant du prix : loyers encaissés
 * après vacance, moins taxe foncière, charges non récupérables et frais fixes.
 * La taxe foncière absente est estimée à un mois de loyer ; la part non
 * récupérable absente à 25 % des charges annuelles.
 */
export function netOperating(
  input: ListingFinancials,
  a: Assumptions
): {
  rent: number
  propertyTax: number
  propertyTaxEstimated: boolean
  nonRecoverableChargesMonthly: number
  nonRecoverableChargesEstimated: boolean
  collectedRent: number
  netOperating: number
} {
  const rent = retainedRent(input)
  const propertyTaxEstimated = input.propertyTax === null
  const propertyTax = propertyTaxEstimated ? rent : (input.propertyTax ?? 0)
  const hasCharges = input.annualCharges !== null && input.annualCharges > 0
  const nonRecoverableChargesEstimated =
    input.nonRecoverableChargesMonthly === null && hasCharges
  const nonRecoverableChargesMonthly =
    input.nonRecoverableChargesMonthly !== null
      ? input.nonRecoverableChargesMonthly
      : nonRecoverableChargesEstimated
        ? ((input.annualCharges ?? 0) * 0.25) / 12
        : 0
  const collectedRent = rent * (12 - a.vacancyMonths)
  return {
    rent,
    propertyTax,
    propertyTaxEstimated,
    nonRecoverableChargesMonthly,
    nonRecoverableChargesEstimated,
    collectedRent,
    netOperating:
      collectedRent -
      propertyTax -
      nonRecoverableChargesMonthly * 12 -
      a.fixedCostsAnnual,
  }
}

/**
 * Le calcul de l'artefact, à l'identique : coût, financement, exploitation
 * locative, verdict et score. Pur : mêmes entrées, mêmes sorties.
 */
export function compute(
  input: ListingFinancials,
  assumptions: Assumptions
): ListingMetrics {
  const a = assumptions
  const cap = rentCap(input)
  const operating = netOperating(input, a)
  const feesDetail = notaryFeesDetail(input, a)
  const fees = feesDetail.total
  const cost = input.price + fees + input.renovationTotal + input.furnitureValue
  const loanAmount = Math.max(0, cost - a.downPayment)
  const k = monthlyFactor(a.interestRate, a.durationYears, a.insuranceRate)
  const monthlyPayment = loanAmount > 0 ? loanAmount * k : 0

  const grossYield = cost > 0 ? (operating.rent * 12) / cost : Number.NaN
  const netYield = cost > 0 ? operating.netOperating / cost : Number.NaN
  const effort = operating.netOperating / 12 - monthlyPayment
  const pricePerM2 =
    input.surface > 0 ? input.price / input.surface : Number.NaN
  const rentPerM2 =
    input.surface > 0 ? operating.rent / input.surface : Number.NaN

  const decision = verdict({ grossYield, effort, dpeClass: input.dpeClass }, a)

  return {
    price: input.price,
    surface: input.surface,
    targetRent: input.targetRent,
    rent: operating.rent,
    rentControlled: input.rentControlled,
    rentCap: cap,
    notaryFees: fees,
    notaryFeesDetail: feesDetail,
    renovationTotal: input.renovationTotal,
    totalCost: cost,
    loanAmount,
    monthlyFactor: k,
    monthlyPayment,
    propertyTax: operating.propertyTax,
    propertyTaxEstimated: operating.propertyTaxEstimated,
    nonRecoverableChargesMonthly: operating.nonRecoverableChargesMonthly,
    nonRecoverableChargesEstimated: operating.nonRecoverableChargesEstimated,
    annualCharges: input.annualCharges,
    collectedRent: operating.collectedRent,
    netOperating: operating.netOperating,
    grossYield,
    netYield,
    effort,
    pricePerM2,
    rentPerM2,
    maxCostRule220: operating.rent * 220,
    verdict: decision.verdict,
    score: score(decision.verdict, grossYield),
    failures: decision.failures,
    nearMisses: decision.nearMisses,
  }
}
