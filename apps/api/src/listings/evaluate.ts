import type {
  Assumptions,
  DpeClass,
  ListingEvaluation,
  ListingFinancials,
  RentalPlanInput,
} from '@apart/contracts'
import {
  compute,
  financialsFromListing,
  rentalChecks,
  rentalChecksInputFromListing,
  targetPrice,
} from '@apart/domain'
import type { ListingLike } from '@apart/domain'

/**
 * Ce qu'une évaluation lit : les champs financiers d'une annonce (enregistrée
 * ou hypothétique), sa classe DPE et sa phase 2. Une `Listing` complète comme
 * une `HypotheticalListing` conviennent.
 */
export type EvaluableListing = ListingLike & {
  dpeClass: DpeClass | null
  rentalPlan: RentalPlanInput | null
}

/**
 * Colle entre l'annonce et le paquet `domain` : aucune formule ici, seulement
 * l'appel des fonctions pures dans l'ordre. L'interface et le MCP font
 * exactement le même appel. Les hypothèses sont celles de l'espace, sans
 * surcharge par annonce ; l'année de mise en location en vient (lot 19).
 */
export function evaluateListing(
  listing: EvaluableListing,
  assumptions: Assumptions,
  /** La date de l'évaluation : un plafond posé d'office expire avec son arrêté. */
  at: Date = new Date()
): ListingEvaluation {
  const financials: ListingFinancials = financialsFromListing(
    listing,
    undefined,
    at
  )
  const metrics = compute(financials, assumptions)
  const rental = rentalChecks(
    rentalChecksInputFromListing(listing),
    metrics,
    assumptions
  )
  return {
    metrics,
    rental,
    targetPrice: targetPrice(financials, assumptions),
  }
}
