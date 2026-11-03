import type {
  Assumptions,
  DiscountClass,
  ListingFinancials,
  TargetCriterion,
  TargetPrice,
  TargetPriceCriterion,
} from '@apart/contracts'
import { netOperating, totalCost } from './compute.js'
import { monthlyFactor } from './loan.js'

/** Précision de la recherche numérique du prix : un demi-centime. */
export const PRICE_SEARCH_TOLERANCE = 0.005

/**
 * Prix correspondant à un coût total donné.
 *
 * En mode taux, l'inverse en forme fermée de `cout = P + n × (P − H) + T + M`,
 * soit `P = (cout − T − M + n × H) / (1 + n)`. En mode barème, les frais ne
 * sont plus proportionnels (tranches, minimum, forfaits) : le prix est
 * cherché par bissection sur `cout(P)`, qui est croissante en `P`.
 */
export function priceForTotalCost(
  cost: number,
  input: ListingFinancials,
  a: Assumptions
): number {
  if (a.notaryMode === 'scale') return priceForTotalCostBySearch(cost, input, a)
  const base = cost - input.renovationTotal - input.furnitureValue
  const withFees = (base + a.notaryRate * input.buyerFees) / (1 + a.notaryRate)
  // Des honoraires supérieurs au prix : la base des frais de notaire est
  // nulle (comme dans `notaryFees`), le prix est alors le coût sans frais.
  return withFees >= input.buyerFees ? withFees : base
}

/**
 * Bissection : le plus grand prix `P` tel que `cout(P) ≤ cout`. `cout(P)` est
 * croissante (prix, droits et émoluments croissants, forfaits constants) ;
 * elle vaut `T + M` en zéro et dépasse `P + T + M` ensuite, donc la racine
 * est dans `[0, cout − T − M]`. Arrêt au demi-centime.
 */
function priceForTotalCostBySearch(
  cost: number,
  input: ListingFinancials,
  a: Assumptions
): number {
  const costAt = (price: number): number => totalCost({ ...input, price }, a)
  let lo = 0
  let hi = cost - input.renovationTotal - input.furnitureValue
  if (!(hi > 0)) return 0
  if (costAt(hi) <= cost) return hi
  while (hi - lo > PRICE_SEARCH_TOLERANCE) {
    const mid = (lo + hi) / 2
    if (costAt(mid) <= cost) lo = mid
    else hi = mid
  }
  return lo
}

/** Un prix maximal négatif ou nul signifie qu'aucun prix ne satisfait le critère. */
function positiveOrNull(price: number): number | null {
  return Number.isFinite(price) && price > 0 ? price : null
}

/** Prix maximal pour que le rendement brut atteigne `s_b` : `c⁻¹(12 L / s_b)`. */
export function maxPriceForGrossYield(
  input: ListingFinancials,
  a: Assumptions
): number | null {
  const { rent } = netOperating(input, a)
  if (a.grossYieldThreshold <= 0 || rent <= 0) return null
  return positiveOrNull(
    priceForTotalCost((12 * rent) / a.grossYieldThreshold, input, a)
  )
}

/** Prix maximal pour que le rendement net atteigne `s_n` : `c⁻¹(netExpl / s_n)`. */
export function maxPriceForNetYield(
  input: ListingFinancials,
  a: Assumptions
): number | null {
  if (a.netYieldThreshold === null || a.netYieldThreshold <= 0) return null
  const { netOperating: net } = netOperating(input, a)
  if (net <= 0) return null
  return positiveOrNull(priceForTotalCost(net / a.netYieldThreshold, input, a))
}

/**
 * Prix maximal pour que l'effort reste au-dessus de `−E` :
 * `c⁻¹(A + (netExpl / 12 + E) / k)`. Null si même sans emprunt l'effort
 * dépasse le maximum (`netExpl / 12 + E < 0`).
 */
export function maxPriceForEffort(
  input: ListingFinancials,
  a: Assumptions
): number | null {
  const { netOperating: net } = netOperating(input, a)
  const headroom = net / 12 + a.maxMonthlyEffort
  if (headroom < 0) return null
  const k = monthlyFactor(a.interestRate, a.durationYears, a.insuranceRate)
  if (!Number.isFinite(k) || k <= 0) return null
  return positiveOrNull(
    priceForTotalCost(a.downPayment + headroom / k, input, a)
  )
}

/** Prix maximal du repère 220 × loyer : `c⁻¹(220 L)`. */
export function maxPriceForRule220(
  input: ListingFinancials,
  a: Assumptions
): number | null {
  const { rent } = netOperating(input, a)
  if (rent <= 0) return null
  return positiveOrNull(priceForTotalCost(220 * rent, input, a))
}

/**
 * Prix maximal du critère « marché » (lot 4, besoin N4) : médiane au m² des
 * ventes DVF comparables × surface. Une estimation (provenance `estimated`),
 * null sans médiane ou sans surface.
 */
export function maxPriceForMarket(input: ListingFinancials): number | null {
  if (input.marketPricePerM2 === null || !(input.marketPricePerM2 > 0)) {
    return null
  }
  if (!(input.surface > 0)) return null
  return input.marketPricePerM2 * input.surface
}

/** Classement de la décote selon les seuils des hypothèses. */
export function classifyDiscount(
  discount: number,
  a: Assumptions
): DiscountClass {
  if (discount <= 0) return 'in_target'
  if (discount <= a.negotiableDiscount) return 'negotiable'
  if (discount <= a.tightDiscount) return 'tight'
  return 'out_of_reach'
}

const CRITERIA: readonly TargetCriterion[] = [
  'gross_yield',
  'net_yield',
  'effort',
  'rent_x220',
  'market',
]

/**
 * Prix cible : minimum des prix maximaux des critères actifs, critère liant,
 * décote nécessaire par rapport au prix affiché et son classement.
 */
export function targetPrice(
  input: ListingFinancials,
  a: Assumptions
): TargetPrice {
  const maxPrices: Record<TargetCriterion, number | null> = {
    gross_yield: maxPriceForGrossYield(input, a),
    net_yield: maxPriceForNetYield(input, a),
    effort: maxPriceForEffort(input, a),
    rent_x220: maxPriceForRule220(input, a),
    market: maxPriceForMarket(input),
  }

  const discountFor = (maxPrice: number | null): number | null =>
    maxPrice !== null && input.price > 0
      ? (input.price - maxPrice) / input.price
      : null

  const criteria: TargetPriceCriterion[] = CRITERIA.map(criterion => ({
    criterion,
    maxPrice: maxPrices[criterion],
    active: a.targetCriteria.includes(criterion),
    discount: discountFor(maxPrices[criterion]),
  }))

  let target: number | null = null
  let binding: TargetCriterion | null = null
  for (const c of criteria) {
    if (!c.active || c.maxPrice === null) continue
    if (target === null || c.maxPrice < target) {
      target = c.maxPrice
      binding = c.criterion
    }
  }

  const discount = discountFor(target)

  return {
    criteria,
    targetPrice: target,
    bindingCriterion: binding,
    discount,
    discountClass: discount === null ? null : classifyDiscount(discount, a),
  }
}
