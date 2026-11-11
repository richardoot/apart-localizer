import type {
  FieldProvenanceMap,
  ListingInput,
  ListingLocationInput,
  ListingUpdate,
  RentalPlanInput,
} from '@apart/contracts'
import { REFERENCE_RENT_KEY } from './rent-reference.js'

/**
 * Les champs de la fiche que le connecteur (MCP) n'écrit jamais (ADR 0040).
 * Ce sont des valeurs que le serveur pose (plafond de l'arrêté, sorties du
 * géocodeur) ou qu'un membre retient dans l'application (loyer de marché
 * tiré des comparables). Une entrée du connecteur qui les envoie est
 * acceptée, ces clés sont ignorées : vides à la création (le serveur les
 * remplit), celles de la fiche à la modification. Pur.
 */

/** Phase 2 : le plafond vient de l'arrêté, le loyer de marché des comparables retenus. */
export const CONNECTOR_IGNORED_RENTAL_KEYS = [
  'referenceRentPerM2',
  'marketRent',
] as const satisfies readonly (keyof RentalPlanInput)[]

/** Localisation : ce que seul le géocodeur rend. */
export const CONNECTOR_IGNORED_LOCATION_KEYS = [
  'addressNormalized',
  'banId',
  'inseeCode',
] as const satisfies readonly (keyof ListingLocationInput)[]

/** Les clés de provenance que la règle touche. */
const IGNORED_PROVENANCE_KEYS: readonly string[] = [
  REFERENCE_RENT_KEY,
  ...CONNECTOR_IGNORED_LOCATION_KEYS,
]

type RentalPlanLike = Pick<RentalPlanInput, 'referenceRentPerM2' | 'marketRent'>
type LocationLike = Pick<
  ListingLocationInput,
  'addressNormalized' | 'banId' | 'inseeCode'
>

function rentalKeysFrom(
  plan: RentalPlanLike | null | undefined
): RentalPlanLike {
  return {
    referenceRentPerM2: plan?.referenceRentPerM2 ?? null,
    marketRent: plan?.marketRent ?? null,
  }
}

function locationKeysFrom(
  location: LocationLike | null | undefined
): LocationLike {
  return {
    addressNormalized: location?.addressNormalized ?? null,
    banId: location?.banId ?? null,
    inseeCode: location?.inseeCode ?? null,
  }
}

/**
 * Une fiche rendue par `extract_listing` garde ce que le géocodeur du serveur
 * a rendu : le point et la clé sont alors tous deux de provenance
 * `open_data`. Toute autre valeur vient de la conversation.
 */
function geocodedByServer(
  fieldSources: FieldProvenanceMap,
  key: (typeof CONNECTOR_IGNORED_LOCATION_KEYS)[number]
): boolean {
  return (
    fieldSources.point?.source === 'open_data' &&
    fieldSources[key]?.source === 'open_data'
  )
}

/**
 * Création par le connecteur : plafond et loyer de marché vides (le plafond
 * est posé d'office par l'enrichissement), sorties du géocodeur vides sauf
 * celles qu'il a lui-même rendues (`extract_listing`) ; le géocodage de la
 * création les remplit.
 */
export function connectorListingCreate(input: ListingInput): ListingInput {
  const fieldSources: FieldProvenanceMap = { ...input.fieldSources }
  const location: ListingLocationInput = { ...input.location }
  for (const key of CONNECTOR_IGNORED_LOCATION_KEYS) {
    if (geocodedByServer(input.fieldSources, key)) continue
    location[key] = null
    delete fieldSources[key]
  }
  delete fieldSources[REFERENCE_RENT_KEY]
  return {
    ...input,
    location,
    fieldSources,
    rentalPlan: input.rentalPlan
      ? { ...input.rentalPlan, ...rentalKeysFrom(null) }
      : null,
  }
}

/** Ce que la modification lit de la fiche enregistrée. */
export interface ConnectorUpdateCurrent {
  location: LocationLike
  rentalPlan: RentalPlanLike | null
  fieldSources: FieldProvenanceMap
}

/**
 * Modification par le connecteur : un sous-objet fourni (phase 2,
 * localisation) remplace l'existant, mais garde le plafond, le loyer de
 * marché et les sorties du géocodeur de la fiche, avec leur provenance. Rend
 * le patch et les clés de provenance à reprendre de la fiche (`keptKeys`).
 */
export function connectorListingUpdate(
  patch: ListingUpdate,
  current: ConnectorUpdateCurrent
): { patch: ListingUpdate; keptKeys: string[] } {
  const next: ListingUpdate = { ...patch }
  const keptKeys: string[] = []
  if (patch.rentalPlan) {
    next.rentalPlan = {
      ...patch.rentalPlan,
      ...rentalKeysFrom(current.rentalPlan),
    }
    keptKeys.push(REFERENCE_RENT_KEY)
  }
  if (patch.location) {
    next.location = {
      ...patch.location,
      ...locationKeysFrom(current.location),
    }
    keptKeys.push(...CONNECTOR_IGNORED_LOCATION_KEYS)
  }
  if (patch.fieldSources) {
    const fieldSources = { ...patch.fieldSources }
    for (const key of IGNORED_PROVENANCE_KEYS) delete fieldSources[key]
    next.fieldSources = fieldSources
  }
  return { patch: next, keptKeys }
}

/**
 * Reprend, dans la provenance calculée après la modification, celle de la
 * fiche pour les clés gardées : une valeur que le connecteur n'a pas écrite
 * ne prend pas sa provenance.
 */
export function restoreKeptProvenance(
  fieldSources: FieldProvenanceMap,
  before: FieldProvenanceMap,
  keptKeys: readonly string[]
): FieldProvenanceMap {
  const result: FieldProvenanceMap = { ...fieldSources }
  for (const key of keptKeys) {
    const previous = before[key]
    if (previous) result[key] = previous
    else delete result[key]
  }
  return result
}
