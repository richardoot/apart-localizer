import { BORDEAUX_METROPOLE_COMMUNES } from '@apart/contracts'
import { isFitnessPark } from '@apart/domain'
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
 * Pistes d'athlétisme et salles Fitness Park (lot 11, besoins D8 et D10).
 *
 * Pistes : le recensement des équipements sportifs du ministère des Sports
 * (« Data ES », jeu `data-es`, Licence Ouverte 2.0), types « Stade
 * d’athlétisme » (1001), « Piste d'athlétisme isolée » (1004) et « Piste
 * d'athlétisme 2 à 4 couloirs » (1005) ; les aires de saut et de lancer ne
 * sont pas des pistes. En complément, les pistes OpenStreetMap
 * (`leisure=track` + `sport=athletics`, ODbL) qu'aucune fiche du recensement
 * ne décrit déjà (référence `ref:FR:sport_equip`, ou une piste du
 * recensement à moins de `RES_MATCH_METERS`).
 *
 * Fitness Park : OpenStreetMap seul (le recensement n'en compte aucun en
 * Gironde), chaque club vérifié par `isFitnessPark` (domain). Pur.
 */

/** Le code SIREN de Bordeaux Métropole, champ `epci_code` du recensement. */
export const BORDEAUX_METROPOLE_SIREN = '243300316'

/** Les types du recensement retenus comme pistes, et leur libellé. */
export const RES_TRACK_TYPES: Record<string, string> = {
  '1001': 'Stade d’athlétisme',
  '1004': 'Piste d’athlétisme isolée',
  '1005': 'Piste d’athlétisme 2 à 4 couloirs',
}

/** Une piste OpenStreetMap à moins de cette distance d'une piste du recensement est déjà décrite. */
export const RES_MATCH_METERS = 200

/**
 * Le recensement date toutes les fiches reprises au 31 mars 2025 ; la fiche
 * du jeu demande de ne pas tenir compte des dates antérieures au 1er avril
 * 2025.
 */
export const RES_DATE_FLOOR = '2025-04-01'

/** L'export JSON des pistes de la métropole (`--download`). */
export const RES_EXPORT_URL =
  'https://equipements.sports.gouv.fr/api/explore/v2.1/catalog/datasets/data-es/exports/json' +
  `?where=${encodeURIComponent(`epci_code='${BORDEAUX_METROPOLE_SIREN}' and equip_type_famille="Equipement d'athlétisme"`)}`

export const OSM_TRACKS_QUERY = overpassQuery([
  'nwr["leisure"="track"]["sport"~"athletics"]',
])

export const OSM_FITNESS_QUERY = overpassQuery([
  'nwr["leisure"~"^(fitness_centre|sports_centre)$"]["name"~"fitness ?park",i]',
  'nwr["brand"~"fitness park",i]',
  'nwr["brand:wikidata"="Q102351191"]',
])

const BM_INSEE = new Set(BORDEAUX_METROPOLE_COMMUNES.map(c => c.inseeCode))

type ResRecord = Record<string, unknown>

/** Les fiches d'un export du recensement : JSON (tableau) ou GeoJSON. */
export function resRecords(data: unknown): ResRecord[] {
  if (Array.isArray(data)) return data as ResRecord[]
  const features = (data as { features?: unknown })?.features
  if (Array.isArray(features)) {
    return features.map(f => {
      const feature = f as {
        properties?: ResRecord
        geometry?: { type?: string; coordinates?: [number, number] }
      }
      const coordinates =
        feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null
      return {
        ...(feature.properties ?? {}),
        ...(coordinates
          ? {
              equip_coordonnees: { lon: coordinates[0], lat: coordinates[1] },
            }
          : {}),
      }
    })
  }
  throw new Error(
    'Export du recensement illisible : ni tableau JSON ni GeoJSON.'
  )
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null
const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}
const isTrue = (value: unknown): boolean => value === true || value === 'true'

