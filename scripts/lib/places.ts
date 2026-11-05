import { OSM_PLACE_TYPES } from '@apart/contracts'
import type { OsmPlaceType } from '@apart/contracts'
import type { PlaceRow } from '../../apps/api/src/geo/geo.service.js'
import { osmId, overpassQuery } from './osm.js'
import type { OsmElement } from './osm.js'

/**
 * Lieux-dits OpenStreetMap (lot 12, ADR 0022) : `place=neighbourhood`,
 * `quarter` ou `suburb` nommés, dans les 28 communes de la métropole. Ils ne
 * servent qu'au placement d'une annonce dont le quartier cité n'est le nom
 * d'aucun contour importé (un lieu-dit d'une commune sans quartiers officiels). Les limites administratives
 * de niveau 10 sans `place` sont écartées : elles doublent les quartiers
 * officiels déjà importés. Pur : aucune base, aucun réseau.
 */

/** La requête Overpass (`pnpm import:places -- --print-query`). */
export const PLACES_QUERY = overpassQuery([
  `nwr["place"~"^(${OSM_PLACE_TYPES.join('|')})$"]["name"]`,
])

export interface PlaceStats {
  read: number
  kept: number
  byType: Record<OsmPlaceType, number>
  /** Objets sans `place` retenu (limites administratives, autres valeurs). */
  otherPlace: number
  withoutName: number
}

const isPlaceType = (value: string | undefined): value is OsmPlaceType =>
  (OSM_PLACE_TYPES as readonly string[]).includes(value ?? '')

/** Les lieux-dits à importer, un par objet nommé. */
export function buildPlaces(elements: readonly OsmElement[]): {
  rows: PlaceRow[]
  stats: PlaceStats
} {
  const stats: PlaceStats = {
    read: elements.length,
    kept: 0,
    byType: { neighbourhood: 0, quarter: 0, suburb: 0 },
    otherPlace: 0,
    withoutName: 0,
  }
  const rows: PlaceRow[] = []
  const seen = new Set<string>()
  for (const element of elements) {
    const place = element.tags.place
    if (!isPlaceType(place)) {
      stats.otherPlace++
      continue
    }
    const name = element.tags.name?.trim()
    if (!name) {
      stats.withoutName++
      continue
    }
    const externalId = osmId(element)
    if (seen.has(externalId)) continue
    seen.add(externalId)
    rows.push({
      externalId,
      name,
      placeType: place,
      longitude: element.longitude,
      latitude: element.latitude,
    })
    stats.kept++
    stats.byType[place]++
  }
  return { rows, stats }
}
