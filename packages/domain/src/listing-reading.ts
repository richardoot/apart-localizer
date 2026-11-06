import type {
  Assumptions,
  ListingMetrics,
  PriceOutcome,
} from '@apart/contracts'
import { monthlyPayment } from './loan.js'
import { VERDICT_TOLERANCE } from './verdict.js'

/**
 * Lecture de la fiche annonce (lot 9) : ce que l'interface affiche à côté des
 * indicateurs (critères satisfaits ou non, part de l'assurance dans la
 * mensualité, position du prix cible sur une échelle). Fonctions pures, pour
 * qu'aucun composant ne compare ni ne divise lui-même.
 */

/** Indicateurs du bloc « Est-ce rentable ? », dans l'ordre d'affichage. */
export type ProfitabilityIndicator = 'gross_yield' | 'effort' | 'net_yield'

/**
 * `ok` : seuil atteint ; `near` : manqué de peu (marges du verdict) ;
 * `fail` : en échec ; `not_retained` : le critère ne compte pas.
 */
export type ProfitabilityStatus = 'ok' | 'near' | 'fail' | 'not_retained'

export interface ProfitabilityCheck {
  indicator: ProfitabilityIndicator
  /** Valeur de l'indicateur : fraction (rendements) ou euros par mois (effort). */
  value: number
  /**
   * Seuil des hypothèses : rendement minimal (fraction) ou effort maximal
   * accepté (euros par mois, positif) ; null si aucun seuil n'est fixé.
   */
  threshold: number | null
  /** Le critère compte : dans le verdict (brut, effort) ou dans le prix cible (net). */
  retained: boolean
  status: ProfitabilityStatus
}

/** Ce que les contrôles lisent d'une évaluation, au prix affiché ou au prix cible. */
export type ProfitabilityInput = Pick<
  ListingMetrics | PriceOutcome,
  'grossYield' | 'netYield' | 'effort' | 'failures' | 'nearMisses'
>

/**
 * Les trois contrôles de rentabilité d'une évaluation. Le rendement brut et
 * l'effort sont toujours retenus (ils font le verdict) : leur état reprend
 * les échecs et les « de peu » du verdict. Le rendement net n'est retenu que
 * si un seuil est fixé et que le critère compte pour le prix cible ; il est
 * alors atteint (à l'arrondi près, comme le verdict) ou en échec, sans marge.
 */
export function profitabilityChecks(
  m: ProfitabilityInput,
  a: Assumptions
): ProfitabilityCheck[] {
  const verdictStatus = (key: 'gross_yield' | 'effort'): ProfitabilityStatus =>
    m.failures.includes(key)
      ? 'fail'
      : m.nearMisses.includes(key)
        ? 'near'
        : 'ok'
  const netThreshold = a.netYieldThreshold
  const netStatus: ProfitabilityStatus =
    netThreshold === null || !a.targetCriteria.includes('net_yield')
      ? 'not_retained'
      : m.netYield >= netThreshold - VERDICT_TOLERANCE.yield
        ? 'ok'
        : 'fail'
  return [
    {
      indicator: 'gross_yield',
      value: m.grossYield,
      threshold: a.grossYieldThreshold,
      retained: true,
      status: verdictStatus('gross_yield'),
    },
    {
      indicator: 'effort',
      value: m.effort,
      threshold: a.maxMonthlyEffort,
      retained: true,
      status: verdictStatus('effort'),
    },
    {
      indicator: 'net_yield',
      value: m.netYield,
      threshold: netThreshold,
      retained: netStatus !== 'not_retained',
      status: netStatus,
    },
  ]
}

export interface MonthlyPaymentSplit {
  /** Part du crédit (intérêts et capital), euros par mois. */
  credit: number
  /** Part de l'assurance emprunteur, euros par mois. */
  insurance: number
  /** Mensualité totale, euros par mois. */
  total: number
}

/**
 * La mensualité séparée en crédit et assurance (modèle § 2) :
 * `assurance = emprunt × a / 12`, `crédit = mensualité − assurance`.
 */
export function monthlyPaymentSplit(
  loanAmount: number,
  a: Assumptions
): MonthlyPaymentSplit {
  if (!(loanAmount > 0)) return { credit: 0, insurance: 0, total: 0 }
  const total = monthlyPayment(
    loanAmount,
    a.interestRate,
    a.durationYears,
    a.insuranceRate
  )
  const insurance = (loanAmount * a.insuranceRate) / 12
  return { credit: total - insurance, insurance, total }
}

export interface PriceGauge {
  /** Haut de l'échelle en euros : le plus grand du prix affiché et du prix cible. */
  max: number
  /** Position du prix affiché sur l'échelle, de 0 à 1. */
  listedShare: number
  /** Position du prix cible sur l'échelle, de 0 à 1. */
  targetShare: number
}

/**
 * L'échelle du bloc « Combien négocier ? » : de 0 au plus grand des deux
 * prix, où tombent le prix cible et le prix affiché. Null sans prix affiché
 * ou sans prix cible.
 */
