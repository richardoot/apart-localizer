import { BORDEAUX_METROPOLE_COMMUNES } from '@apart/contracts'
import type { NeighbourhoodKind } from '@apart/contracts'
import type { NeighbourhoodRow } from '../../apps/api/src/geo/geo.service.js'

/**
 * Contours des quartiers de Bordeaux Métropole (lot 11, besoin D11). Aucun
 * découpage unique ne couvre les 28 communes : la règle combine
 * - les quartiers des communes de Bordeaux Métropole (`se_quart_s`, huit
 *   communes : Bordeaux, Bègles, Cenon, Martignas-sur-Jalle, Mérignac,
 *   Pessac, Le Taillan-Médoc, Talence), fiches non valides écartées ;
 * - pour Bordeaux, les 30 secteurs de vie de la Ville (`se_quartvie_s`),
 *   plus fins que les huit quartiers, chacun avec son quartier en parent ;
 * - les IRIS de l'INSEE (IGN, Contours IRIS) partout : nommés « IRIS <nom> »,
 *   ou la commune entière pour une commune non découpée (IRIS de type Z,
 *   code en 0000). Dans une commune à quartiers officiels, ils ne servent
 *   qu'à défaut (interstice, liseré) et la carte n'en dessine que la part hors
 *   des quartiers (module geo).
 * Chaque contour garde sa provenance (`source`). Pur : aucune base, aucun
 * réseau.
 */

export const QUARTIERS_URL =
  'https://datahub.bordeaux-metropole.fr/api/explore/v2.1/catalog/datasets/se_quart_s/exports/geojson'
export const SECTEURS_URL =
  'https://datahub.bordeaux-metropole.fr/api/explore/v2.1/catalog/datasets/se_quartvie_s/exports/geojson'
/** Contours IRIS de la Géoplateforme (WFS), filtrés sur les 28 communes, en WGS 84. */
export const IRIS_WFS_URL =
  'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature' +
  '&TYPENAMES=STATISTICALUNITS.IRIS%3Acontours_iris&OUTPUTFORMAT=application%2Fjson' +
  '&SRSNAME=EPSG%3A4326&COUNT=1000&CQL_FILTER=' +
  encodeURIComponent(
    `code_insee IN (${BORDEAUX_METROPOLE_COMMUNES.map(c => `'${c.inseeCode}'`).join(',')})`
  )

export const SOURCE_LABELS = {
  quartiers:
    'Bordeaux Métropole, « Quartier des communes » (se_quart_s), Licence Ouverte',
  secteurs:
    'Ville de Bordeaux, « Secteurs de vie » (se_quartvie_s), Licence Ouverte',
  iris: (edition: string) =>
    `IGN et INSEE, Contours IRIS édition ${edition} (Géoplateforme), Licence Ouverte`,
} as const

const COMMUNES = new Map(
  BORDEAUX_METROPOLE_COMMUNES.map(c => [c.inseeCode, c.name])
)

interface Feature {
  properties: Record<string, unknown>
  geometry: NeighbourhoodRow['geometry'] | null
}

