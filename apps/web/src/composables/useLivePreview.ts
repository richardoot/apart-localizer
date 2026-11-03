import { computed } from 'vue'
import type { Ref } from 'vue'
import type {
  Assumptions,
  ListingEvaluation,
  ListingFinancials,
  NegotiationBrief,
} from '@apart/contracts'
import {
  compute,
  financialsFromListing,
  mergeAssumptions,
  negotiationBrief,
  rentalChecks,
  targetPrice,
} from '@apart/domain'
import { PreviewInputSchema, formToRawInput } from '@/lib/listing-form'
import type { ListingForm } from '@/lib/listing-form'

export interface LivePreview {
  evaluation: ListingEvaluation | null
  assumptions: Assumptions | null
  financials: ListingFinancials | null
  /** Le brief de négociation du formulaire, sans historique (prix cibles, offre suggérée). */
  negotiation: NegotiationBrief | null
}

/**
 * L'aperçu en direct du formulaire : à chaque frappe, le formulaire devient
 * une annonce hypothétique et passe par `@apart/domain`, exactement comme
 * l'API le fera à l'enregistrement. Rien n'est appelé sur le réseau.
 */
export function previewFromForm(
  form: ListingForm,
  base: Assumptions | null | undefined
): LivePreview {
  if (!base) {
    return {
      evaluation: null,
      assumptions: null,
      financials: null,
      negotiation: null,
    }
  }
  const parsed = PreviewInputSchema.safeParse(formToRawInput(form))
  if (!parsed.success) {
    return {
      evaluation: null,
      assumptions: base,
      financials: null,
      negotiation: null,
    }
  }
  const listing = parsed.data
  const assumptions = mergeAssumptions(base, listing.assumptionsOverride)
  const financials = financialsFromListing(listing)
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
  const target = targetPrice(financials, assumptions)
  return {
    evaluation: { metrics, rental, targetPrice: target },
    assumptions,
    financials,
    negotiation: negotiationBrief(
      {
        price: financials.price,
        publishedAt: null,
        createdAt: null,
        dpeClass: financials.dpeClass,
        renovationTotal: metrics.renovationTotal,
        annualCharges: financials.annualCharges,
        surface: financials.surface > 0 ? financials.surface : null,
        priceEvents: [],
        offers: [],
      },
      target,
      assumptions
    ),
  }
}

export function useLivePreview(
  form: Ref<ListingForm>,
  assumptions: Ref<Assumptions | null | undefined>
) {
  return computed(() => previewFromForm(form.value, assumptions.value))
}
