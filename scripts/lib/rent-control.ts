import type { RentEpoch, RentReferenceRow } from '@apart/contracts'
import { parseCsv } from './csv.js'
import { readWorkbook, splitRef } from './xlsx.js'
import type { Sheet } from './xlsx.js'

/**
 * Encadrement des loyers de Bordeaux : lecture du zonage de l'observatoire
 * local des loyers (GML du service WFS de la DDTM de la Gironde), du tableau
 * de l'arrêté préfectoral (classeur de la préfecture) et contrôle croisé avec
 * le référentiel national (CSV « loyers-reference »). Pur : aucune base,
 * aucun réseau. Rien n'est deviné : un libellé inattendu arrête l'import.
 */

export interface RentZone {
  zone: number
  label: string
  irisCode: string
  inseeCode: string
  geometry: { type: 'MultiPolygon'; coordinates: [number, number][][][] }
}

const attr = (xml: string, name: string): string | null => {
  const match = xml.match(new RegExp(`<ms:${name}>([\\s\\S]*?)</ms:${name}>`))
  return match ? (match[1] as string).trim() : null
}

/** Une liste de positions GML en anneau [lng, lat], selon l'ordre des axes du SRS. */
export function ringOfPosList(
  text: string,
  latFirst: boolean
): [number, number][] {
  const values = text.trim().split(/\s+/).map(Number)
  if (values.length % 2 !== 0 || values.some(v => !Number.isFinite(v))) {
    throw new Error('posList GML illisible')
  }
  const ring: [number, number][] = []
  for (let i = 0; i < values.length; i += 2) {
    const a = values[i] as number
    const b = values[i + 1] as number
    ring.push(latFirst ? [b, a] : [a, b])
  }
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]])
  }
  return ring
}

/**
 * Les secteurs du zonage, un par IRIS. Les coordonnées d'un SRS
 * `urn:ogc:def:crs:EPSG::4326` sont en latitude, longitude (ordre des axes
 * d'EPSG) ; elles sont remises en [longitude, latitude] et contrôlées
 * (Gironde : longitude de −2 à 1, latitude de 44 à 46).
 */
export function parseZoningGml(xml: string): RentZone[] {
  const members = [...xml.matchAll(/<wfs:member>([\s\S]*?)<\/wfs:member>/g)]
  if (members.length === 0) throw new Error('Aucun secteur dans le GML')
  return members.map(([, member = '']) => {
    const zone = Number(attr(member, 'Zonage_val'))
    const irisCode = attr(member, 'CODE_IRIS')
    const inseeCode = attr(member, 'INSEE_COM')
    const label = attr(member, 'NOM_IRIS') ?? attr(member, 'ZET_lib')
    if (
      !Number.isInteger(zone) ||
      zone < 1 ||
      !irisCode ||
      !inseeCode ||
      !label
    ) {
      throw new Error(`Secteur incomplet dans le GML (IRIS ${irisCode ?? '?'})`)
    }
    const srs = member.match(/srsName="([^"]+)"/)?.[1] ?? ''
    const latFirst = /urn:ogc:def:crs:EPSG::4326/.test(srs)
    const polygons = [
      ...member.matchAll(/<gml:Polygon[\s\S]*?<\/gml:Polygon>/g),
    ].map(([polygon]) => {
      const exterior = polygon.match(
        /<gml:exterior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/
      )?.[1]
      if (!exterior) throw new Error(`Polygone sans contour (IRIS ${irisCode})`)
      const holes = [
        ...polygon.matchAll(
          /<gml:interior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g
        ),
      ].map(h => ringOfPosList(h[1] ?? '', latFirst))
      return [ringOfPosList(exterior, latFirst), ...holes]
    })
    if (polygons.length === 0)
      throw new Error(`Secteur sans géométrie (IRIS ${irisCode})`)
    for (const polygon of polygons) {
      for (const [lng, lat] of polygon.flat()) {
        if (lng < -2 || lng > 1 || lat < 44 || lat > 46) {
          throw new Error(
            `Coordonnées hors de la Gironde (IRIS ${irisCode}) : ordre des axes à vérifier`
          )
        }
      }
    }
    return {
      zone,
      label,
      irisCode,
      inseeCode,
      geometry: { type: 'MultiPolygon' as const, coordinates: polygons },
    }
  })
}

/** Les quatre époques, dans l'ordre des numéros de l'arrêté (1 à 4). */
const EPOCHS: readonly RentEpoch[] = [
  'before_1946',
  '1946_1970',
  '1971_1990',
  'after_1990',
]
const EPOCH_HINTS: readonly RegExp[] = [
  /avant\s*1946/i,
  /1946/,
  /1971/,
  /apr[eè]s\s*1990/i,
]

