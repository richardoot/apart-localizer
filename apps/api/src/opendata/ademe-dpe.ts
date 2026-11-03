import { z } from 'zod'
import { DpeClassSchema } from '@apart/contracts'
import type { DpeCandidate } from '@apart/contracts'
import type { FetchLike } from './geoplateforme'

/**
 * Client de l'observatoire DPE de l'ADEME (API data-fair), sans état. Jeu
 * « DPE Logements existants (depuis juillet 2021) », identifiant
 * `dpe03existant` (relevé le 3 novembre 2026 : 15,9 millions de DPE,
 * Licence Ouverte 2.0). Champs vérifiés sur le schéma du jeu.
 */

export const ADEME_DPE_DATASET = 'dpe03existant'
export const ADEME_DPE_ENDPOINT = `https://data.ademe.fr/data-fair/api/v1/datasets/${ADEME_DPE_DATASET}/lines`

/** Les colonnes lues (le jeu en compte 230). */
export const ADEME_DPE_FIELDS = [
  'numero_dpe',
  'date_etablissement_dpe',
  'date_fin_validite_dpe',
  'etiquette_dpe',
  'etiquette_ges',
  'conso_5_usages_par_m2_ep',
  'emission_ges_5_usages_par_m2',
  'surface_habitable_logement',
  'numero_etage_appartement',
  'adresse_ban',
  'complement_adresse_logement',
  'identifiant_ban',
  'type_batiment',
] as const

/** Nombre maximal de DPE rapatriés par recherche. */
export const ADEME_DPE_PAGE = 30

export type DpeQuery =
  | { method: 'ban_id'; banId: string }
  | { method: 'commune_surface'; inseeCode: string; surface: number }

/** Échappe une valeur pour la syntaxe de requête (Lucene) de data-fair. */
function quoted(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

/** Les paramètres de la requête : appartements à l'adresse BAN, sinon dans la commune à ±1 m². */
export function dpeSearchParams(query: DpeQuery): URLSearchParams {
  const qs =
    query.method === 'ban_id'
      ? `identifiant_ban:${quoted(query.banId)} AND type_batiment:appartement`
      : `code_insee_ban:${quoted(query.inseeCode)} AND type_batiment:appartement AND surface_habitable_logement:[${Math.max(0, query.surface - 1)} TO ${query.surface + 1}]`
  return new URLSearchParams({
    qs,
    size: String(ADEME_DPE_PAGE),
    select: ADEME_DPE_FIELDS.join(','),
    sort: '-date_etablissement_dpe',
  })
}

const AdemeLine = z.object({
  numero_dpe: z.string(),
  date_etablissement_dpe: z.string(),
  date_fin_validite_dpe: z.string().nullish(),
  etiquette_dpe: z.string(),
  etiquette_ges: z.string().nullish(),
  conso_5_usages_par_m2_ep: z.number().nullish(),
  emission_ges_5_usages_par_m2: z.number().nullish(),
  surface_habitable_logement: z.number().nullish(),
  numero_etage_appartement: z.number().nullish(),
  adresse_ban: z.string().nullish(),
  complement_adresse_logement: z.string().nullish(),
  identifiant_ban: z.string().nullish(),
  type_batiment: z.string().nullish(),
})

const AdemeResponse = z.object({
  total: z.number(),
  results: z.array(z.unknown()),
})

const isoDate = (value: string | null | undefined): string | null => {
  if (!value) return null
  const day = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/** Une ligne de l'ADEME vers un candidat ; null si elle est illisible (classe hors A à G...). */
export function candidateOfLine(
  line: unknown
): Omit<DpeCandidate, 'matchScore'> | null {
  const parsed = AdemeLine.safeParse(line)
  if (!parsed.success) return null
  const l = parsed.data
  const dpeClass = DpeClassSchema.safeParse(l.etiquette_dpe)
  const issuedAt = isoDate(l.date_etablissement_dpe)
  if (!dpeClass.success || !issuedAt) return null
  const ges = DpeClassSchema.safeParse(l.etiquette_ges)
  return {
    number: l.numero_dpe,
    issuedAt,
    validUntil: isoDate(l.date_fin_validite_dpe),
    dpeClass: dpeClass.data,
    gesClass: ges.success ? ges.data : null,
    consumption: l.conso_5_usages_par_m2_ep ?? null,
    emissions: l.emission_ges_5_usages_par_m2 ?? null,
    surface: l.surface_habitable_logement ?? null,
    floor:
      l.numero_etage_appartement !== null &&
      l.numero_etage_appartement !== undefined &&
      Number.isInteger(l.numero_etage_appartement)
        ? l.numero_etage_appartement
        : null,
    address: l.adresse_ban ?? null,
    complement: l.complement_adresse_logement ?? null,
    banId: l.identifiant_ban ?? null,
    buildingType: l.type_batiment ?? null,
  }
}

/** Une recherche ; lance sur un échec HTTP ou une réponse illisible. */
export async function searchAdemeDpe(
  fetchImpl: FetchLike,
  query: DpeQuery,
  options: { endpoint?: string; signal?: AbortSignal } = {}
): Promise<{ total: number; candidates: Omit<DpeCandidate, 'matchScore'>[] }> {
  const url = `${options.endpoint ?? ADEME_DPE_ENDPOINT}?${dpeSearchParams(query).toString()}`
  const response = await fetchImpl(
    url,
    options.signal ? { signal: options.signal } : undefined
  )
  if (!response.ok) throw new Error(`ADEME DPE : HTTP ${response.status}`)
  const parsed = AdemeResponse.safeParse(await response.json())
  if (!parsed.success) throw new Error('ADEME DPE : réponse inexploitable')
  const candidates = parsed.data.results
    .map(candidateOfLine)
    .filter((c): c is Omit<DpeCandidate, 'matchScore'> => c !== null)
  return { total: parsed.data.total, candidates }
}
