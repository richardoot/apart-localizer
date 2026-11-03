import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import { BORDEAUX_METROPOLE_COMMUNES } from '@apart/contracts'
import { parseCsvLine, recordOf } from './csv.js'

/**
 * Ventes DVF géolocalisées (Etalab, « DVF géolocalisées », par département
 * et par année) : lecture en flux d'un CSV éventuellement compressé, filtre
 * sur Bordeaux Métropole et sur les ventes d'un seul appartement. Pur hors
 * lecture du fichier ; aucune base.
 */

/** Natures de mutation importées ; les comparables ne retiennent que « Vente ». */
export const DVF_NATURES = new Set([
  'Vente',
  "Vente en l'état futur d'achèvement",
])
/** Bornes de plausibilité : surface et prix au m² hors de ces bornes = erreur de saisie probable. */
export const DVF_MIN_SURFACE = 9
export const DVF_MIN_PRICE_PER_M2 = 500
export const DVF_MAX_PRICE_PER_M2 = 20_000

const BM_INSEE = new Set(BORDEAUX_METROPOLE_COMMUNES.map(c => c.inseeCode))

export interface DvfSale {
  externalId: string
  mutationDate: string
  mutationNature: string
  price: number
  surface: number
  propertyType: string
  rooms: number | null
  address: string | null
  postalCode: string | null
  commune: string | null
  inseeCode: string | null
  latitude: number
  longitude: number
  pricePerM2: number
  source: string
}

export interface DvfStats {
  lines: number
  outsideMetropole: number
  mutations: number
  kept: number
  skipped: Record<string, number>
  communes: number
  /** Les années des mutations lues dans la métropole : celles que l'import remplace. */
  years: number[]
}

type Row = Record<string, string>

const toNumber = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === '') return null
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Les types de local qu'une vente d'appartement peut porter : l'appartement, ses dépendances, le terrain (ligne sans local). */
const APARTMENT_SALE_LOCALS = new Set(['Appartement', 'Dépendance', ''])

/**
 * Une mutation (toutes ses lignes) vers une vente, ou la raison de l'écarter :
 * un seul appartement (les dépendances, cave ou parking, sont comprises dans
 * le prix), aucun autre local (maison, local commercial : le prix serait
 * global), nature retenue, point, surface et prix au m² plausibles.
 */
export function saleOfMutation(
  rows: readonly Row[],
  source: string
): { sale: DvfSale } | { skipped: string } {
  const apartments = rows.filter(r => r.type_local === 'Appartement')
  if (apartments.length === 0) return { skipped: 'sans appartement' }
  if (apartments.length > 1)
    return { skipped: 'plusieurs appartements (prix global)' }
  if (rows.some(r => !APARTMENT_SALE_LOCALS.has((r.type_local ?? '').trim())))
    return { skipped: 'avec une maison ou un local (prix global)' }
  const flat = apartments[0] as Row
  const nature = flat.nature_mutation ?? ''
  if (!DVF_NATURES.has(nature)) return { skipped: `nature « ${nature} »` }
  const price = toNumber(flat.valeur_fonciere)
  const surface = toNumber(flat.surface_reelle_bati)
  const longitude = toNumber(flat.longitude)
  const latitude = toNumber(flat.latitude)
  if (price === null || price <= 0) return { skipped: 'sans valeur foncière' }
  if (surface === null || surface < DVF_MIN_SURFACE)
    return { skipped: 'surface absente ou < 9 m²' }
  if (longitude === null || latitude === null)
    return { skipped: 'non géolocalisée' }
  const pricePerM2 = Math.round((price / surface) * 100) / 100
  if (pricePerM2 < DVF_MIN_PRICE_PER_M2 || pricePerM2 > DVF_MAX_PRICE_PER_M2) {
    return { skipped: 'prix au m² implausible' }
  }
  const street = [
    flat.adresse_numero,
    flat.adresse_suffixe,
    flat.adresse_nom_voie,
  ]
    .map(part => (part ?? '').trim())
    .filter(Boolean)
    .join(' ')
  const rooms = toNumber(flat.nombre_pieces_principales)
  return {
    sale: {
      externalId: String(flat.id_mutation),
      mutationDate: String(flat.date_mutation),
      mutationNature: nature,
      price,
      surface,
      propertyType: 'Appartement',
      rooms: rooms !== null && Number.isInteger(rooms) ? rooms : null,
      address: street || null,
      postalCode: flat.code_postal || null,
      commune: flat.nom_commune || null,
      inseeCode: flat.code_commune || null,
      latitude,
      longitude,
      pricePerM2,
      source,
    },
  }
}