function features(data: unknown, label: string): Feature[] {
  const list = (data as { features?: unknown })?.features
  if (!Array.isArray(list)) {
    throw new Error(`${label} : GeoJSON illisible (« features » absent).`)
  }
  return list.map(item => {
    const f = item as {
      properties?: Record<string, unknown>
      geometry?: { type?: string; coordinates?: unknown } | null
    }
    const type = f.geometry?.type
    return {
      properties: f.properties ?? {},
      geometry:
        type === 'Polygon' || type === 'MultiPolygon'
          ? { type, coordinates: f.geometry?.coordinates }
          : null,
    }
  })
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim()
    ? value.trim()
    : typeof value === 'number'
      ? String(value)
      : null

export interface CommuneRule {
  inseeCode: string
  commune: string
  rule: 'quartiers' | 'secteurs' | 'iris' | 'commune' | 'absente'
  quartiers: number
  iris: number
}

export interface NeighbourhoodStats {
  quartiers: number
  secteurs: number
  iris: number
  communes: number
  invalid: number
  outsideMetropole: number
  withoutGeometry: number
  rules: CommuneRule[]
}

/**
 * Les contours à importer : quartiers officiels, secteurs de vie de Bordeaux,
 * IRIS ou commune entière, selon la règle ci-dessus.
 */
export function buildNeighbourhoods(input: {
  quartiers: unknown | null
  secteurs: unknown | null
  iris: unknown
  irisEdition: string
}): { rows: NeighbourhoodRow[]; stats: NeighbourhoodStats } {
  const stats: NeighbourhoodStats = {
    quartiers: 0,
    secteurs: 0,
    iris: 0,
    communes: 0,
    invalid: 0,
    outsideMetropole: 0,
    withoutGeometry: 0,
    rules: [],
  }
  const rows: NeighbourhoodRow[] = []
  const push = (
    feature: Feature,
    row: Omit<NeighbourhoodRow, 'geometry' | 'commune'> & { commune?: string }
  ): void => {
    if (!feature.geometry) {
      stats.withoutGeometry++
      return
    }
    const commune = row.commune ?? COMMUNES.get(row.inseeCode)
    if (!commune || !COMMUNES.has(row.inseeCode)) {
      stats.outsideMetropole++
      return
    }
    rows.push({ ...row, commune, geometry: feature.geometry })
  }

  const secteurs = input.secteurs
    ? features(input.secteurs, 'Secteurs de vie')
    : []
  for (const f of secteurs) {
    const p = f.properties
    const name = text(p.libelle)
    const id = text(p.gid)
    if (!name || !id) {
      stats.invalid++
      continue
    }
    const before = rows.length
    push(f, {
      kind: 'quartier',
      code: `se_quartvie_s:${id}`,
      name,
      parent: text(p.nom),
      inseeCode: text(p.insee) ?? '',
      source: SOURCE_LABELS.secteurs,
    })
    if (rows.length > before) stats.secteurs++
  }
  const withSecteurs = new Set(
    rows.filter(r => r.code.startsWith('se_quartvie_s:')).map(r => r.inseeCode)
  )

  const quartiers = input.quartiers
    ? features(input.quartiers, 'Quartiers')
    : []
  for (const f of quartiers) {
    const p = f.properties
    const insee = text(p.insee) ?? ''
    if (withSecteurs.has(insee)) continue
    const name = text(p.nom)
    const id = text(p.gid)
    if (!name || !id || String(p.valide).toLowerCase() === 'false') {
      stats.invalid++
      continue
    }
    const before = rows.length
    push(f, {
      kind: 'quartier',
      code: `se_quart_s:${id}`,
      name,
      parent: null,
      inseeCode: insee,
      source: SOURCE_LABELS.quartiers,
    })
    if (rows.length > before) stats.quartiers++
  }

  for (const f of features(input.iris, 'IRIS')) {
    const p = f.properties
    // Géoplateforme (code_iris, nom_iris, type_iris) ou datahub (ident, typ_iris).
    const code = text(p.code_iris) ?? text(p.ident)
    const insee = text(p.code_insee) ?? text(p.insee) ?? code?.slice(0, 5) ?? ''
    const irisName = text(p.nom_iris)
    const type = text(p.type_iris) ?? text(p.typ_iris)
    if (!code || !irisName) {
      stats.invalid++
      continue
    }
    const whole = type === 'Z' || code.endsWith('0000')
    const kind: NeighbourhoodKind = whole ? 'commune' : 'iris'
    const communeName =
      text(p.nom_commune) ?? text(p.nom_com) ?? COMMUNES.get(insee)
    const before = rows.length
    push(f, {
      kind,
      code,
      name: whole ? (communeName ?? irisName) : `IRIS ${irisName}`,
      parent: null,
      inseeCode: insee,
      ...(communeName ? { commune: communeName } : {}),
      source: SOURCE_LABELS.iris(input.irisEdition),
    })
    if (rows.length > before) {
      if (whole) stats.communes++
      else stats.iris++
    }
  }

  for (const c of BORDEAUX_METROPOLE_COMMUNES) {
    const own = rows.filter(r => r.inseeCode === c.inseeCode)
    const official = own.filter(r => r.kind === 'quartier')
    const iris = own.filter(r => r.kind === 'iris')
    stats.rules.push({
      inseeCode: c.inseeCode,
      commune: c.name,
      rule: official.some(r => r.code.startsWith('se_quartvie_s:'))
        ? 'secteurs'
        : official.length
          ? 'quartiers'
          : iris.length
            ? 'iris'
            : own.length
              ? 'commune'
              : 'absente',
      quartiers: official.length,
      iris: iris.length,
    })
  }
  return { rows, stats }
}
