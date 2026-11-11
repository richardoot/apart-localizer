import { createHash } from 'node:crypto'
import {
  BORDEAUX_RENT_OBSERVATORY,
  RentObservatoryTableSchema,
} from '@apart/contracts'
import type {
  RentObservatoryStats,
  RentObservatoryTable,
  RentObservatoryZone,
} from '@apart/contracts'
import { parseCsv } from './csv.js'
import { unzip } from './xlsx.js'

/**
 * Lot 28 : lecture des résultats d'un observatoire local des loyers (jeu
 * data.gouv.fr « Résultats des observatoires locaux des loyers par
 * agglomération ») : une archive par année et par observatoire, avec la
 * base des résultats (`Base_OP_<année>_<code>.csv`) et le zonage
 * (`<code>Zonage<année>.csv`), en Latin-1, séparés par des points-virgules.
 * Pur : aucune E/S, aucun réseau.
 */

/** L'archive d'une année d'enquête sur le site du réseau des observatoires. */
export function ollArchiveUrl(
  year: number,
  observatory: string = BORDEAUX_RENT_OBSERVATORY
): string {
  return `https://www.observatoires-des-loyers.org/datagouv/${year}/Base_OP_${year}_${observatory}.zip`
}

/** Le nom de l'archive d'une année (`Base_OP_2025_L3300.zip`). */
export function ollArchiveName(
  year: number,
  observatory: string = BORDEAUX_RENT_OBSERVATORY
): string {
  return `Base_OP_${year}_${observatory}.zip`
}

