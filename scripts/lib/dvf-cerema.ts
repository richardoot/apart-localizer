import { BORDEAUX_METROPOLE_COMMUNES } from '@apart/contracts'
import {
  DVF_MAX_PRICE_PER_M2,
  DVF_MIN_PRICE_PER_M2,
  DVF_MIN_SURFACE,
  DVF_NATURES,
} from './dvf.js'
import type { DvfSale, DvfStats } from './dvf.js'

/**
 * Ventes d'avant 2021 (lot 29, ADR 0039) : les fichiers DVF géolocalisés
 * d'Etalab ne gardent que cinq ans ; « DVF+ open-data » du Cerema (les mêmes
 * données de la DGFiP, une ligne par mutation, géolocalisée à la parcelle)
 * remonte à 2014. Lecture de son API ouverte, page par page, pour les 28
 * communes de la métropole. La source ne donne ni l'adresse ni le nombre de
 * pièces : ces ventes servent à la tendance, pas à la liste des comparables.
 * Pur hors l'appel réseau (`fetch` injectable) ; aucune base.
 */

/** L'API ouverte « DVF+ open-data » : mutations avec leur géométrie (GeoJSON). */
export const CEREMA_DVF_API =
  'https://apidf-preprod.cerema.fr/dvf_opendata/geomutations/'
/** Typologie DVF+ : « UN APPARTEMENT » (un seul, dépendances comprises, aucun autre local). */
export const CEREMA_SINGLE_APARTMENT = '121'
/** L'API refuse plus de dix communes par requête. */
export const CEREMA_MAX_COMMUNES = 10
/** Taille de page maximale servie par l'API. */
export const CEREMA_PAGE_SIZE = 500
/** Première année de DVF+ open-data. */
export const CEREMA_FIRST_YEAR = 2014

const BM_NAMES = new Map(
  BORDEAUX_METROPOLE_COMMUNES.map(c => [c.inseeCode, c.name])
)

/** L'adresse d'une page de l'API pour une année et un groupe de communes. */
export function ceremaUrl(
  year: number,
  inseeCodes: readonly string[],
  page = 1,
  pageSize: number = CEREMA_PAGE_SIZE
): string {
  const query = new URLSearchParams({
    anneemut: String(year),
    code_insee: inseeCodes.join(','),
    codtypbien: CEREMA_SINGLE_APARTMENT,
    page_size: String(pageSize),
    page: String(page),
  })
  return `${CEREMA_DVF_API}?${query.toString().replace(/%2C/g, ',')}`
}

/** Les communes de la métropole par groupes de dix au plus. */
export function communeGroups(
  inseeCodes: readonly string[] = BORDEAUX_METROPOLE_COMMUNES.map(
    c => c.inseeCode
  ),
  size: number = CEREMA_MAX_COMMUNES
): string[][] {
  const groups: string[][] = []
  for (let i = 0; i < inseeCodes.length; i += size) {
    groups.push(inseeCodes.slice(i, i + size))
  }
  return groups
}

type Ring = readonly (readonly number[])[]

/** Aire signée et centre de gravité d'un anneau (formule du lacet, en degrés : suffisant à l'échelle d'une parcelle). */
function ringCentroid(ring: Ring): { area: number; point: [number, number] } {
  let area = 0
  let x = 0
  let y = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i] as [number, number]
    const [x1, y1] = ring[i + 1] as [number, number]
    const cross = x0 * y1 - x1 * y0
    area += cross
    x += (x0 + x1) * cross
    y += (y0 + y1) * cross
  }
  if (Math.abs(area) < 1e-14) {
    // Anneau dégénéré : la moyenne de ses sommets.
    const n = ring.length || 1
    return {
      area: 0,
      point: [
        ring.reduce((sum, p) => sum + (p[0] as number), 0) / n,
        ring.reduce((sum, p) => sum + (p[1] as number), 0) / n,
      ],
    }
  }
  return { area: Math.abs(area / 2), point: [x / (3 * area), y / (3 * area)] }
}