/** « 1 -Avant 1946 », « 2 - 1946-70 »... vers l'époque ; lance sur un libellé inattendu. */
export function epochOfLabel(label: string): RentEpoch {
  const index = Number(label.trim().match(/^(\d)/)?.[1]) - 1
  const epoch = EPOCHS[index]
  if (!epoch || !(EPOCH_HINTS[index] as RegExp).test(label)) {
    throw new Error(
      `Époque de construction inattendue dans l'arrêté : « ${label} »`
    )
  }
  return epoch
}

/** « 1 », « 2 », « 4 et plus » vers 1 à 4. */
export function roomsOfLabel(label: string | number): number {
  const text = String(label).trim().toLowerCase()
  const n = Number(text.match(/^(\d+)/)?.[1])
  if (!Number.isInteger(n) || n < 1 || n > 4) {
    throw new Error(`Nombre de pièces inattendu dans l'arrêté : « ${label} »`)
  }
  if (n === 4 && !/plus/.test(text)) {
    throw new Error(
      `« 4 pièces » sans « et plus » : tranche à vérifier (« ${label} »)`
    )
  }
  return n
}

/** « Arrêté préfectoral du 06/07/2026 » vers 2026-07-06. */
export function decreeDateOf(title: string): string {
  const match = title.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) throw new Error(`Date de l'arrêté introuvable dans « ${title} »`)
  return `${match[3]}-${match[2]}-${match[1]}`
}

export interface DecreeTable {
  decreeDate: string
  sheet: string
  rows: RentReferenceRow[]
}

const num = (value: string | number | undefined, where: string): number => {
  const n =
    typeof value === 'number'
      ? value
      : Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`Valeur absente ou invalide en ${where}`)
  return n
}

/**
 * La feuille « Appartements » de l'arrêté : en-têtes repérés par leur
 * libellé (groupes « vides » et « meublés » de la ligne 3, colonnes « Loyer
 * de référence », « majoré », « minoré » de la ligne 4), zones et pièces
 * reportées sur les cellules fusionnées.
 */
export function parseDecreeWorkbook(buffer: Buffer): DecreeTable {
  const sheets = readWorkbook(buffer)
  const sheet =
    sheets.find(s => /appartement/i.test(s.name)) ??
    sheets.find(s => /appartement/i.test(String(s.cells.get('A2') ?? '')))
  if (!sheet)
    throw new Error('Feuille « Appartements » introuvable dans le classeur')
  const decreeDate = decreeDateOf(String(sheet.cells.get('A1') ?? ''))
  const { headerRow, columns } = locateColumns(sheet)
  const rows: RentReferenceRow[] = []
  let zone: number | null = null
  let rooms: number | null = null
  const lastRow = Math.max(
    ...[...sheet.cells.keys()].map(ref => splitRef(ref)[1])
  )
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const a = sheet.cells.get(`A${r}`)
    const b = sheet.cells.get(`B${r}`)
    const c = sheet.cells.get(`C${r}`)
    if (a !== undefined) {
      const z = Number(String(a).match(/zone\s*(\d+)/i)?.[1])
      if (!Number.isInteger(z))
        throw new Error(`Secteur inattendu en A${r} : « ${a} »`)
      zone = z
    }
    if (b !== undefined) rooms = roomsOfLabel(b)
    if (c === undefined) continue
    if (zone === null || rooms === null)
      throw new Error(`Ligne ${r} sans zone ni pièces`)
    const epoch = epochOfLabel(String(c))
    for (const furnished of [false, true]) {
      const col = furnished ? columns.furnished : columns.unfurnished
      rows.push({
        zone,
        rooms,
        epoch,
        furnished,
        referenceRent: num(
          sheet.cells.get(`${col.reference}${r}`),
          `${col.reference}${r}`
        ),
        upperRent: num(sheet.cells.get(`${col.upper}${r}`), `${col.upper}${r}`),
        lowerRent: num(sheet.cells.get(`${col.lower}${r}`), `${col.lower}${r}`),
      })
    }
  }
  if (rows.length === 0)
    throw new Error('Aucune ligne de loyer dans la feuille')
  for (const row of rows) {
    if (!(
      row.lowerRent < row.referenceRent && row.referenceRent < row.upperRent
    )) {
      throw new Error(
        `Incohérence zone ${row.zone}, ${row.rooms} p., ${row.epoch} : minoré < référence < majoré attendu`
      )
    }
  }
  return { decreeDate, sheet: sheet.name, rows }
}

interface Columns {
  reference: string
  upper: string
  lower: string
}