/** Les publics déclarés : « Scolaires,universités » → « Scolaires, universités ». */
function users(record: ResRecord): string[] {
  let list: unknown = record.equip_utilisateur_filter
  if (!Array.isArray(list) && typeof record.equip_utilisateur === 'string') {
    try {
      list = JSON.parse(record.equip_utilisateur)
    } catch {
      list = []
    }
  }
  return (Array.isArray(list) ? list : [])
    .filter((u): u is string => typeof u === 'string' && u.trim() !== '')
    .map(u => u.trim().replace(/,(?=\S)/g, ', '))
}

export interface ResStats {
  read: number
  outsideMetropole: number
  otherTypes: number
  withoutPosition: number
  kept: number
  byType: Record<string, number>
}

/** Les pistes du recensement de la métropole. */
export function buildResTracks(data: unknown): {
  rows: AmenityRow[]
  /** Tous les équipements d'athlétisme lus (pistes et aires), pour le rapprochement OSM. */
  athletics: { externalId: string; point: [number, number] }[]
  stats: ResStats
} {
  const records = resRecords(data)
  const stats: ResStats = {
    read: records.length,
    outsideMetropole: 0,
    otherTypes: 0,
    withoutPosition: 0,
    kept: 0,
    byType: {},
  }
  const rows: AmenityRow[] = []
  const athletics: { externalId: string; point: [number, number] }[] = []
  for (const record of records) {
    const insee = text(record.new_code)
    if (
      !(insee && BM_INSEE.has(insee)) &&
      text(record.epci_code) !== BORDEAUX_METROPOLE_SIREN
    ) {
      stats.outsideMetropole++
      continue
    }
    const at = record.equip_coordonnees as
      { lon?: unknown; lat?: unknown } | undefined
    const lon = typeof at?.lon === 'number' ? at.lon : null
    const lat = typeof at?.lat === 'number' ? at.lat : null
    const id = text(record.equip_numero)
    if (lon === null || lat === null || !id) {
      stats.withoutPosition++
      continue
    }
    if (text(record.equip_type_famille)?.startsWith('Equipement d')) {
      athletics.push({ externalId: id, point: [lon, lat] })
    }
    const type = text(record.equip_type_code)
    if (!type || !(type in RES_TRACK_TYPES)) {
      stats.otherTypes++
      continue
    }
    const nature = text(record.equip_nature)
    const updated = text(record.equip_maj_date)
    const access = [
      ...(isTrue(record.equip_acc_libre) ? ['Accès libre'] : []),
      ...users(record),
    ]
    stats.kept++
    const label = text(record.equip_type_name) ?? RES_TRACK_TYPES[type] ?? null
    stats.byType[label ?? type] = (stats.byType[label ?? type] ?? 0) + 1
    rows.push({
      externalId: id,
      name:
        text(record.inst_nom) ?? text(record.equip_nom) ?? (label as string),
      brand: null,
      brandGroup: null,
      drive: null,
      address:
        [
          text(record.inst_adresse),
          [text(record.inst_cp), text(record.new_name)]
            .filter(Boolean)
            .join(' '),
        ]
          .filter(Boolean)
          .join(', ') || null,
      commune: text(record.new_name),
      inseeCode: insee,
      details: {
        facilityType: label,
        covered:
          nature === 'Découvert' ? false : nature === 'Intérieur' ? true : null,
        lengthMeters: num(record.equip_piste_long) ?? num(record.equip_long),
        lanes: num(record.equip_piste_nb),
        surfaceType: text(record.equip_sol),
        access,
      },
      longitude: lon,
      latitude: lat,
      sourceUpdatedAt:
        updated && updated.slice(0, 10) >= RES_DATE_FLOOR
          ? updated.slice(0, 10)
          : null,
    })
  }
  rows.sort((a, b) => a.externalId.localeCompare(b.externalId))
  return { rows, athletics, stats }
}

