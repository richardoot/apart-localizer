import { MANUAL_POINT_ADDRESS_TOLERANCE_METERS } from '@apart/contracts'
import type {
  ListingLocationInput,
  LocationPrecision,
  Point,
} from '@apart/contracts'
import { isAddressPrecision } from './placement.js'
import { isWithinRadius } from './workflow.js'

/**
 * Un point saisi prime sur le géocodage (lot 12) : le repère ne bouge pas.
 * L'adresse de l'annonce est pourtant géocodée pour ce que seul le géocodeur
 * rend (ADR 0040) : le code INSEE de la commune, et l'identifiant BAN et
 * l'adresse normalisée quand l'adresse trouvée est au numéro ou à la rue et
 * près du point saisi. Loin du point, ces deux valeurs restent vides : elles
 * décriraient un autre endroit que le repère. Pur.
 */

/** Ce que le géocodeur a rendu pour l'adresse de l'annonce. */
export interface GeocodedAddressFacts {
  point: Point
  precision: LocationPrecision
  addressNormalized: string | null
  banId: string | null
  commune: string | null
  inseeCode: string | null
}

export type ManualPointAddressFields = Pick<
  ListingLocationInput,
  'addressNormalized' | 'banId' | 'inseeCode' | 'commune'
>

/**
 * Les champs à écrire à côté d'un point saisi, et leurs clés (provenance
 * `open_data`). La commune n'est complétée que si elle manquait. Sans
 * réponse du géocodeur : tout vide, aucune clé.
 */
export function addressFieldsForManualPoint(
  location: Pick<ListingLocationInput, 'point' | 'commune'>,
  located: GeocodedAddressFacts | null,
  toleranceMeters: number = MANUAL_POINT_ADDRESS_TOLERANCE_METERS
): { fields: ManualPointAddressFields; keys: string[] } {
  const fields: ManualPointAddressFields = {
    addressNormalized: null,
    banId: null,
    inseeCode: null,
    commune: location.commune,
  }
  if (!located || !location.point) return { fields, keys: [] }
  const keys: string[] = []
  if (located.inseeCode) {
    fields.inseeCode = located.inseeCode
    keys.push('inseeCode')
  }
  if (!location.commune && located.commune) {
    fields.commune = located.commune
    keys.push('commune')
  }
  const [longitude, latitude] = located.point.coordinates
  const near =
    isAddressPrecision(located.precision) &&
    isWithinRadius(location.point, {
      longitude,
      latitude,
      radiusMeters: toleranceMeters,
    })
  if (near) {
    fields.addressNormalized = located.addressNormalized
    fields.banId = located.banId
    if (located.addressNormalized) keys.push('addressNormalized')
    if (located.banId) keys.push('banId')
  }
  return { fields, keys }
}

/**
 * Une adresse ou une commune changées l'emportent-elles sur le point saisi
 * que le formulaire renvoie tel quel (lot 12, correctif) ? Oui quand le
 * géocodeur trouve la nouvelle adresse au numéro ou à la rue : le repère suit
 * l'adresse, et avec lui la desserte, le quartier, les équipements, le marché,
 * l'encadrement et les critères. Sauf si le point saisi, lui-même à l'adresse,
 * est à moins de la tolérance : il précise l'adresse (entrée, bâtiment), il
 * reste. Trouvée seulement au quartier ou à la commune, l'adresse ne déplace
 * pas un point saisi. Pur.
 */
export function addressOverridesManualPoint(
  current: { point: Point | null; precision: LocationPrecision | null },
  located: { point: Point; precision: LocationPrecision },
  toleranceMeters: number = MANUAL_POINT_ADDRESS_TOLERANCE_METERS
): boolean {
  if (!isAddressPrecision(located.precision)) return false
  if (!current.point || !isAddressPrecision(current.precision)) return true
  const [longitude, latitude] = located.point.coordinates
  return !isWithinRadius(current.point, {
    longitude,
    latitude,
    radiusMeters: toleranceMeters,
  })
}