/**
 * Le repère d'une mutation : le centre de gravité de sa plus grande parcelle
 * (une vente peut porter plusieurs parcelles, le logement et un parking).
 * Null sans géométrie lisible.
 */
export function representativePoint(
  geometry: unknown
): [number, number] | null {
  if (!geometry || typeof geometry !== 'object') return null
  const { type, coordinates } = geometry as {
    type?: string
    coordinates?: unknown
  }
  const polygons =
    type === 'MultiPolygon'
      ? (coordinates as Ring[][])
      : type === 'Polygon'
        ? [coordinates as Ring[]]
        : []
  let best: { area: number; point: [number, number] } | null = null
  for (const polygon of polygons) {
    const outer = Array.isArray(polygon) ? polygon[0] : undefined
    if (!Array.isArray(outer) || outer.length === 0) continue
    const candidate = ringCentroid(outer)
    if (!best || candidate.area > best.area) best = candidate
  }
  if (!best) return null
  const [longitude, latitude] = best.point
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Une mutation de l'API vers une vente, ou la raison de l'écarter : les mêmes
 * règles que les fichiers d'Etalab (un seul appartement, vente ou VEFA,
 * géolocalisée, surface et prix au m² plausibles), dans une seule commune de
 * la métropole.
 */
export function saleOfCeremaFeature(
  feature: unknown,
  source: string
): { sale: DvfSale } | { skipped: string } {
  const { properties, geometry } = (feature ?? {}) as {
    properties?: Record<string, unknown>
    geometry?: unknown
  }
  const p = properties ?? {}
  if (String(p.codtypbien ?? '') !== CEREMA_SINGLE_APARTMENT)
    return { skipped: 'autre qu’un seul appartement' }
  const nature = String(p.libnatmut ?? '')
  if (!DVF_NATURES.has(nature)) return { skipped: `nature « ${nature} »` }
  const codes = Array.isArray(p.l_codinsee) ? p.l_codinsee.map(String) : []
  const inseeCode = codes.length === 1 ? (codes[0] as string) : null
  if (!inseeCode || !BM_NAMES.has(inseeCode))
    return { skipped: 'hors métropole ou sur plusieurs communes' }
  const id = String(p.idopendata ?? p.idmutinvar ?? '')
  const date = String(p.datemut ?? '')
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { skipped: 'sans identifiant ou sans date' }
  const price = toNumber(p.valeurfonc)
  const surface = toNumber(p.sbati)
  if (price === null || price <= 0) return { skipped: 'sans valeur foncière' }
  if (surface === null || surface < DVF_MIN_SURFACE)
    return { skipped: 'surface absente ou < 9 m²' }
  const point = representativePoint(geometry)
  if (!point) return { skipped: 'non géolocalisée' }
  const pricePerM2 = Math.round((price / surface) * 100) / 100
  if (pricePerM2 < DVF_MIN_PRICE_PER_M2 || pricePerM2 > DVF_MAX_PRICE_PER_M2)
    return { skipped: 'prix au m² implausible' }
  return {
    sale: {
      externalId: `dvfplus:${id}`,
      mutationDate: date,
      mutationNature: nature,
      price,
      surface,
      propertyType: 'Appartement',
      rooms: null,
      address: null,
      postalCode: null,
      commune: BM_NAMES.get(inseeCode) ?? null,
      inseeCode,
      latitude: Math.round(point[1] * 1e6) / 1e6,
      longitude: Math.round(point[0] * 1e6) / 1e6,
      pricePerM2,
      source,
    },
  }
}

/** La lignée d'une vente lue à l'API du Cerema. */
export function ceremaSourceLabel(year: number): string {
  return `dvfplus-open-data-cerema:${year}`
}

