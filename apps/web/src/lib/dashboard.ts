import type { EvaluatedListing } from '@apart/contracts'
import type { SummaryListing } from '@apart/domain'

/** Ce que la synthèse de `@apart/domain` lit d'une annonce vue. */
export function toSummaryListing(item: EvaluatedListing): SummaryListing {
  return {
    id: item.listing.id,
    title: item.listing.title,
    status: item.listing.status,
    verdict: item.evaluation.metrics.verdict,
    rentalVerdict: item.evaluation.rental.verdict,
    grossYield: item.evaluation.metrics.grossYield,
    effort: item.evaluation.metrics.effort,
    pricePerM2: item.evaluation.metrics.pricePerM2,
    score: item.evaluation.metrics.score,
    isNewForMe: item.isNewForMe,
    createdAt: item.listing.createdAt,
    tasks: item.tasks.map(task => ({
      done: task.done,
      createdAt: task.createdAt,
    })),
  }
}