function locateColumns(sheet: Sheet): {
  headerRow: number
  columns: { unfurnished: Columns; furnished: Columns }
} {
  let headerRow = 0
  for (const [ref, value] of sheet.cells) {
    if (/^loyer de r[ée]f[ée]rence$/i.test(String(value).trim())) {
      headerRow = splitRef(ref)[1]
      break
    }
  }
  if (!headerRow) throw new Error('En-tête « Loyer de référence » introuvable')
  const groups = [...sheet.cells]
    .filter(([ref]) => splitRef(ref)[1] === headerRow - 1)
    .map(([ref, value]) => ({ col: splitRef(ref)[0], text: String(value) }))
    .sort((x, y) => colIndex(x.col) - colIndex(y.col))
  const furnishedStart = groups.find(g => /meubl/i.test(g.text))
  const unfurnishedStart = groups.find(g => /vide/i.test(g.text))
  if (!furnishedStart || !unfurnishedStart) {
    throw new Error(
      'Groupes « vides » et « meublés » introuvables au-dessus des en-têtes'
    )
  }
  const headers = [...sheet.cells]
    .filter(([ref]) => splitRef(ref)[1] === headerRow)
    .map(([ref, value]) => ({
      col: splitRef(ref)[0],
      text: String(value).trim().toLowerCase(),
    }))
  const pick = (furnished: boolean): Columns => {
    const inGroup = headers.filter(h =>
      furnished
        ? colIndex(h.col) >= colIndex(furnishedStart.col)
        : colIndex(h.col) >= colIndex(unfurnishedStart.col) &&
          colIndex(h.col) < colIndex(furnishedStart.col)
    )
    const find = (test: (t: string) => boolean): string => {
      const found = inGroup.filter(h => test(h.text))
      if (found.length !== 1) {
        throw new Error(
          `Colonne ambiguë ou absente (${furnished ? 'meublé' : 'vide'})`
        )
      }
      return (found[0] as { col: string }).col
    }
    return {
      reference: find(t => /^loyer de r[ée]f[ée]rence$/.test(t)),
      upper: find(t => /major[ée]$/.test(t) && t.startsWith('loyer')),
      lower: find(t => /minor[ée]$/.test(t)),
    }
  }
  return {
    headerRow,
    columns: { unfurnished: pick(false), furnished: pick(true) },
  }
}

function colIndex(col: string): number {
  return [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
}

const CSV_EPOCHS: Record<string, RentEpoch> = {
  'avant 1946': 'before_1946',
  '1946-1970': '1946_1970',
  '1971-1990': '1971_1990',
  'après 1990': 'after_1990',
}

export interface CrossCheck {
  compared: number
  mismatches: string[]
  missing: number
  validFrom: string | null
  validUntil: string | null
  sourceUrl: string | null
}

/**
 * Contrôle croisé avec le référentiel national (une ligne par zone, pièces,
 * époque, meublé) : mêmes valeurs à 0,01 € près, et les dates d'application
 * de l'arrêté (le classeur de la préfecture ne les porte pas).
 */
export function crossCheckCsv(
  csv: string,
  table: DecreeTable,
  territory = 'bordeaux'
): CrossCheck {
  const records = parseCsv(csv).filter(
    r => r.territoire === territory && r.arrete_date === table.decreeDate
  )
  const key = (
    zone: number,
    rooms: number,
    epoch: RentEpoch,
    furnished: boolean
  ) => `${zone}|${rooms}|${epoch}|${furnished}`
  const byKey = new Map(
    records.map(r => [
      key(
        Number(r.zone),
        Number(r.nombre_pieces),
        CSV_EPOCHS[String(r.epoque_construction)] as RentEpoch,
        r.meuble === 'true'
      ),
      r,
    ])
  )
  const mismatches: string[] = []
  let missing = 0
  for (const row of table.rows) {
    const r = byKey.get(key(row.zone, row.rooms, row.epoch, row.furnished))
    if (!r) {
      missing++
      continue
    }
    const pairs: [string, number, string | undefined][] = [
      ['référence', row.referenceRent, r.loyer_reference],
      ['majoré', row.upperRent, r.loyer_reference_majore],
      ['minoré', row.lowerRent, r.loyer_reference_minore],
    ]
    for (const [label, expected, given] of pairs) {
      if (Math.abs(Number(given) - expected) > 0.005) {
        mismatches.push(
          `zone ${row.zone}, ${row.rooms} p., ${row.epoch}, ${row.furnished ? 'meublé' : 'vide'} : ${label} ${expected} (arrêté) contre ${given} (référentiel)`
        )
      }
    }
  }
  const first = records[0]
  return {
    compared: table.rows.length - missing,
    mismatches,
    missing,
    validFrom: first?.date_debut || null,
    validUntil: first?.date_fin || null,
    sourceUrl: first?.source_url || null,
  }
}
