import { BORDEAUX_METROPOLE_COMMUNES } from '@apart/contracts'
import type { TransitMode } from '@apart/contracts'

/**
 * Arrêts TBM (besoin D4) à partir des jeux SAEIV de Bordeaux Métropole :
 * arrêts physiques (`sv_arret_p`), lignes commerciales (`sv_ligne_a`),
 * chemins de ligne (`sv_chem_l`). Un chemin ne nomme que ses deux terminus :
 * les lignes d'un arrêt intermédiaire se déduisent de la proximité de son
 * point au tracé des chemins du même mode (25 m pour le tram, 20 m pour le
 * bus), en plus des terminus, en ne lisant que les chemins principaux quand
 * l'arrêt en a un. Pur : aucune base, aucun réseau.
 */

export interface TbmStop {
  externalId: string
  mode: TransitMode
  name: string
  lines: string[]
  longitude: number
  latitude: number
}

export const PROXIMITY_METERS: Record<TransitMode, number> = {
  tram: 25,
  bus: 20,
  boat: 50,
}

const BM_INSEE = new Set(BORDEAUX_METROPOLE_COMMUNES.map(c => c.inseeCode))

const modeOf = (vehicule: unknown): TransitMode | null =>
  vehicule === 'TRAM'
    ? 'tram'
    : vehicule === 'BUS'
      ? 'bus'
      : vehicule === 'BATEAU'
        ? 'boat'
        : null

/** « Tram A » → « A » ; les autres libellés restent tels quels (« Lianes 1 »). */
export function lineShortName(label: string): string {
  const tram = label.match(/^tram\s+([A-Z])$/i)
  return tram ? (tram[1] as string).toUpperCase() : label.trim()
}

interface PathGeometry {
  line: string
  mode: TransitMode
  /** Chemin principal de la ligne (`principal` du jeu) ; les autres sont des services partiels ou techniques. */
  principal: boolean
  termini: string[]
  /** Les tronçons du tracé, [lng, lat]. */
  lines: [number, number][][]
  bbox: [number, number, number, number] | null
}

/** Distance en mètres d'un point à un segment, projection équirectangulaire locale. */
export function pointSegmentMeters(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const kx = Math.cos((p[1] * Math.PI) / 180) * 111_320
  const ky = 110_540
  const ax = (a[0] - p[0]) * kx
  const ay = (a[1] - p[1]) * ky
  const bx = (b[0] - p[0]) * kx
  const by = (b[1] - p[1]) * ky
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
  const x = ax + t * dx
  const y = ay + t * dy
  return Math.sqrt(x * x + y * y)
}

function bboxOf(
  lines: [number, number][][]
): [number, number, number, number] | null {
  const all = lines.flat()
  if (all.length === 0) return null
  return [
    Math.min(...all.map(p => p[0])),
    Math.min(...all.map(p => p[1])),
    Math.max(...all.map(p => p[0])),
    Math.max(...all.map(p => p[1])),
  ]
}

/** Les chemins, avec ou sans géométrie (export JSON sans tracé : terminus seulement). */
export function parsePaths(
  data: unknown,
  lineNames: Map<string, string>
): PathGeometry[] {
  const features: Array<
    { geometry?: unknown; properties?: Record<string, unknown> } & Record<
      string,
      unknown
    >
  > = Array.isArray(data)
    ? (data as Record<string, unknown>[]).map(record => ({
        properties: record,
      }))
    : ((data as { features?: [] }).features ?? [])
  const paths: PathGeometry[] = []
  for (const feature of features) {
    const p = feature.properties ?? {}
    const line = lineNames.get(String(p.rs_sv_ligne_a))
    const mode = modeOf(p.vehicule)
    if (!line || !mode) continue
    const geometry = feature.geometry as
      | { type: 'LineString'; coordinates: [number, number][] }
      | { type: 'MultiLineString'; coordinates: [number, number][][] }
      | null
      | undefined
    const lines =
      geometry?.type === 'LineString'
        ? [geometry.coordinates]
        : geometry?.type === 'MultiLineString'
          ? geometry.coordinates
          : []
    paths.push({
      line,
      mode,
      principal: String(p.principal).toLowerCase() === 'true',
      termini: [String(p.rg_sv_arret_p_nd), String(p.rg_sv_arret_p_na)],
      lines,
      bbox: bboxOf(lines),
    })
  }
  return paths
}

