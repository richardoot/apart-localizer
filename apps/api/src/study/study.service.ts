import { Injectable } from '@nestjs/common'
import type {
  Assumptions,
  AssumptionsOverride,
  EvaluatedListing,
  OccupancyReport,
  ProjectionReport,
  ProjectionRequest,
  ScenarioComparison,
  ScenarioOverrides,
} from '@apart/contracts'
import {
  compareScenario,
  mergeAssumptions,
  occupancyReport,
  projection,
  studyInputFromListing,
} from '@apart/domain'
import type { StudyInput } from '@apart/domain'
import { AssumptionsService } from '../assumptions/assumptions.service'
import { ListingsService } from '../listings/listings.service'
import type { Member } from '../generated/prisma'

/** Ce qu'une étude d'annonce lit : l'annonce vue, ses hypothèses, l'entrée du domaine. */
export interface StudyContext {
  item: EvaluatedListing
  assumptions: Assumptions
  input: StudyInput
  at: Date
}

/**
 * Études d'une annonce enregistrée (lot 5) : coût d'occupation en phase 1
 * (E3), projection fiscale jusqu'à la revente (E6, E7), comparaison d'un
 * scénario à la base (E4). Aucune formule ici : l'entrée vient de
 * `studyInputFromListing`, les calculs de `domain`.
 */
@Injectable()
export class StudyService {
  constructor(
    private readonly listings: ListingsService,
    private readonly assumptions: AssumptionsService
  ) {}

  /** L'annonce, ses hypothèses (surcharge de l'annonce, puis scénario éventuel) et l'entrée de l'étude. */
  async context(
    member: Member,
    id: string,
    scenario?: AssumptionsOverride | null
  ): Promise<StudyContext> {
    const item = await this.listings.get(member, id)
    const base = await this.assumptions.forListing(
      member.workspaceId,
      item.listing.assumptionsOverride
    )
    const at = new Date()
    return {
      item,
      assumptions: mergeAssumptions(base, scenario ?? null),
      input: studyInputFromListing(item.listing, at),
      at,
    }
  }

  async occupancy(member: Member, id: string): Promise<OccupancyReport> {
    const ctx = await this.context(member, id)
    return occupancyReport(ctx.input, ctx.assumptions, {
      at: ctx.at,
      listingId: id,
    })
  }

  async projection(
    member: Member,
    id: string,
    request: ProjectionRequest = {}
  ): Promise<ProjectionReport> {
    const ctx = await this.context(member, id, request.assumptions)
    return projection(ctx.input, ctx.assumptions, {
      at: ctx.at,
      horizonYears: request.horizonYears,
      regime: request.regime,
      listingId: id,
      title: ctx.item.listing.title,
    })
  }

  async compare(
    member: Member,
    id: string,
    overrides: ScenarioOverrides,
    scenario: { id: string | null; name: string | null } = {
      id: null,
      name: null,
    }
  ): Promise<ScenarioComparison> {
    const ctx = await this.context(member, id)
    return compareScenario(ctx.input, ctx.assumptions, overrides, {
      at: ctx.at,
      listingId: id,
      title: ctx.item.listing.title,
      scenario,
    })
  }
}
