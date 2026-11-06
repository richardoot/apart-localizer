import type {
  Assumptions,
  DpeClass,
  LeaseType,
  ListingFinancials,
  RentalDemand,
  TriState,
} from '@apart/contracts'
import { yearOf } from './dates.js'
import { financialsFromListing } from './listing-financials.js'
import type { ListingLike } from './listing-financials.js'
import { isoDay } from './rent-reference.js'
import type { RentalChecksInput } from './rental-checks.js'

/**
 * L'entrée des études du lot 5 (coût d'occupation, projection, scénarios) :
 * l'entrée financière de `compute`, celle des contrôles de louabilité et le
 * type de bail visé. Dérivée d'une annonce et des hypothèses de l'espace par
 * `studyInputFromListing`, la même fonction pour l'API, le MCP et l'aperçu du
 * navigateur. Depuis le lot 19, l'année et le type de location viennent des
 * hypothèses de l'espace, jamais de l'annonce ; un scénario peut les changer.
 */
export interface StudyInput {
  financials: ListingFinancials
  rental: RentalChecksInput
  leaseType: LeaseType
}

/** Ce que l'étude lit d'une annonce, en plus des champs financiers. */
export type StudyListingLike = ListingLike & {
  dpeClass?: DpeClass | null
  rentalPlan?:
    | (NonNullable<ListingLike['rentalPlan']> & {
        marketRent?: number | null
        demand?: RentalDemand | null
        coOwnershipAllowsRental?: TriState | null
        decencyCompliant?: TriState | null
        rentalPermitRequired?: TriState | null
      })
    | null
}

/**
 * L'entrée des contrôles de louabilité d'une annonce (phase 2). L'année reste
 * nulle : elle se lit dans les hypothèses de l'espace (date de mise en
 * location, sinon `rentalYear`) ; seul un scénario la fixe.
 */
export function rentalChecksInputFromListing(
  listing: StudyListingLike
): RentalChecksInput {
  const plan = listing.rentalPlan
  return {
    dpeClass: listing.dpeClass ?? null,
    year: null,
    marketRent: plan?.marketRent ?? null,
    demand: plan?.demand ?? null,
    coOwnershipAllowsRental: plan?.coOwnershipAllowsRental ?? 'unknown',
    decencyCompliant: plan?.decencyCompliant ?? 'unknown',
    rentalPermitRequired: plan?.rentalPermitRequired ?? 'unknown',
  }
}

export function studyInputFromListing(
  listing: StudyListingLike,
  assumptions: { leaseType?: LeaseType | null },
  at?: Date
): StudyInput {
  return {
    financials: financialsFromListing(listing, undefined, at),
    rental: rentalChecksInputFromListing(listing),
    leaseType: assumptions.leaseType ?? 'unfurnished',
  }
}

/**
 * La date de mise en location (bascule en phase 2). Une année fixée par un
 * scénario l'emporte ; la date précise des hypothèses s'applique si elle
 * tombe la même année (ou si rien n'en fixe) ; à défaut, le 1er janvier de
 * l'année retenue (`rentalYear` des hypothèses de l'espace).
 */
export function rentalStartDate(
  listingYear: number | null,
  a: Pick<Assumptions, 'rentalStartDate' | 'rentalYear'>
): string {
  // Des hypothèses lues sans le schéma (jeux golden) n'ont pas le champ.
  const precise = a.rentalStartDate ?? null
  if (listingYear !== null) {
    return precise !== null && yearOf(precise) === listingYear
      ? precise
      : `${listingYear}-01-01`
  }
  return precise ?? `${a.rentalYear}-01-01`
}

/** L'année de mise en location retenue par les contrôles et les études. */
export function rentalStartYear(
  listingYear: number | null,
  a: Pick<Assumptions, 'rentalStartDate' | 'rentalYear'>
): number {
  return yearOf(rentalStartDate(listingYear, a))
}

/** La date d'acquisition : celle des hypothèses, sinon le jour du calcul. */
export function purchaseDate(
  a: Pick<Assumptions, 'purchaseDate'>,
  at: Date
): string {
  return a.purchaseDate ?? isoDay(at)
}