/** Un nombre à la française (« 13,4 », « 12 923 ») ; null s'il est vide ou illisible. */
export function frenchNumber(text: string | undefined): number | null {
  const cleaned = (text ?? '').replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/** « Appart 2P » → 2, « Appart 4P+ » → 4 ; null pour une maison ou un ensemble. */
export function roomsOfOllLabel(label: string): number | null {
  const match = /^Appart\s+([1-4])P(\+)?$/.exec(label.trim())
  if (!match) return null
  const rooms = Number(match[1])
  // « 4P » sans « + » n'existe pas dans la nomenclature homogène.
  return rooms === 4 && !match[2] ? null : rooms
}

/** « L3300.1.03 » → { observatory: 'L3300', set: 1, zone: 3 }. */
export function parseOllZoneCode(
  code: string
): { observatory: string; set: number; zone: number } | null {
  const match = /^(L\d{4})\.(\d+)\.(\d+)$/.exec(code.trim())
  if (!match) return null
  return {
    observatory: match[1] as string,
    set: Number(match[2]),
    zone: Number(match[3]),
  }
}

const DIMENSIONS = [
  'epoque_construction_local',
  'epoque_construction_homogene',
  'anciennete_locataire_local',
  'anciennete_locataire_homogene',
  'nombre_pieces_local',
  'nombre_pieces_homogene',
] as const

type Dimension = (typeof DIMENSIONS)[number]

/** Vrai si toutes les dimensions sauf celles données sont vides. */
function onlyDimensions(
  row: Record<string, string>,
  filled: readonly Dimension[]
): boolean {
  return DIMENSIONS.every(d =>
    filled.includes(d) ? (row[d] ?? '') !== '' : (row[d] ?? '') === ''
  )
}

function statsOf(
  row: Record<string, string>,
  rooms: number | null
): RentObservatoryStats | null {
  const medianPerM2 = frenchNumber(row.loyer_median)
  const q1PerM2 = frenchNumber(row.loyer_1_quartile)
  const q3PerM2 = frenchNumber(row.loyer_3_quartile)
  // Une ligne sans médiane n'est pas publiée (trop peu de logements enquêtés).
  if (medianPerM2 === null || q1PerM2 === null || q3PerM2 === null) return null
  return {
    rooms,
    medianPerM2,
    q1PerM2,
    q3PerM2,
    observations: Math.round(frenchNumber(row.nombre_observations) ?? 0),
  }
}

export interface OllResults {
  observatory: string
  year: number
  /** Par zone de calcul : les appartements, toutes tailles puis par pièces. */
  zones: Map<
    number,
    {
      stats: RentObservatoryStats[]
      recentTenants: RentObservatoryStats | null
    }
  >
  lines: number
  kept: number
}

/**
 * Les loyers des appartements par zone de calcul : toutes tailles (ligne
 * « Appartement » sans autre dimension), par nombre de pièces (« Appart 1P »
 * à « Appart 4P+ ») et locataires arrivés depuis moins d'un an. Les maisons,
 * les époques de construction et l'agglomération entière ne sont pas repris.
 */
export function parseOllResults(
  text: string,
  observatory: string = BORDEAUX_RENT_OBSERVATORY
): OllResults {
  const rows = parseCsv(text, ';')
  if (rows.length === 0 || rows[0]?.Zone_calcul === undefined) {
    throw new Error(
      'Base des résultats illisible : colonne « Zone_calcul » absente.'
    )
  }
  const zones: OllResults['zones'] = new Map()
  const years = new Set<number>()
  const sets = new Set<number>()
  let kept = 0
  for (const row of rows) {
    const code = parseOllZoneCode(row.Zone_calcul ?? '')
    if (!code || code.observatory !== observatory) continue
    if ((row.Zone_complementaire ?? '') !== '') continue
    const type = row.Type_habitat ?? ''
    let rooms: number | null = null
    let recent = false
    if (type === 'Appartement' && onlyDimensions(row, [])) {
      rooms = null
    } else if (
      type === 'Appartement' &&
      onlyDimensions(row, ['anciennete_locataire_homogene']) &&
      /^1\./.test(row.anciennete_locataire_homogene ?? '')
    ) {
      recent = true
    } else if (
      (type === '' || type === 'Appartement') &&
      onlyDimensions(row, ['nombre_pieces_homogene'])
    ) {
      rooms = roomsOfOllLabel(row.nombre_pieces_homogene ?? '')
      if (rooms === null) continue
    } else {
      continue
    }
    const stats = statsOf(row, rooms)
    if (!stats) continue
    const year = frenchNumber(row.Data_year)
    if (year !== null) years.add(year)
    sets.add(code.set)
    const zone = zones.get(code.zone) ?? { stats: [], recentTenants: null }
    if (recent) zone.recentTenants = stats
    else if (!zone.stats.some(s => s.rooms === stats.rooms)) {
      zone.stats.push(stats)
    }
    zones.set(code.zone, zone)
    kept++
  }
  if (zones.size === 0) {
    throw new Error(
      `Aucun loyer d'appartement par zone pour l'observatoire ${observatory} dans cette base.`
    )
  }
  if (years.size !== 1) {
    throw new Error(
      `Année d'enquête ambiguë dans la base : ${[...years].sort().join(', ') || 'aucune'}.`
    )
  }
  if (sets.size !== 1) {
    throw new Error(
      `Plusieurs découpages en zones dans la base (${[...sets].sort().join(', ')}) : un seul est attendu.`
    )
  }
  for (const zone of zones.values()) {
    // Toutes tailles d'abord, puis 1, 2, 3, 4 pièces et plus.
    zone.stats.sort((a, b) => (a.rooms ?? 0) - (b.rooms ?? 0))
  }
  return {
    observatory,
    year: [...years][0] as number,
    zones,
    lines: rows.length,
    kept,
  }
}

export interface OllZoning {
  /** Zone de chaque IRIS des communes partagées entre plusieurs zones. */
  irisZones: Record<string, number>
  /** Zone de chaque commune entière dans une seule zone. */
  communeZones: Record<string, number>
  labels: Map<number, string>
  communes: number
}

/**
 * Le zonage : une ligne par IRIS (ou par commune, IRIS vide). Une commune
 * dont toutes les lignes portent la même zone est rangée par son code INSEE ;
 * une commune partagée l'est IRIS par IRIS, et chaque ligne doit alors porter
 * un code IRIS de cette commune.
 */
export function parseOllZoning(text: string): OllZoning {
  const rows = parseCsv(text, ';')
  if (rows.length === 0 || rows[0]?.ZONE === undefined) {
    throw new Error('Zonage illisible : colonne « ZONE » absente.')
  }
  const byCommune = new Map<string, { iris: string; zone: number }[]>()
  const labels = new Map<number, string>()
  for (const row of rows) {
    const insee = (row.INSEE ?? '').trim()
    const zone = frenchNumber(row.ZONE)
    if (!/^\d[\dAB]\d{3}$/.test(insee) || zone === null || zone < 1) {
      throw new Error(
        `Zonage : ligne illisible (INSEE « ${row.INSEE ?? ''} », zone « ${row.ZONE ?? ''} »).`
      )
    }
    labels.set(zone, (row.LIB_ZONE ?? '').trim() || `Zone ${zone}`)
    const list = byCommune.get(insee) ?? []
    list.push({ iris: (row.IRIS ?? '').trim(), zone })
    byCommune.set(insee, list)
  }
  const irisZones: Record<string, number> = {}
  const communeZones: Record<string, number> = {}
  for (const [insee, list] of byCommune) {
    const zones = new Set(list.map(l => l.zone))
    if (zones.size === 1) {
      communeZones[insee] = list[0]?.zone as number
      continue
    }
    for (const { iris, zone } of list) {
      if (!iris.startsWith(insee) || iris.length !== 9) {
        throw new Error(
          `Zonage : la commune ${insee} est partagée entre plusieurs zones, mais une ligne n'a pas de code IRIS valide (« ${iris} »).`
        )
      }
      irisZones[iris] = zone
    }
  }
  return { irisZones, communeZones, labels, communes: byCommune.size }
}

/** La base et le zonage d'une archive de l'observatoire, décodés (Latin-1). */
export function readOllArchive(
  archive: Buffer,
  observatory: string = BORDEAUX_RENT_OBSERVATORY
): { results: string; zoning: string } {
  const files = unzip(archive)
  const find = (pattern: RegExp, what: string): string => {
    for (const [name, content] of files) {
      const base = name.split('/').pop() ?? name
      if (pattern.test(base)) return content.toString('latin1')
    }
    throw new Error(`Archive de l'observatoire : ${what} introuvable.`)
  }
  return {
    results: find(
      new RegExp(`^Base_OP_\\d{4}_${observatory}\\.csv$`, 'i'),
      'base des résultats (Base_OP_…csv)'
    ),
    zoning: find(
      new RegExp(`^${observatory}Zonage\\d{4}\\.csv$`, 'i'),
      'zonage (…Zonage….csv)'
    ),
  }
}

/**
 * La table rangée en base : chaque zone du zonage doit avoir ses loyers.
 * Une zone publiée mais absente du zonage est écartée (elle ne servirait à
 * aucune annonce).
 */
export function buildRentObservatoryTable(input: {
  results: OllResults
  zoning: OllZoning
  source: { url: string | null; file: string; sha256: string }
  importedAt: string
}): RentObservatoryTable {
  const used = new Set([
    ...Object.values(input.zoning.irisZones),
    ...Object.values(input.zoning.communeZones),
  ])
  const missing = [...used].filter(z => !input.results.zones.has(z)).sort()
  if (missing.length) {
    throw new Error(
      `Zones du zonage sans loyer publié dans la base : ${missing.join(', ')} — le zonage ne correspond pas à cette base.`
    )
  }
  const zones: RentObservatoryZone[] = [...input.results.zones]
    .filter(([zone]) => used.has(zone))
    .sort(([a], [b]) => a - b)
    .map(([zone, value]) => ({
      zone,
      label: input.zoning.labels.get(zone) ?? `Zone ${zone}`,
      stats: value.stats,
      recentTenants: value.recentTenants,
    }))
  return RentObservatoryTableSchema.parse({
    territory: 'bordeaux',
    observatory: input.results.observatory,
    year: input.results.year,
    observedAt: `${input.results.year}-01-01`,
    housingType: 'apartment',
    zones,
    irisZones: input.zoning.irisZones,
    communeZones: input.zoning.communeZones,
    source: { ...input.source, importedAt: input.importedAt },
  })
}

export function sha256Of(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
