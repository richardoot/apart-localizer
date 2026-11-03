import type {
  Assumptions,
  Listing,
  ListingEvaluation,
  ListingFinancials,
} from '@apart/contracts'
import {
  compute,
  financialsFromListing,
  rentalChecks,
  targetPrice,
} from '@apart/domain'

/**
 * Colle entre l'annonce enregistrée et le paquet `domain` : aucune formule
 * ici, seulement l'appel des fonctions pures dans l'ordre. L'interface et
 * le MCP font exactement le même appel.
 */
export function evaluateListing(
  listing: Listing,
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
