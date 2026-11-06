import type { Assumptions, AssumptionsImpact, Verdict } from '@apart/contracts'
import { evaluateListing } from '../listings/evaluate'
import type { EvaluableListing } from '../listings/evaluate'

/** Ce que l'impact lit d'une annonce : ses champs financiers. */
export type ImpactListing = EvaluableListing & {
  id: string
  title: string
}

const emptyCounts = (): Record<Verdict, number> => ({
  target: 0,
  to_dig: 0,
  off_target: 0,
})

/**
 * Impact d'un changement d'hypothèses sur des annonces : verdict et prix
 * cible avant et après, pour chacune (toutes calculées avec les hypothèses de
 * l'espace depuis le lot 19). Pur : utilisé par `PUT /assumptions`, son
 * aperçu et `set_assumptions`.
 */
export function assumptionsImpact(
  listings: readonly ImpactListing[],
  before: Assumptions,
  after: Assumptions
): AssumptionsImpact {
  const byVerdictBefore = emptyCounts()
  const byVerdictAfter = emptyCounts()
  const changes: AssumptionsImpact['changes'] = []
  for (const listing of listings) {
    const previous = evaluateListing(listing, before)
    const next = evaluateListing(listing, after)
    byVerdictBefore[previous.metrics.verdict] += 1
    byVerdictAfter[next.metrics.verdict] += 1
    if (previous.metrics.verdict !== next.metrics.verdict) {
      changes.push({
        listingId: listing.id,
        title: listing.title,
        before: previous.metrics.verdict,
        after: next.metrics.verdict,
        targetPriceBefore: previous.targetPrice.targetPrice,
        targetPriceAfter: next.targetPrice.targetPrice,
      })
    }
  }
  return {
    total: listings.length,
    changedVerdicts: changes.length,
    changes,
    byVerdictBefore,
    byVerdictAfter,
  }
}
