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