export function priceGauge(
  listedPrice: number,
  target: number | null
): PriceGauge | null {
  if (target === null || !(listedPrice > 0) || !(target > 0)) return null
  const max = Math.max(listedPrice, target)
  return { max, listedShare: listedPrice / max, targetShare: target / max }
}

// ---------------------------------------------------------------------------
// Lot 19 (ADR 0029) : les repères des onglets Synthèse, Budget et Négocier
// ---------------------------------------------------------------------------

/**
 * L'écart du prix au m² de l'annonce à la médiane des ventes du quartier
 * (DVF), en fraction (0,03 = 3 % au-dessus) ; null sans médiane ou sans
 * prix au m².
 */
export function marketGap(
  pricePerM2: number,
  medianPricePerM2: number | null
): number | null {
  if (medianPricePerM2 === null || !(medianPricePerM2 > 0)) return null
  if (!Number.isFinite(pricePerM2) || !(pricePerM2 > 0)) return null
  return pricePerM2 / medianPricePerM2 - 1
}

export type CostShareKey = 'price' | 'notary' | 'renovation' | 'furniture'

export interface CostShare {
  key: CostShareKey
  /** Montant en euros. */
  amount: number
  /** Part du coût tout compris, de 0 à 1. */
  share: number
}

/**
 * La barre « À l'achat » : le coût tout compris réparti entre prix, frais de
 * notaire, travaux et mobilier (les parts nulles sont omises). Vide sans coût.
 */
export function costShares(
  m: Pick<
    ListingMetrics,
    'price' | 'notaryFees' | 'renovationTotal' | 'furnitureValue' | 'totalCost'
  >
): CostShare[] {
  if (!(m.totalCost > 0)) return []
  const parts: Array<[CostShareKey, number]> = [
    ['price', m.price],
    ['notary', m.notaryFees],
    ['renovation', m.renovationTotal],
    ['furniture', m.furnitureValue],
  ]
  return parts
    .filter(([, amount]) => amount > 0)
    .map(([key, amount]) => ({ key, amount, share: amount / m.totalCost }))
}

export interface PriceRangeGauge {
  /** Bas de l'échelle en euros (au millier inférieur). */
  min: number
  /** Haut de l'échelle en euros (au millier supérieur). */
  max: number
  listedShare: number
  /** Fin de la zone « cible » (le prix cible), null sans prix cible. */
  targetShare: number | null
  /** L'offre suggérée, null sans offre. */
  offerShare: number | null
}

/**
 * La jauge de l'onglet Négocier, resserrée autour des prix qui comptent :
 * de 4 % sous le plus bas (prix affiché, prix cible, offre suggérée) à 1 %
 * au-dessus du plus haut, arrondis au millier. Null sans prix affiché.
 */
export function priceRangeGauge(
  listedPrice: number,
  target: number | null,
  offer: number | null
): PriceRangeGauge | null {
  if (!(listedPrice > 0)) return null
  const values = [listedPrice, target, offer].filter(
    (v): v is number => v !== null && v > 0
  )
  const min = Math.floor((Math.min(...values) * 0.96) / 1000) * 1000
  const max = Math.ceil((Math.max(...values) * 1.01) / 1000) * 1000
  const share = (v: number | null): number | null =>
    v === null || !(v > 0) ? null : (v - min) / (max - min)
  return {
    min,
    max,
    listedShare: share(listedPrice) ?? 0,
    targetShare: share(target),
    offerShare: share(offer),
  }
}

export interface RentGauge {
  /** Bas de l'échelle, euros par mois (une dizaine, 80 % du plus bas). */
  min: number
  /** Haut de l'échelle, euros par mois. */
  max: number
  targetShare: number
  /** La fourchette du marché (comparables, ou le loyer de marché seul). */
  marketFromShare: number | null
  marketToShare: number | null
  capShare: number | null
}

/**
 * La jauge du loyer visé de la phase 2 : le loyer visé, la fourchette du
 * marché (premier et troisième quartiles des comparables, ou le loyer de
 * marché constaté seul) et le plafond d'encadrement, sur une échelle resserrée
 * comme celle du prix (de 80 % du plus bas, arrondi à la dizaine, à 3 %
 * au-dessus du plus haut) : les écarts de quelques dizaines d'euros se
 * voient. Null sans loyer visé.
 */
export function rentGauge(input: {
  targetRent: number
  marketLow: number | null
  marketHigh: number | null
  rentCap: number | null
}): RentGauge | null {
  if (!(input.targetRent > 0)) return null
  const positive = (v: number | null): number | null =>
    v !== null && v > 0 ? v : null
  const low = positive(input.marketLow)
  const high = positive(input.marketHigh) ?? low
  const cap = positive(input.rentCap)
  const values = [input.targetRent, low, high, cap].filter(
    (v): v is number => v !== null
  )
  const bottom = Math.floor((Math.min(...values) * 0.8) / 10) * 10
  const top = Math.max(...values) * 1.03
  const share = (v: number | null): number | null =>
    v === null ? null : (v - bottom) / (top - bottom)
  return {
    min: bottom,
    max: top,
    targetShare: (input.targetRent - bottom) / (top - bottom),
    marketFromShare: share(low ?? high),
    marketToShare: share(high),
    capShare: share(cap),
  }
}