/** Les lignes actives, par identifiant (`bm_gid`), en nom court. */
export function parseLines(data: unknown): Map<string, string> {
  const names = new Map<string, string>()
  for (const line of (data as Record<string, unknown>[]) ?? []) {
    if (line.bm_active === 0) continue
    names.set(String(line.bm_gid), lineShortName(String(line.bm_libelle)))
  }
  return names
}

export interface ParseStats {
  read: number
  inactive: number
  outsideMetropole: number
  kept: number
  withLine: number
}

/**
 * Les arrêts actifs de Bordeaux Métropole (hors arrêts fictifs), avec leurs
 * lignes : terminus des chemins, puis proximité au tracé du même mode.
 */
export function buildStops(
  stopsData: unknown,
  paths: readonly PathGeometry[]
): { stops: TbmStop[]; stats: ParseStats } {
  const features =
    (
      stopsData as {
        features?: Array<{
          geometry?: { type: string; coordinates: [number, number] }
          properties: Record<string, unknown>
        }>
      }
    ).features ?? []
  const stats: ParseStats = {
    read: features.length,
    inactive: 0,
    outsideMetropole: 0,
    kept: 0,
    withLine: 0,
  }
  const stops: TbmStop[] = []
  for (const feature of features) {
    const p = feature.properties
    const mode = modeOf(p.vehicule)
    if (
      p.actif !== 1 ||
      p.type === 'FICTIF' ||
      !mode ||
      feature.geometry?.type !== 'Point'
    ) {
      stats.inactive++
      continue
    }
    if (!BM_INSEE.has(String(p.insee))) {
      stats.outsideMetropole++
      continue
    }
    const point = feature.geometry.coordinates
    const id = String(p.gid)
    const tolerance = PROXIMITY_METERS[mode]
    const dLat = tolerance / 110_540
    const dLng = tolerance / (Math.cos((point[1] * Math.PI) / 180) * 111_320)
    const serves = (path: PathGeometry): boolean => {
      if (path.mode !== mode) return false
      if (path.termini.includes(id)) return true
      const b = path.bbox
      if (
        !b ||
        point[0] < b[0] - dLng ||
        point[0] > b[2] + dLng ||
        point[1] < b[1] - dLat ||
        point[1] > b[3] + dLat
      ) {
        return false
      }
      for (const line of path.lines) {
        for (let i = 0; i < line.length - 1; i++) {
          if (
            pointSegmentMeters(
              point,
              line[i] as [number, number],
              line[i + 1] as [number, number]
            ) <= tolerance
          ) {
            return true
          }
        }
      }
      return false
    }
    // Les chemins principaux d'abord : les parcours partiels ou techniques
    // (dépôt) feraient passer des lignes qui ne desservent pas l'arrêt. Un
    // arrêt qu'aucun chemin principal ne dessert garde ceux des autres.
    let lines = new Set(
      paths.filter(p => p.principal && serves(p)).map(p => p.line)
    )
    if (lines.size === 0) {
      lines = new Set(paths.filter(serves).map(p => p.line))
    }
    const sorted = [...lines].sort((a, b) =>
      a.localeCompare(b, 'fr', { numeric: true })
    )
    if (sorted.length) stats.withLine++
    stats.kept++
    stops.push({
      externalId: id,
      mode,
      name: String(p.libelle).trim(),
      lines: sorted,
      longitude: point[0],
      latitude: point[1],
    })
  }
  return { stops, stats }
}
