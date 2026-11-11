import { LISTING_FIELD_LABELS } from '@apart/contracts'
import type {
  FieldProvenanceMap,
  FieldSource,
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
 *
 * Deux montants que le serveur estime quand ils manquent (taxe foncière : un
 * mois de loyer ; charges non récupérables : 25 % des charges) ne sont gardés
 * que s'ils sont lus avec leur extrait ou dictés par le membre : une
 * estimation faite dans la conversation passerait pour une valeur réelle.
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

/** Montants que le serveur estime quand ils manquent (`compute`), dits « estimés ». */
export const CONNECTOR_ESTIMATED_KEYS = [
  'propertyTax',
  'nonRecoverableChargesMonthly',
] as const satisfies readonly (keyof ListingInput)[]
export type ConnectorEstimatedKey = (typeof CONNECTOR_ESTIMATED_KEYS)[number]

/**
 * Les montants estimables envoyés sans appui : valeur renseignée, provenance
 * effective `ai` (celle de `fieldSources`, sinon celle de l'appel) et aucun
 * extrait. Une valeur dictée (`user`) ou lue avec son extrait est gardée.
 */
export function unsupportedEstimates(
  values: { [K in ConnectorEstimatedKey]?: number | null | undefined },
  fieldSources: FieldProvenanceMap | null | undefined,
  provenance: FieldSource
): ConnectorEstimatedKey[] {
  return CONNECTOR_ESTIMATED_KEYS.filter(key => {
    if (values[key] == null) return false
    const source = fieldSources?.[key]
    if ((source?.source ?? provenance) !== 'ai') return false
    return !source?.evidence?.trim()
  })
}

/** La phrase qui dit, au connecteur, les montants non gardés et pourquoi. */
export function describeUnsupportedEstimates(
  keys: readonly ConnectorEstimatedKey[]
): string | null {
  if (keys.length === 0) return null
  const labels = keys.map(key => LISTING_FIELD_LABELS[key] ?? key).join(', ')
  return `Non gardé${keys.length > 1 ? 's' : ''} : ${labels}. Une valeur lue dans l’annonce porte son extrait (fieldSources.<champ>.evidence) ; une valeur dictée par le membre a la provenance « user ». Sans valeur, l’application l’estime et le dit ; ne l’estime pas toi-même.`
}

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
 * création les remplit. Les montants estimables sans appui sont vides.
 */
export function connectorListingCreate(
  input: ListingInput,
  provenance: FieldSource = 'ai'
): ListingInput {
  const fieldSources: FieldProvenanceMap = { ...input.fieldSources }
  const location: ListingLocationInput = { ...input.location }
  const estimates: Partial<Pick<ListingInput, ConnectorEstimatedKey>> = {}
  for (const key of unsupportedEstimates(
    input,
    input.fieldSources,
    provenance
  )) {
    estimates[key] = null
    delete fieldSources[key]
  }
  for (const key of CONNECTOR_IGNORED_LOCATION_KEYS) {
    if (geocodedByServer(input.fieldSources, key)) continue
    location[key] = null
    delete fieldSources[key]
  }
  delete fieldSources[REFERENCE_RENT_KEY]
  return {
    ...input,
    ...estimates,
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
 * marché et les sorties du géocodeur de la fiche, avec leur provenance ; un
 * montant estimable sans appui n'est pas modifié. Rend le patch, les clés de
 * provenance à reprendre de la fiche (`keptKeys`) et les montants écartés.
 */
export function connectorListingUpdate(
  patch: ListingUpdate,
  current: ConnectorUpdateCurrent,
  provenance: FieldSource = 'ai'
): {
  patch: ListingUpdate
  keptKeys: string[]
  ignoredEstimates: ConnectorEstimatedKey[]
} {
  const next: ListingUpdate = { ...patch }
  const keptKeys: string[] = []
  const ignoredEstimates = unsupportedEstimates(
    patch,
    patch.fieldSources,
    provenance
  )
  for (const key of ignoredEstimates) delete next[key]
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
    for (const key of [...IGNORED_PROVENANCE_KEYS, ...ignoredEstimates]) {
      delete fieldSources[key]
    }
    next.fieldSources = fieldSources
  }
  return { patch: next, keptKeys, ignoredEstimates }
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
