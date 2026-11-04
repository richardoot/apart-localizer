import type { Assumptions, DpeClass, Verdict } from '@apart/contracts'

export interface VerdictInput {
  /** Rendement brut (fraction) ; NaN si le coût est nul. */
  grossYield: number
  /** Effort mensuel : négatif = à sortir chaque mois. */
  effort: number
  dpeClass: DpeClass | null
}

export type VerdictFailure = 'gross_yield' | 'effort' | 'dpe'
export type VerdictNearMiss = 'gross_yield' | 'effort' | 'dpe_unknown'

export interface VerdictResult {
  verdict: Verdict
  failures: VerdictFailure[]
  nearMisses: VerdictNearMiss[]
}

/**
 * Tolérance d'arrondi des seuils (lot 9) : un rendement à 10⁻⁹ près du seuil,
 * un effort à un millionième d'euro près du maximum comptent comme atteints.
 * Au prix cible, le critère liant est exactement à son seuil ; sans cette
 * tolérance, l'erreur d'arrondi des flottants (0,05499999999999999) le
 * ferait passer « de peu ».
 */
export const VERDICT_TOLERANCE = { yield: 1e-9, effort: 1e-6 } as const

/** Classes DPE qui mettent le bien hors cible (calendrier d'interdiction). */
export const FAILING_DPE_CLASSES: readonly DpeClass[] = ['E', 'F', 'G']

/**
 * Verdict financier de l'artefact :
 * - brut sous le seuil moins la marge → échec ; dans la marge → « de peu » ;
 * - effort au-delà du maximum plus la marge → échec ; dans la marge → « de peu » ;
 * - DPE E, F ou G → échec ; DPE inconnu → « de peu ».
 * Hors cible dès un échec, à creuser dès un « de peu », sinon cible. Les
 * seuils s'apprécient à l'arrondi près (`VERDICT_TOLERANCE`).
 */
export function verdict(input: VerdictInput, a: Assumptions): VerdictResult {
  const failures: VerdictFailure[] = []
  const nearMisses: VerdictNearMiss[] = []
  const tol = VERDICT_TOLERANCE

  if (!(input.grossYield >= a.grossYieldThreshold - tol.yield)) {
    if (input.grossYield >= a.grossYieldThreshold - a.grossYieldMargin) {
      nearMisses.push('gross_yield')
    } else {
      failures.push('gross_yield')
    }
  }
  if (!(-input.effort <= a.maxMonthlyEffort + tol.effort)) {
    if (-input.effort <= a.maxMonthlyEffort + a.effortMargin) {
      nearMisses.push('effort')
    } else {
      failures.push('effort')
    }
  }
  if (input.dpeClass !== null && FAILING_DPE_CLASSES.includes(input.dpeClass)) {
    failures.push('dpe')
  }
  if (input.dpeClass === null) nearMisses.push('dpe_unknown')

  return {
    verdict:
      failures.length > 0
        ? 'off_target'
        : nearMisses.length > 0
          ? 'to_dig'
          : 'target',
    failures,
    nearMisses,
  }
}

/** Score de tri : 2000 cible, 1000 à creuser, 0 hors cible, plus brut × 1000. */
export function score(decision: Verdict, grossYield: number): number {
  const base = decision === 'target' ? 2000 : decision === 'to_dig' ? 1000 : 0
  return base + grossYield * 1000
}