const ACCESS_LABELS: Record<string, string> = {
  yes: 'Accès libre',
  permissive: 'Accès toléré',
  private: 'Privé',
  customers: 'Clients',
  members: 'Membres',
  no: 'Interdit',
}

export interface OsmTrackStats {
  read: number
  tracks: number
  knownByReference: number
  nearResEquipment: number
  kept: number
}

/**
 * Les pistes OpenStreetMap qu'aucune fiche du recensement ne décrit : ni
 * référence `ref:FR:sport_equip` vers un équipement d'athlétisme du
 * recensement, ni piste du recensement à moins de `RES_MATCH_METERS`.
 */
export function buildOsmTracks(
  elements: readonly OsmElement[],
  res: {
    athletics: readonly { externalId: string; point: [number, number] }[]
    tracks: readonly Pick<AmenityRow, 'longitude' | 'latitude'>[]
  }
): { rows: AmenityRow[]; stats: OsmTrackStats } {
  const stats: OsmTrackStats = {
    read: elements.length,
    tracks: 0,
    knownByReference: 0,
    nearResEquipment: 0,
    kept: 0,
  }
  const known = new Set(res.athletics.map(a => a.externalId))
  const rows: AmenityRow[] = []
  for (const element of elements) {
    const tags = element.tags
    if (tags.leisure !== 'track' || !/athletics/.test(tags.sport ?? ''))
      continue
    stats.tracks++
    const reference = tags['ref:FR:sport_equip']
    if (reference && known.has(reference)) {
      stats.knownByReference++
      continue
    }
    const point: [number, number] = [element.longitude, element.latitude]
    if (
      res.tracks.some(
        t => metersBetween([t.longitude, t.latitude], point) <= RES_MATCH_METERS
      )
    ) {
      stats.nearResEquipment++
      continue
    }
    stats.kept++
    const covered =
      tags.covered === 'yes' || tags.indoor === 'yes'
        ? true
        : tags.covered === 'no'
          ? false
          : null
    rows.push({
      externalId: osmId(element),
      name: osmDisplayName(tags) ?? 'Piste d’athlétisme sans nom',
      brand: null,
      brandGroup: null,
      drive: null,
      address: osmAddress(tags),
      commune: tags['addr:city']?.trim() || null,
      inseeCode: null,
      details: {
        facilityType: 'Piste (OpenStreetMap)',
        covered,
        lengthMeters: num(tags.length),
        lanes: num(tags.lanes),
        surfaceType: tags.surface ?? null,
        access: tags.access
          ? [ACCESS_LABELS[tags.access] ?? `access=${tags.access}`]
          : [],
        sourceUrl: osmUrl(element),
      },
      longitude: element.longitude,
      latitude: element.latitude,
      sourceUpdatedAt: null,
    })
  }
  return { rows, stats }
}

export interface FitnessStats {
  read: number
  kept: number
  rejected: string[]
}

/** Les clubs Fitness Park d'une réponse Overpass, vérifiés un à un. */
export function buildFitnessParks(elements: readonly OsmElement[]): {
  rows: AmenityRow[]
  stats: FitnessStats
} {
  const stats: FitnessStats = { read: elements.length, kept: 0, rejected: [] }
  const rows: AmenityRow[] = []
  for (const element of elements) {
    const tags = element.tags
    const name = osmDisplayName(tags)
    if (!isFitnessPark(tags) || !name) {
      stats.rejected.push(name ?? osmId(element))
      continue
    }
    stats.kept++
    rows.push({
      externalId: osmId(element),
      name,
      brand: tags.brand?.trim() || null,
      brandGroup: null,
      drive: null,
      address: osmAddress(tags),
      commune: tags['addr:city']?.trim() || null,
      inseeCode: null,
      details: {
        facilityType: tags.leisure ? `leisure=${tags.leisure}` : null,
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
