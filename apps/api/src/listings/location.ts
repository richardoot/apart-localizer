import type {
  FieldProvenanceMap,
  ListingLocationInput,
  ListingPlacement,
  Point,
} from '@apart/contracts'
import { isAddressPrecision, manualPlacement } from '@apart/domain'
import type { ListingAreaRef } from '../geo/geo.service'
import type { LocatedAddress } from '../opendata/geocoding.service'

/** Les clés de provenance que le géocodage renseigne (source `open_data`). */
export const GEOCODED_KEYS = [
  'point',
  'precision',
  'addressNormalized',
  'banId',
  'inseeCode',
] as const

/**
 * Applique une adresse localisée à la localisation d'une annonce : point,
 * précision, adresse normalisée, identifiant BAN, code INSEE, et la commune
 * si elle manquait. Rend la localisation complétée et les clés touchées,
 * pour que la provenance les marque `open_data`.
 */
export function applyLocated(
  location: ListingLocationInput,
  located: LocatedAddress
): {
  location: ListingLocationInput
  keys: string[]
  placement: ListingPlacement
  area: ListingAreaRef | null
} {
  const keys: string[] = [...GEOCODED_KEYS]
  const next: ListingLocationInput = {
    ...location,
    point: located.point,
    precision: located.precision,
    addressNormalized: located.addressNormalized,
    banId: located.banId,
    inseeCode: located.inseeCode,
  }
  if (!location.commune && located.commune) {
    next.commune = located.commune
    keys.push('commune')
  }
  return {
    location: next,
    keys,
    placement: located.placement,
    area: located.area,
  }
}

const samePoint = (a: Point | null | undefined, b: Point | null): boolean =>
  !!a &&
  !!b &&
  Math.abs(a.coordinates[0] - b.coordinates[0]) < 1e-7 &&
  Math.abs(a.coordinates[1] - b.coordinates[1]) < 1e-7

/** Le placement d'un point saisi (carte, formulaire, MCP) : il prime sur le géocodage. */
export function manualLocationPlacement(
  location: Pick<ListingLocationInput, 'point' | 'precision'>,
  now: Date = new Date()
): ListingPlacement | null {
  return location.point
    ? manualPlacement(location.precision, now.toISOString())
    : null
}

/**
 * Faut-il replacer le repère après une modification de la localisation
 * (lot 12) ? `relocate` si l'adresse ou la commune change, ou si le quartier
 * change alors que le repère n'est pas à l'adresse (numéro ou rue) ; le point
 * renvoyé tel quel par le formulaire (inchangé) ne compte pas comme une
 * saisie. S'il avait été saisi (carte, formulaire, Claude), `if_address` :
 * une adresse ou une commune changées le replacent seulement si le géocodeur
 * les trouve à l'adresse (`addressOverridesManualPoint`) ; un quartier changé
 * ne le touche pas. `none` sans changement, ou pour un point nouveau saisi,
 * qui prime toujours.
 */
export type RelocationNeed = 'none' | 'relocate' | 'if_address'

export function relocationNeeded(
  before: {
    location: ListingLocationInput & { placement?: ListingPlacement | null }
    fieldSources: FieldProvenanceMap
  },
  patch: Partial<ListingLocationInput>
): RelocationNeed {
  const changed = (key: 'addressRaw' | 'commune' | 'district'): boolean =>
    patch[key] !== undefined &&
    (patch[key] ?? '').trim().toLowerCase() !==
      (before.location[key] ?? '').trim().toLowerCase()
  const address = changed('addressRaw') || changed('commune')
  const district =
    changed('district') && !isAddressPrecision(before.location.precision)
  if (!address && !district) return 'none'
  if (!patch.point) return 'relocate'
  if (!samePoint(patch.point, before.location.point)) return 'none'
  // Le point renvoyé est l'ancien : replacé, sauf s'il avait été saisi.
  const manual =
    before.location.placement?.method === 'manual' ||
    (!before.location.placement &&
      before.fieldSources.point !== undefined &&
      before.fieldSources.point.source !== 'open_data')
  if (!manual) return 'relocate'
  return address ? 'if_address' : 'none'
}

/**
 * Le code INSEE à donner au géocodeur : celui du patch, sinon celui de la
 * fiche tant que la commune ne change pas (l'ancien orienterait la recherche
 * du quartier vers l'ancienne commune).
 */
export function inseeCodeForLocate(
  before: Pick<ListingLocationInput, 'commune' | 'inseeCode'>,
  patch: Partial<ListingLocationInput>
): string | null {
  if (patch.inseeCode) return patch.inseeCode
  const communeChanged =
    patch.commune !== undefined &&
    (patch.commune ?? '').trim().toLowerCase() !==
      (before.commune ?? '').trim().toLowerCase()
  return communeChanged ? null : (before.inseeCode ?? null)
}

/** Marque les clés géocodées comme données ouvertes dans la carte de provenance. */
export function withOpenDataProvenance(
  fieldSources: FieldProvenanceMap,
  keys: readonly string[],
  now: Date = new Date()
): FieldProvenanceMap {
  const recordedAt = now.toISOString()
  const result = { ...fieldSources }
  for (const key of keys) result[key] = { source: 'open_data', recordedAt }
  return result
}

/** Vrai si une localisation donne de quoi géocoder sans point déjà connu. */
export function needsGeocoding(
  location: Pick<ListingLocationInput, 'point' | 'addressRaw' | 'commune'>
): boolean {
  return (
    location.point === null &&
    (Boolean(location.addressRaw?.trim()) || Boolean(location.commune?.trim()))
  )
}
