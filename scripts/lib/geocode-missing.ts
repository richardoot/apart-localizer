import type { GeocodeResult } from './geocode.js'
import { addressQuery } from '../../apps/api/src/opendata/geoplateforme.js'

/**
 * Le choix du script `geocode-missing` : quelles annonces géocoder, et faut-il
 * appliquer le résultat. Pur.
 */

export interface MissingCandidate {
  id: string
  title: string
  addressRaw: string | null
  commune: string | null
  precision: 'exact' | 'street' | 'district' | 'commune' | null
  hasPoint: boolean
}

const RANK = { exact: 3, street: 2, district: 1, commune: 0 } as const

/** Une annonce sans point (adresse ou commune connue), ou au centroïde de sa commune alors qu'une adresse est saisie. */
export function needsGeocode(c: MissingCandidate): boolean {
  const address = Boolean(c.addressRaw?.trim())
  if (!c.hasPoint) return address || Boolean(c.commune?.trim())
  return c.precision === 'commune' && address
}

/** La requête : l'adresse (et sa commune), sinon la commune seule. */
export function queryFor(c: MissingCandidate): {
  query: string
  kind: 'address' | 'municipality'
} | null {
  const address = addressQuery(c.addressRaw, c.commune)
  if (address) return { query: address, kind: 'address' }
  const commune = c.commune?.trim()
  return commune ? { query: commune, kind: 'municipality' } : null
}

/** Le résultat améliore-t-il la localisation (pas de point, ou précision plus fine) ? */
export function improves(
  c: MissingCandidate,
  result: GeocodeResult | null
): boolean {
  if (!result) return false
  if (!c.hasPoint) return true
  const before = c.precision ? RANK[c.precision] : -1
  return RANK[result.precision] > before
}
