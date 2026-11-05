import type { DriveStatus, SupermarketBrandGroup } from '@apart/contracts'
import {
  driveSignalOfTags,
  foldText,
  supermarketBrandGroup,
} from '@apart/domain'
import type { AmenityRow } from '../../apps/api/src/geo/geo.service.js'
import {
  metersBetween,
  osmAddress,
  osmDisplayName,
  osmId,
  osmUrl,
  overpassQuery,
} from './osm.js'
import type { OsmElement } from './osm.js'

/**
 * Supermarchés avec drive (lot 11, besoin D9) à partir d'OpenStreetMap.
 * Seuls les commerces alimentaires (`shop=supermarket`, `convenience`,
 * `outpost`, `department_store`) sont lus ; leur drive vient de leurs
 * étiquettes (`driveSignalOfTags`, domain) : signalé, à vérifier, ou rien —
 * un magasin sans aucun signal n'est pas retenu (jamais de drive supposé).
 * Un supermarché sans signal à moins de `SERVICE_ROAD_METERS` d'une voie de
 * service « drive-through » qui porte le nom de son enseigne (« Carrefour
 * Drive ») est retenu « à vérifier ». Pur : aucune base, aucun réseau.
 */

export const FOOD_SHOPS = new Set([
  'supermarket',
  'convenience',
  'outpost',
  'department_store',
])

/** Distance maximale entre un supermarché et la voie « drive » de son enseigne. */
export const SERVICE_ROAD_METERS = 400

/**
 * Les enseignes alimentaires qu'une voie « drive » peut nommer : la voie
 * n'est reprise que si elle nomme l'une d'elles (pas un « McDrive »).
 */
const GROCERY_TOKENS = [
  'carrefour',
  'auchan',
  'intermarche',
  'leclerc',
  'super u',
  'hyper u',
  'casino',
  'lidl',
  'aldi',
  'cora',
  'chronodrive',
]

const tokenOf = (label: string | undefined): string | null => {
  if (!label) return null
  const folded = foldText(label)
  return GROCERY_TOKENS.find(t => new RegExp(`\\b${t}\\b`).test(folded)) ?? null
}

/** La requête Overpass de `--download` : commerces alimentaires et voies de drive. */
export const SUPERMARKETS_QUERY = overpassQuery([
  'nwr["shop"~"^(supermarket|convenience|outpost|department_store)$"]',
  'way["highway"="service"]["service"="drive-through"]["name"]',
])

export interface DriveStats {
  read: number
  shops: number
  kept: number
  byStatus: Record<DriveStatus, number>
  byBrand: Record<SupermarketBrandGroup, number>
  fromServiceRoad: number
  withoutSignal: number
  withoutName: number
}

/** Les supermarchés avec drive (signalé ou à vérifier) d'une réponse Overpass. */
export function buildDrives(elements: readonly OsmElement[]): {
  rows: AmenityRow[]
  stats: DriveStats
} {
  const stats: DriveStats = {
    read: elements.length,
    shops: 0,
    kept: 0,
    byStatus: { yes: 0, to_verify: 0 },
    byBrand: { carrefour: 0, auchan: 0, intermarche: 0, other: 0 },
    fromServiceRoad: 0,
    withoutSignal: 0,
    withoutName: 0,
  }
  const roads = elements
    .filter(
      e =>
        e.tags.highway === 'service' &&
        e.tags.service === 'drive-through' &&
        /drive/.test(foldText(e.tags.name ?? '')) &&
        tokenOf(e.tags.name) !== null
    )
    .map(e => ({ element: e, token: tokenOf(e.tags.name) as string }))
  const rows: AmenityRow[] = []
  for (const element of elements) {
    const tags = element.tags
    if (!tags.shop || !FOOD_SHOPS.has(tags.shop)) continue
    stats.shops++
    let signal = driveSignalOfTags(tags)
    if (!signal.status && tags.shop !== 'convenience') {
      const token = tokenOf(tags.brand) ?? tokenOf(tags.name)
      const road = token
        ? roads
            .filter(r => r.token === token)
            .map(r => ({
              ...r,
              meters: metersBetween(
                [element.longitude, element.latitude],
                [r.element.longitude, r.element.latitude]
              ),
            }))
            .filter(r => r.meters <= SERVICE_ROAD_METERS)
            .sort((a, b) => a.meters - b.meters)[0]
        : undefined
      if (road) {
        signal = {
          status: 'to_verify',
          evidence: `voie « ${road.element.tags.name} » (service=drive-through) à ${Math.round(road.meters)} m`,
        }
        stats.fromServiceRoad++
      }
    }
    if (!signal.status) {
      stats.withoutSignal++
      continue
    }
    const name = osmDisplayName(tags)
    if (!name) {
      stats.withoutName++
      continue
    }
    const brandGroup = supermarketBrandGroup(tags.brand, tags.name)
    stats.kept++
    stats.byStatus[signal.status]++
    stats.byBrand[brandGroup]++
    rows.push({
      externalId: osmId(element),
      name,
      brand: tags.brand?.trim() || null,
      brandGroup,
      drive: signal.status,
      address: osmAddress(tags),
      commune: tags['addr:city']?.trim() || null,
      inseeCode: null,
      details: {
        facilityType: `shop=${tags.shop}`,
        driveEvidence: signal.evidence,
        sourceUrl: osmUrl(element),
      },
      longitude: element.longitude,
      latitude: element.latitude,
      sourceUpdatedAt: null,
    })
  }
  rows.sort((a, b) => a.externalId.localeCompare(b.externalId))
  return { rows, stats }
}
