import type {
  Assumptions,
  AssumptionsImpact,
  AssumptionsOverride,
  Verdict,
} from '@apart/contracts'
import { mergeAssumptions } from '@apart/domain'
import { evaluateListing } from '../listings/evaluate'
import type { EvaluableListing } from '../listings/evaluate'

/** Ce que l'impact lit d'une annonce : ses champs financiers et sa surcharge d'hypothèses. */
export type ImpactListing = EvaluableListing & {
  id: string
  title: string
  assumptionsOverride: AssumptionsOverride | null
}

const emptyCounts = (): Record<Verdict, number> => ({
  target: 0,
  to_dig: 0,
  off_target: 0,
})

/**
 * Impact d'un changement d'hypothèses sur des annonces : verdict et prix
 * cible avant et après, pour chacune, avec la surcharge propre à l'annonce
 * conservée. Pur : utilisé par `PUT /assumptions`, son aperçu et
 * `set_assumptions`.
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
    const previous = evaluateListing(
      listing,
      mergeAssumptions(before, listing.assumptionsOverride)
    )
    const next = evaluateListing(
      listing,
      mergeAssumptions(after, listing.assumptionsOverride)
    )
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
