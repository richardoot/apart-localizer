import { Injectable, Logger } from '@nestjs/common'
import type {
  DpeCandidate,
  DpeClass,
  DpeSearchResult,
  LocationPrecision,
} from '@apart/contracts'
import { dpeMatchScore, dpeSearchDecision } from '@apart/domain'
import type { FetchLike } from './geoplateforme'
import { ADEME_DPE_ENDPOINT, searchAdemeDpe } from './ademe-dpe'
import type { DpeQuery } from './ademe-dpe'
import { ReferenceCacheService } from './reference-cache.service'

export const DPE_CACHE_KIND = 'ademe_dpe'
/** Le jeu ADEME est mis à jour chaque semaine : une recherche vaut sept jours. */
export const DPE_CACHE_MAX_AGE_MS = 7 * 24 * 3600 * 1000
export const DPE_TIMEOUT_MS = 8000

export interface DpeTarget {
  banId: string | null
  inseeCode: string | null
  precision: LocationPrecision | null
  surface: number | null
  floor: number | null
  declaredClass: DpeClass | null
}

/** La requête possible pour une annonce : adresse BAN exacte, sinon commune et surface. */
export function dpeQueryFor(target: DpeTarget): DpeQuery | null {
  if (target.banId && target.precision === 'exact') {
    return { method: 'ban_id', banId: target.banId }
  }
  if (target.inseeCode && target.surface !== null && target.surface > 0) {
    return {
      method: 'commune_surface',
      inseeCode: target.inseeCode,
      surface: Math.round(target.surface),
    }
  }
  return null
}

/**
 * DPE vérifié (besoin L3) : cherche les DPE « logements existants » de
 * l'ADEME pour une annonce, note leur ressemblance (domain) et dit s'il y en
 * a un à appliquer d'office. Une recherche par commune et surface n'est
 * jamais appliquée d'office (les adresses diffèrent). Ne lance jamais : une
 * panne rend le statut `unavailable`. Cache en base sept jours.
 */
@Injectable()
export class DpeService {
  private readonly logger = new Logger(DpeService.name)
  fetchImpl: FetchLike = (url, init) => globalThis.fetch(url, init)
  readonly endpoint = process.env.ADEME_DPE_URL || ADEME_DPE_ENDPOINT

  constructor(private readonly cache: ReferenceCacheService) {}

  async search(
    target: DpeTarget,
    now: Date = new Date()
  ): Promise<{ result: DpeSearchResult; apply: DpeCandidate | null }> {
    const query = dpeQueryFor(target)
    const searchedAt = now.toISOString()
    if (!query) {
      return {
        result: {
          status: 'none',
          method: 'none',
          query: {},
          candidates: [],
          total: 0,
          searchedAt,
          message:
            'Recherche impossible : il faut une adresse exacte (identifiant BAN), ou le code INSEE de la commune et la surface (relance le géocodage).',
        },
        apply: null,
      }
    }
    const queryRecord = Object.fromEntries(
      Object.entries(query).map(([k, v]) => [k, String(v)])
    )
    const key = JSON.stringify(query)
    let found: { total: number; candidates: Omit<DpeCandidate, 'matchScore'>[] }
    try {
      const cached = await this.cache.get<typeof found>(
        DPE_CACHE_KIND,
        key,
        DPE_CACHE_MAX_AGE_MS
      )
      if (cached) {
        found = cached.payload
      } else {
        found = await searchAdemeDpe(this.fetchImpl, query, {
          endpoint: this.endpoint,
          signal: AbortSignal.timeout(DPE_TIMEOUT_MS),
        })
        await this.cache.set(DPE_CACHE_KIND, key, found)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Recherche DPE impossible : ${message}`)
      return {
        result: {
          status: 'unavailable',
          method: query.method,
          query: queryRecord,
          candidates: [],
          total: 0,
          searchedAt,
          message: `Observatoire DPE de l'ADEME indisponible (${message}).`,
        },
        apply: null,
      }
    }
    const candidates: DpeCandidate[] = found.candidates
      .map(c => ({
        ...c,
        matchScore: dpeMatchScore(c, {
          surface: target.surface,
          floor: target.floor,
        }),
      }))
      .sort(
        (a, b) =>
          b.matchScore - a.matchScore || b.issuedAt.localeCompare(a.issuedAt)
      )
    const decision = dpeSearchDecision(candidates, target.declaredClass)
    const byAddress = query.method === 'ban_id'
    const status =
      decision.status === 'verified' && !byAddress
        ? candidates.length === 1
          ? 'single'
          : 'multiple'
        : decision.status
    const apply = byAddress ? decision.apply : null
    return {
      result: {
        status,
        method: query.method,
        query: queryRecord,
        candidates,
        total: found.total,
        searchedAt,
        message: messageFor(status, found.total, byAddress),
      },
      apply,
    }
  }
}

function messageFor(
  status: DpeSearchResult['status'],
  total: number,
  byAddress: boolean
): string {
  switch (status) {
    case 'verified':
      return "Un seul DPE de l'ADEME correspond à l'annonce (adresse, surface, étage) : appliqué comme DPE vérifié."
    case 'single':
      return byAddress
        ? "Un DPE trouvé à l'adresse, à confirmer : surface, étage ou classe ne correspondent pas tout à fait."
        : 'Un DPE trouvé dans la commune pour cette surface, à une autre adresse peut-être : à confirmer.'
    case 'multiple':
      return `${total} DPE trouvés${byAddress ? " à l'adresse" : ' dans la commune pour cette surface'} : choisis celui du logement.`
    default:
      return byAddress
        ? "Aucun DPE de logement existant à cette adresse à l'ADEME."
        : 'Aucun DPE dans la commune pour cette surface.'
  }
}
