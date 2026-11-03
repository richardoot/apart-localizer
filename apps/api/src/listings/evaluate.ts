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
 * exactement le même appel.
 */
export function evaluateListing(
  listing: EvaluableListing,
  assumptions: Assumptions
): ListingEvaluation {
  const financials: ListingFinancials = financialsFromListing(listing)
  const metrics = compute(financials, assumptions)
  const rental = rentalChecks(
    {
      dpeClass: listing.dpeClass,
      year: listing.rentalPlan?.year ?? null,
      marketRent: listing.rentalPlan?.marketRent ?? null,
      demand: listing.rentalPlan?.demand ?? null,
      coOwnershipAllowsRental:
        listing.rentalPlan?.coOwnershipAllowsRental ?? 'unknown',
      decencyCompliant: listing.rentalPlan?.decencyCompliant ?? 'unknown',
      rentalPermitRequired:
        listing.rentalPlan?.rentalPermitRequired ?? 'unknown',
    },
    metrics,
    assumptions
  )
  return {
    metrics,
    rental,
    targetPrice: targetPrice(financials, assumptions),
  }
}
