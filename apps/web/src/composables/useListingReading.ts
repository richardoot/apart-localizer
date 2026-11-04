import { computed } from 'vue'
import type { Ref } from 'vue'
import type {
  Assumptions,
  ListingEvaluation,
  TargetPrice,
} from '@apart/contracts'
import {
  monthlyPaymentSplit,
  priceGauge,
  profitabilityChecks,
} from '@apart/domain'
import type {
  MonthlyPaymentSplit,
  PriceGauge,
  ProfitabilityCheck,
} from '@apart/domain'

/** Ce que la synthèse de la fiche affiche à côté des indicateurs (lot 9). */
export interface ListingReading {
  /** Rendement brut, effort, rendement net : seuil, retenu, atteint ou non. */
  checks: ProfitabilityCheck[]
  /** Les mêmes contrôles au prix cible ; null sans prix cible. */
  atTargetChecks: ProfitabilityCheck[] | null
  /** Mensualité séparée en crédit et assurance. */
  payment: MonthlyPaymentSplit
  /** Où tombent le prix cible et le prix affiché sur une échelle. */
  gauge: PriceGauge | null
}

/**
 * La lecture d'une évaluation, toute calculée par `@apart/domain` : la fiche
 * ne compare ni ne divise rien elle-même. Null tant que l'évaluation ou les
 * hypothèses manquent.
 */
export function readingOf(
  evaluation: ListingEvaluation | null,
  target: TargetPrice | null,
  assumptions: Assumptions | null
): ListingReading | null {
  if (!evaluation || !assumptions) return null
  const metrics = evaluation.metrics
  const atTarget = target?.atTarget ?? null
  return {
    checks: profitabilityChecks(metrics, assumptions),
    atTargetChecks: atTarget
      ? profitabilityChecks(atTarget, assumptions)
      : null,
    payment: monthlyPaymentSplit(metrics.loanAmount, assumptions),
    gauge: priceGauge(metrics.price, target?.targetPrice ?? null),
  }
}

export function useListingReading(
  evaluation: Ref<ListingEvaluation | null>,
  target: Ref<TargetPrice | null>,
  assumptions: Ref<Assumptions | null>
) {
  return computed(() =>
    readingOf(evaluation.value, target.value, assumptions.value)
  )
}
