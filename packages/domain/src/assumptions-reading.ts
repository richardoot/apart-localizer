import type { Assumptions } from '@apart/contracts'
import { monthlyPayment } from './loan.js'
import { notaryFeesFromScale } from './notary.js'

/**
 * Lecture de la page Hypothèses (lot 13) : les repères affichés à côté des
 * champs pendant la saisie (mensualité pour un capital rond, taux effectif
 * des frais de notaire sur un prix d'exemple, échelle des décotes). Fonctions
 * pures, pour que la page ne calcule rien elle-même ; elles acceptent une
 * saisie en cours (valeur absente : `null`) et rendent alors `null`.
 */

/** Capital du repère « Pour 100 000 € empruntés », en euros. */
export const REFERENCE_LOAN_AMOUNT = 100_000

/** Prix net vendeur d'exemple du taux effectif des frais de notaire, en euros. */
export const REFERENCE_NOTARY_PRICE = 200_000

/** Conditions du crédit, telles que saisies (fractions, années) ; `null` = absente ou illisible. */
export interface LoanTermsDraft {
  interestRate: number | null
  durationYears: number | null
  insuranceRate: number | null
}

const usable = (value: number | null): value is number =>
  value !== null && Number.isFinite(value)

/**
 * Mensualité, assurance comprise, pour un capital donné (100 000 € par
 * défaut), avec les conditions saisies : `monthlyPayment` du modèle § 2.
 * Null si un taux manque ou est négatif, ou si la durée n'est pas d'au
 * moins un an.
 */
export function referenceMonthlyPayment(
  terms: LoanTermsDraft,
  amount: number = REFERENCE_LOAN_AMOUNT
): number | null {
  const { interestRate, durationYears, insuranceRate } = terms
  if (!usable(interestRate) || interestRate < 0) return null
  if (!usable(insuranceRate) || insuranceRate < 0) return null
  if (!usable(durationYears) || durationYears < 1) return null
  if (!(amount > 0)) return null
  return monthlyPayment(amount, interestRate, durationYears, insuranceRate)
}

/**
 * Taux effectif des frais de notaire sur un prix net vendeur d'exemple
 * (200 000 € par défaut) : le taux forfaitaire en mode « taux », le total
 * du barème rapporté au prix en mode « barème » (`notaryFeesFromScale`).
 * Null sans prix positif.
 */
export function notaryEffectiveRate(
  a: Pick<Assumptions, 'notaryMode' | 'notaryRate' | 'notaryScale'>,
  price: number = REFERENCE_NOTARY_PRICE
): number | null {
  if (!(price > 0) || !Number.isFinite(price)) return null
  if (a.notaryMode === 'rate') return a.notaryRate
  return notaryFeesFromScale({ price, scale: a.notaryScale }).total / price
}

/** Une plage de l'échelle des décotes : négociable, tendue, hors de portée. */
export interface DiscountScaleSegment {
  kind: 'negotiable' | 'tight' | 'out_of_reach'
  /** Décote au début de la plage, en fraction. */
  from: number
  /** Décote à la fin de la plage, en fraction ; null pour « hors de portée », sans fin. */
  to: number | null
  /** Largeur de la plage sur l'échelle, de 0 à 1 ; les trois font 1. */
  share: number
}

export interface DiscountScale {
  /** Décote au bout de l'échelle dessinée, en fraction. */
  max: number
  segments: DiscountScaleSegment[]
}

/**
 * L'échelle de la « Marge de négociation » : de 0 au seuil négociable, puis
 * jusqu'au seuil tendu, puis hors de portée. La plage « hors de portée » est
 * dessinée aussi large que la plus grande des deux autres, et d'au moins
 * 5 points, pour rester visible. Null si un seuil manque, est négatif ou si
 * le seuil tendu est sous le seuil négociable (la saisie est alors refusée).
 */
export function discountScale(
  negotiable: number | null,
  tight: number | null
): DiscountScale | null {
  if (!usable(negotiable) || !usable(tight)) return null
  if (negotiable < 0 || tight < negotiable) return null
  const outOfReach = Math.max(negotiable, tight - negotiable, 0.05)
  const max = tight + outOfReach
  return {
    max,
    segments: [
      { kind: 'negotiable', from: 0, to: negotiable, share: negotiable / max },
      {
        kind: 'tight',
        from: negotiable,
        to: tight,
        share: (tight - negotiable) / max,
      },
      { kind: 'out_of_reach', from: tight, to: null, share: outOfReach / max },
    ],
  }
}
