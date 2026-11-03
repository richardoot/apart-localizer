import { ACTIVE_LISTING_STATUSES, DpeClassSchema } from '@apart/contracts'
import type {
  CriteriaFilters,
  DpeClass,
  ListingStatus,
  Verdict,
} from '@apart/contracts'
import { normalizeCommune } from './rent-control.js'

/**
 * Les filtres métier d'un critère de recherche (besoin G3), appliqués à une
 * annonce évaluée. Le périmètre et la distance au tram sont évalués par
 * PostGIS ; tout le reste passe ici, de la même façon pour la liste, la
 * carte, le MCP, les compteurs et les alertes.
 */

export type CriteriaFailure =
  | 'commune'
  | 'price_min'
  | 'price_max'
  | 'surface_min'
  | 'rooms_min'
  | 'dpe_max'
  | 'verdict'
  | 'status'

export interface CriteriaCandidate {
  price: number
  surface: number | null
  rooms: number | null
  dpeClass: DpeClass | null
  status: ListingStatus
  commune: string | null
  verdict: Verdict
}

/** Les classes DPE acceptées par une classe maximale (D → A, B, C, D). */
export function dpeClassesUpTo(max: DpeClass): DpeClass[] {
  const all = DpeClassSchema.options
  return all.slice(0, all.indexOf(max) + 1)
}

/** Vrai si l'annonce passe tous les filtres ; la liste des filtres en échec sinon. */
export function criteriaFilterMatch(
  candidate: CriteriaCandidate,
  filters: CriteriaFilters
): { matches: boolean; failures: CriteriaFailure[] } {
  const failures: CriteriaFailure[] = []
  const statuses = filters.statuses.length
    ? filters.statuses
    : ACTIVE_LISTING_STATUSES
  if (!statuses.includes(candidate.status)) failures.push('status')
  if (filters.communes.length) {
    const wanted = filters.communes.map(normalizeCommune)
    if (!wanted.includes(normalizeCommune(candidate.commune))) {
      failures.push('commune')
    }
  }
  if (filters.priceMin !== null && candidate.price < filters.priceMin) {
    failures.push('price_min')
  }
  if (filters.priceMax !== null && candidate.price > filters.priceMax) {
    failures.push('price_max')
  }
  if (
    filters.surfaceMin !== null &&
    (candidate.surface === null || candidate.surface < filters.surfaceMin)
  ) {
    failures.push('surface_min')
  }
  if (
    filters.roomsMin !== null &&
    (candidate.rooms === null || candidate.rooms < filters.roomsMin)
  ) {
    failures.push('rooms_min')
  }
  if (
    filters.dpeMax !== null &&
    candidate.dpeClass !== null &&
    !dpeClassesUpTo(filters.dpeMax).includes(candidate.dpeClass)
  ) {
    failures.push('dpe_max')
  }
  if (
    filters.verdicts.length &&
    !filters.verdicts.includes(candidate.verdict)
  ) {
    failures.push('verdict')
  }
  return { matches: failures.length === 0, failures }
}