/** Les lignes d'un fichier ou d'une URL, décompressées si le nom finit par .gz. */
export async function* csvLines(
  location: string,
  fetchImpl: typeof fetch = fetch
): AsyncGenerator<string> {
  let stream: Readable
  if (/^https?:\/\//.test(location)) {
    const response = await fetchImpl(location)
    if (!response.ok || !response.body) {
      throw new Error(
        `Téléchargement impossible (${response.status}) : ${location}`
      )
    }
    stream = Readable.fromWeb(
      response.body as Parameters<typeof Readable.fromWeb>[0]
    )
  } else {
    stream = createReadStream(location)
  }
  const input = /\.gz($|\?)/.test(location)
    ? stream.pipe(createGunzip())
    : stream
  const reader = createInterface({ input, crlfDelay: Infinity })
  for await (const line of reader) yield line
}

/**
 * Lit un fichier DVF en flux et rend les ventes retenues de la métropole.
 * Les lignes d'une même mutation sont regroupées (elles se suivent dans les
 * fichiers d'Etalab, mais l'ordre n'est pas supposé).
 */
export async function readDvf(
  lines: AsyncIterable<string>,
  source: string
): Promise<{ sales: DvfSale[]; stats: DvfStats }> {
  let header: string[] | null = null
  const mutations = new Map<string, Row[]>()
  const stats: DvfStats = {
    lines: 0,
    outsideMetropole: 0,
    mutations: 0,
    kept: 0,
    skipped: {},
    communes: 0,
    years: [],
  }
  const years = new Set<number>()
  for await (const line of lines) {
    if (!line.trim()) continue
    if (!header) {
      header = parseCsvLine(line.replace(/^\uFEFF/, ''))
      for (const required of [
        'id_mutation',
        'date_mutation',
        'valeur_fonciere',
        'code_commune',
        'type_local',
        'surface_reelle_bati',
        'longitude',
        'latitude',
      ]) {
        if (!header.includes(required)) {
          throw new Error(
            `Colonne « ${required} » absente : ce n'est pas un fichier DVF géolocalisé`
          )
        }
      }
      continue
    }
    stats.lines++
    const row = recordOf(header, parseCsvLine(line))
    if (!BM_INSEE.has(row.code_commune ?? '')) {
      stats.outsideMetropole++
      continue
    }
    const year = Number((row.date_mutation ?? '').slice(0, 4))
    if (Number.isInteger(year) && year > 1900) years.add(year)
    const id = row.id_mutation ?? ''
    const list = mutations.get(id)
    if (list) list.push(row)
    else mutations.set(id, [row])
  }
  const sales: DvfSale[] = []
  for (const rows of mutations.values()) {
    stats.mutations++
    const result = saleOfMutation(rows, source)
    if ('sale' in result) sales.push(result.sale)
    else
      stats.skipped[result.skipped] = (stats.skipped[result.skipped] ?? 0) + 1
  }
  stats.kept = sales.length
  stats.communes = new Set(sales.map(s => s.inseeCode)).size
  stats.years = [...years].sort((a, b) => a - b)
  return { sales, stats }
}

/** L'URL Etalab d'un fichier départemental annuel. */
export function dvfUrl(year: number, department = '33'): string {
  return `https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/departements/${department}.csv.gz`
}

/**
 * La lignée d'un fichier : `dvf-geo-etalab:<année>/<fichier>` pour une URL
 * Etalab (`…/csv/2024/departements/33.csv.gz`), sinon le nom du fichier
 * local (`33-2024.csv.gz`).
 */
export function sourceLabel(source: string): string {
  const etalab = source.match(/\/csv\/(\d{4})\/departements\/([^/?]+)/)
  return etalab
    ? `dvf-geo-etalab:${etalab[1]}/${etalab[2]}`
    : `dvf-geo-etalab:${source.split(/[\\/]/).pop() ?? source}`
}
