import type {
  DpeClass,
  FeesPayer,
  ListingFinancials,
  RentControl,
} from '@apart/contracts'
import { renovationTotal } from './renovation.js'
import type { RenovationLike } from './renovation.js'
import { isRentControlled } from './rent-control.js'

/** Les champs d'une annonce que le calcul lit, quelle qu'en soit la source (API, formulaire, import). */
export interface ListingLike {
  price: number
  feesAmount?: number | null
  feesPercent?: number | null
  feesPayer?: FeesPayer | null
  surface?: number | null
  furnitureValue?: number | null
  propertyTax?: number | null
  annualCharges?: number | null
  nonRecoverableChargesMonthly?: number | null
  dpeClass?: DpeClass | null
  location?: { commune?: string | null } | null
  renovation?: RenovationLike | null
  rentalPlan?: {
    targetRent?: number | null
    rentControl?: RentControl
    referenceRentPerM2?: number | null
  } | null
}

/** Honoraires à charge acquéreur, en euros : montant, sinon pourcentage, sinon 0. */
export function buyerFees(listing: ListingLike): number {
  if (listing.feesPayer !== 'buyer') return 0
  if (listing.feesAmount != null) return listing.feesAmount
  if (listing.feesPercent != null) return listing.price * listing.feesPercent
  return 0
}

/**
 * Dérive l'entrée financière de `compute` d'une annonce complète. C'est le
 * seul endroit où l'on décide quel champ nourrit quelle grandeur.
 */
export function financialsFromListing(
  listing: ListingLike,
  controlledCommunes?: readonly string[]
): ListingFinancials {
  return {
    price: listing.price,
    buyerFees: buyerFees(listing),
    surface: listing.surface ?? 0,
    targetRent: listing.rentalPlan?.targetRent ?? 0,
    rentControlled: isRentControlled(
      listing.location?.commune,
      listing.rentalPlan?.rentControl ?? 'auto',
      controlledCommunes
    ),
    referenceRentPerM2: listing.rentalPlan?.referenceRentPerM2 ?? null,
    furnitureValue: listing.furnitureValue ?? 0,
    renovationTotal: renovationTotal(listing.renovation),
    propertyTax: listing.propertyTax ?? null,
    annualCharges: listing.annualCharges ?? null,
    nonRecoverableChargesMonthly: listing.nonRecoverableChargesMonthly ?? null,
    dpeClass: listing.dpeClass ?? null,
  }
}