export interface CeremaReadOptions {
  fetchImpl?: typeof fetch
  /** Essais par page (défaut 4) : l'API répond parfois 502 à une première lecture lourde. */
  attempts?: number
  /** Attente avant un nouvel essai, en millisecondes (défaut 3 000, doublée à chaque essai). */
  retryMs?: number
  inseeCodes?: readonly string[]
  pageSize?: number
  /** Pause entre deux pages, en millisecondes (l'API est publique : on ne la presse pas). */
  pauseMs?: number
  onPage?: (info: { year: number; page: number; read: number }) => void
}

/** Une page, relue après une erreur passagère (réseau, 5xx) ; une erreur 4xx est rendue telle quelle. */
async function fetchPage(
  url: string,
  fetchImpl: typeof fetch,
  options: CeremaReadOptions
): Promise<Response> {
  const attempts = Math.max(1, options.attempts ?? 4)
  let failure = ''
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
      })
      if (response.ok) return response
      failure = String(response.status)
      if (response.status < 500) break
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    }
    if (attempt < attempts) {
      const wait = (options.retryMs ?? 3000) * 2 ** (attempt - 1)
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
    }
  }
  throw new Error(`Lecture impossible (${failure}) : ${url}`)
}

/**
 * Lit une année à l'API : toutes les pages de chaque groupe de communes. Une
 * mutation rendue deux fois (pagination qui bouge) n'est gardée qu'une fois.
 */
export async function readCeremaDvf(
  year: number,
  options: CeremaReadOptions = {}
): Promise<{ sales: DvfSale[]; stats: DvfStats }> {
  const fetchImpl = options.fetchImpl ?? fetch
  const pageSize = options.pageSize ?? CEREMA_PAGE_SIZE
  const source = ceremaSourceLabel(year)
  const stats: DvfStats = {
    lines: 0,
    outsideMetropole: 0,
    mutations: 0,
    kept: 0,
    skipped: {},
    communes: 0,
    years: [year],
  }
  const sales = new Map<string, DvfSale>()
  const seen = new Set<string>()
  for (const group of communeGroups(options.inseeCodes)) {
    let expected: number | null = null
    let read = 0
    for (let page = 1; ; page++) {
      const url = ceremaUrl(year, group, page, pageSize)
      const response = await fetchPage(url, fetchImpl, options)
      const body = (await response.json()) as {
        count?: number
        features?: unknown[]
        next?: string | null
      }
      const features = Array.isArray(body.features) ? body.features : []
      if (expected === null && typeof body.count === 'number')
        expected = body.count
      read += features.length
      for (const feature of features) {
        stats.lines++
        const key = String(
          (feature as { properties?: { idopendata?: unknown } })?.properties
            ?.idopendata ?? `sans-identifiant-${stats.lines}`
        )
        if (seen.has(key)) continue
        seen.add(key)
        stats.mutations++
        const result = saleOfCeremaFeature(feature, source)
        if ('sale' in result) {
          const saleYear = Number(result.sale.mutationDate.slice(0, 4))
          if (saleYear === year) sales.set(result.sale.externalId, result.sale)
          else
            stats.skipped['hors de l’année demandée'] =
              (stats.skipped['hors de l’année demandée'] ?? 0) + 1
        } else {
          stats.skipped[result.skipped] =
            (stats.skipped[result.skipped] ?? 0) + 1
        }
      }
      options.onPage?.({ year, page, read: stats.lines })
      if (!body.next || features.length === 0) break
      if (options.pauseMs) {
        await new Promise(resolve => setTimeout(resolve, options.pauseMs))
      }
    }
    // Une lecture tronquée ne doit pas remplacer une année en base.
    if (expected !== null && read !== expected) {
      throw new Error(
        `Lecture incomplète de ${year} (${read} mutations lues sur ${expected} annoncées) : relance l'import.`
      )
    }
  }
  const list = [...sales.values()]
  stats.kept = list.length
  stats.communes = new Set(list.map(s => s.inseeCode)).size
  return { sales: list, stats }
}
