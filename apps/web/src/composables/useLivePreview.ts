import { computed } from 'vue'
import type { Ref } from 'vue'
import type {
  Assumptions,
  ListingEvaluation,
  ListingFinancials,
} from '@apart/contracts'
import {
  compute,
  financialsFromListing,
  mergeAssumptions,
  rentalChecks,
  targetPrice,
} from '@apart/domain'
import { PreviewInputSchema, formToRawInput } from '@/lib/listing-form'
import type { ListingForm } from '@/lib/listing-form'

export interface LivePreview {
  evaluation: ListingEvaluation | null
  assumptions: Assumptions | null
  financials: ListingFinancials | null
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
  if (!base) return { evaluation: null, assumptions: null, financials: null }
  const parsed = PreviewInputSchema.safeParse(formToRawInput(form))
  if (!parsed.success) {
    return { evaluation: null, assumptions: base, financials: null }
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
  return {
    evaluation: {
      metrics,
      rental,
      targetPrice: targetPrice(financials, assumptions),
    },
    assumptions,
    financials,
  }
}

export function useLivePreview(
  form: Ref<ListingForm>,
  assumptions: Ref<Assumptions | null | undefined>
) {
  return computed(() => previewFromForm(form.value, assumptions.value))
}
