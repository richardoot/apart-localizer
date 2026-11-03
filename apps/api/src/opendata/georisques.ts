import { z } from 'zod'
import type { GeorisqueHazard, GeorisquesReport, Point } from '@apart/contracts'
import { georisqueLevel } from '@apart/domain'
import type { FetchLike } from './geoplateforme'

/**
 * Client de l'API Géorisques (BRGM, ministère de la Transition écologique),
 * sans état. Version 1, sans jeton : le « rapport des risques près de chez
 * moi » à un point (`resultats_rapport_risque?latlon=lon,lat`) agrège les
 * aléas naturels et technologiques, avec un libellé à l'adresse et dans la
 * commune. Relevé le 3 novembre 2026 (spécification OpenAPI 1.12.2) : limite
 * d'un appel par seconde sur cet endpoint ; la version 2 exige un jeton.
 * Contenus sous licence Etalab 2.0.
 */

export const GEORISQUES_REPORT_ENDPOINT =
  'https://www.georisques.gouv.fr/api/v1/resultats_rapport_risque'

const Hazard = z.object({
  present: z.boolean(),
  libelle: z.string(),
  libelleStatutCommune: z.string().nullish(),
  libelleStatutAdresse: z.string().nullish(),
})

export const GeorisquesRawReportSchema = z.object({
  adresse: z
    .object({
      libelle: z.string().nullish(),
      longitude: z.number().nullish(),
      latitude: z.number().nullish(),
    })
    .nullish(),
  commune: z
    .object({
      libelle: z.string().nullish(),
      codeInsee: z.string().nullish(),
    })
    .nullish(),
  url: z.string().nullish(),
  risquesNaturels: z.record(z.string(), Hazard),
  risquesTechnologiques: z.record(z.string(), Hazard),
})
export type GeorisquesRawReport = z.infer<typeof GeorisquesRawReportSchema>

/** Les paramètres de la requête : le point en `longitude,latitude`, séparateur décimal point. */
export function georisquesParams(point: Point): URLSearchParams {
  const [lng, lat] = point.coordinates
  return new URLSearchParams({ latlon: `${lng.toFixed(6)},${lat.toFixed(6)}` })
}

/** Le rapport brut ; lance sur un échec HTTP ou une réponse illisible. */
export async function fetchGeorisquesReport(
  fetchImpl: FetchLike,
  point: Point,
  options: { endpoint?: string; signal?: AbortSignal } = {}
): Promise<GeorisquesRawReport> {
  const url = `${options.endpoint ?? GEORISQUES_REPORT_ENDPOINT}?${georisquesParams(point).toString()}`
  const response = await fetchImpl(
    url,
    options.signal ? { signal: options.signal } : undefined
  )
  if (!response.ok) throw new Error(`Géorisques : HTTP ${response.status}`)
  const parsed = GeorisquesRawReportSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error('Géorisques : réponse inexploitable')
  return parsed.data
}

function hazards(
  family: GeorisqueHazard['family'],
  entries: Record<string, z.infer<typeof Hazard>>
): GeorisqueHazard[] {
  return Object.entries(entries).map(([key, h]) => ({
    key,
    label: h.libelle,
    family,
    present: h.present,
    communeStatus: h.libelleStatutCommune ?? null,
    addressStatus: h.libelleStatutAdresse ?? null,
    level: georisqueLevel(
      h.present,
      h.libelleStatutAdresse ?? null,
      h.libelleStatutCommune ?? null
    ),
  }))
}

/** Le rapport brut vers le contrat ; le niveau de chaque aléa vient de `domain`. */
export function georisquesReportOf(
  raw: GeorisquesRawReport,
  point: Point,
  fetchedAt: Date
): GeorisquesReport {
  return {
    status: 'ok',
    point,
    address: raw.adresse?.libelle ?? null,
    commune: raw.commune?.libelle ?? null,
    inseeCode: raw.commune?.codeInsee ?? null,
    reportUrl: raw.url && /^https:\/\//.test(raw.url) ? raw.url : null,
    hazards: [
      ...hazards('natural', raw.risquesNaturels),
      ...hazards('technological', raw.risquesTechnologiques),
    ],
    fetchedAt: fetchedAt.toISOString(),
    message: null,
  }
}
