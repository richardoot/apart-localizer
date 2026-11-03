import type { FieldProvenanceMap, ListingLocationInput } from '@apart/contracts'
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
): { location: ListingLocationInput; keys: string[] } {
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
  return { location: next, keys }
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
