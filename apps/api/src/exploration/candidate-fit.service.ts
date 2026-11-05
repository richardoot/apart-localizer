import { Injectable } from '@nestjs/common'
import { NEIGHBOURHOOD_TERRITORY } from '@apart/contracts'
import type {
  Assumptions,
  ListingCriteriaFit,
  ListingInput,
  ListingPlacement,
  LocationPrecision,
  Point,
} from '@apart/contracts'
import {
  NO_MEASURES,
  criteriaFit,
  listingCriteriaFit,
  mergeAssumptions,
} from '@apart/domain'
import type { CriteriaFitCandidate, CriteriaFitMeasures } from '@apart/domain'
import { GeoService } from '../geo/geo.service'
import type { CandidateGeo, ListingAreaRef } from '../geo/geo.service'
import {
  CriteriaMatchService,
  measuresOf,
} from '../listings/criteria-match.service'
import type { FitRule } from '../listings/criteria-match.service'
import { evaluateListing } from '../listings/evaluate'
import { listingAreaRef, metropoleInseeOf } from '../opendata/placement.service'

/** Une annonce pas enregistrée à comparer aux critères : sa fiche et sa zone. */
export interface CandidateFitInput {
  key: string
  listing: ListingInput
  /** La zone du placement (quartier retenu, commune) quand le repère est approché. */
  area: ListingAreaRef | null
}

/** Ce que l'adéquation lit une fois pour tout un lot : les critères actifs et les hypothèses. */
export interface CandidateFitContext {
  rules: FitRule[]
  base: Assumptions
}

/**
 * L'adéquation aux critères actifs (lot 14) d'annonces pas enregistrées
 * (lot 16) : annonces lues par Claude sur un portail, brouillons « À
 * valider ». Même chemin qu'une annonce enregistrée : mesures PostGIS du
 * module geo (une ligne virtuelle par annonce), décision par `domain`
 * (`criteriaFit`, `listingCriteriaFit`). Sans loyer visé, le verdict est
 * inconnu (un filtre de verdict rend « à confirmer »). Rien n'est écrit,
 * aucun appel réseau.
 */
@Injectable()
export class CandidateFitService {
  constructor(
    private readonly geo: GeoService,
    private readonly criteria: CriteriaMatchService
  ) {}

  async context(workspaceId: string): Promise<CandidateFitContext> {
    const [rules, base] = await Promise.all([
      this.criteria.activeRules(workspaceId),
      this.criteria.workspaceAssumptions(workspaceId),
    ])
    return { rules, base }
  }

  /** L'adéquation de chaque annonce, par clé. */
  async fits(
    workspaceId: string,
    items: readonly CandidateFitInput[],
    context?: CandidateFitContext
  ): Promise<Map<string, ListingCriteriaFit>> {
    const { rules, base } = context ?? (await this.context(workspaceId))
    const result = new Map<string, ListingCriteriaFit>()
    if (items.length === 0) return result
    const needsGeo = rules.some(
      r => r.perimeterType !== null || r.filters.maxTramDistanceMeters !== null
    )
    const measures = new Map<string, CriteriaFitMeasures>()
    if (needsGeo) {
      const points: CandidateGeo[] = items.map(item => ({
        key: item.key,
        point: item.listing.location.point,
        precision: item.listing.location.precision,
        area: item.area,
      }))
      const rows = await this.geo.criteriaFitMeasuresForPoints(
        workspaceId,
        rules.map(r => r.id),
        points
      )
      for (const row of rows) {
        measures.set(`${row.listing_id}:${row.criteria_id}`, measuresOf(row))
      }
    }
    const now = new Date().toISOString()
    for (const item of items) {
      const candidate = candidateOf(item.listing, base)
      const entries = rules.map(rule => {
        const fit = criteriaFit(
          rule,
          candidate,
          measures.get(`${item.key}:${rule.id}`) ?? NO_MEASURES
        )
        return {
          criteriaId: rule.id,
          name: rule.name,
          level: fit.level,
          reasons: fit.reasons,
          checks: fit.checks,
          locationPending: fit.locationPending,
          since: now,
        }
      })
      result.set(
        item.key,
        listingCriteriaFit({
          entries,
          since: null,
          status: 'to_study',
          plannedVisits: 0,
        })
      )
    }
    return result
  }

  /**
   * La zone et, faute de repère, un repère hors ligne d'une fiche déjà
   * localisée (brouillon) : le placement enregistré donne la zone ; une
   * fiche sans repère dont la commune est dans la métropole prend le point
   * intérieur et le contour de sa commune (sans géocodeur).
   */
  async offlineLocation(
    listing: ListingInput,
    placement: ListingPlacement | null
  ): Promise<{ listing: ListingInput; area: ListingAreaRef | null }> {
    const location = listing.location
    if (location.point) {
      return {
        listing,
        area: listingAreaRef({
          precision: location.precision,
          inseeCode: location.inseeCode,
          placement,
        }),
      }
    }
    const inseeCode = location.inseeCode ?? metropoleInseeOf(location.commune)
    if (!inseeCode) return { listing, area: null }
    const point: Point | null = await this.geo
      .communeInteriorPoint(NEIGHBOURHOOD_TERRITORY, inseeCode)
      .catch(() => null)
    if (!point) return { listing, area: null }
    const precision: LocationPrecision = 'commune'
    return {
      listing: { ...listing, location: { ...location, point, precision } },
      area: { kind: 'commune', territory: NEIGHBOURHOOD_TERRITORY, inseeCode },
    }
  }
}

/** Ce que les filtres d'un critère lisent d'une fiche pas enregistrée. */
export function candidateOf(
  listing: ListingInput,
  base: Assumptions
): CriteriaFitCandidate {
  const rent = listing.rentalPlan?.targetRent ?? null
  const verdict =
    rent !== null && rent > 0
      ? evaluateListing(
          listing,
          mergeAssumptions(base, listing.assumptionsOverride)
        ).metrics.verdict
      : null
  return {
    price: listing.price,
    surface: listing.surface,
    rooms: listing.rooms,
    dpeClass: listing.dpeClass,
    commune: listing.location.commune,
    verdict,
  }
}
