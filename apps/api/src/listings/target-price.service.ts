import { Injectable, NotFoundException } from '@nestjs/common'
import {
  ACTIVE_LISTING_STATUSES,
  CompareResultSchema,
  TargetPriceReportSchema,
} from '@apart/contracts'
import type {
  Assumptions,
  AssumptionsOverride,
  CompareResult,
  EvaluatedListing,
  HypotheticalListing,
  NegotiationBrief,
  SensitivityGrid,
  SensitivityRequest,
  TargetPriceRank,
  TargetPriceReport,
} from '@apart/contracts'
import {
  compareRankings,
  financialsFromListing,
  mergeAssumptions,
  negotiationBrief,
  rankValues,
  sensitivityGrid,
} from '@apart/domain'
import { PrismaService } from '../prisma/prisma.service'
import { AssumptionsService } from '../assumptions/assumptions.service'
import type { Member } from '../generated/prisma'
import { evaluateListing } from './evaluate'
import { listingInclude } from './listing.mapper'
import { ListingsService } from './listings.service'

/**
 * « À partir de quel prix ? » (besoins N1 à N3, N5) : prix cibles, rang
 * parmi les annonces actives, brief de négociation, tableau de sensibilité,
 * comparaison côte à côte. Aucune formule ici : tout vient de `domain`.
 */
@Injectable()
export class TargetPriceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: ListingsService,
    private readonly assumptions: AssumptionsService
  ) {}

  /**
   * Le rapport complet d'une annonce enregistrée. Avec un scénario
   * d'hypothèses, l'évaluation est refaite et le rang (qui compare aux
   * autres annonces sous les hypothèses en vigueur) est omis.
   */
  async report(
    member: Member,
    id: string,
    options: {
      sensitivity?: SensitivityRequest | undefined
      scenario?: AssumptionsOverride | undefined
    } = {}
  ): Promise<TargetPriceReport> {
    const stored = await this.listings.get(member, id)
    const assumptions = mergeAssumptions(
      await this.assumptions.forListing(
        member.workspaceId,
        stored.listing.assumptionsOverride
      ),
      options.scenario ?? null
    )
    const item: EvaluatedListing = options.scenario
      ? { ...stored, evaluation: evaluateListing(stored.listing, assumptions) }
      : stored
    const rank =
      !options.scenario && ACTIVE_LISTING_STATUSES.includes(item.listing.status)
        ? await this.rankAmongActive(member, id)
        : null
    return TargetPriceReportSchema.parse({
      listingId: item.listing.id,
      title: item.listing.title,
      status: item.listing.status,
      price: item.listing.price,
      targetPrice: item.evaluation.targetPrice,
      rank,
      negotiation: briefOf(item, assumptions),
      notaryFees: item.evaluation.metrics.notaryFeesDetail,
      assumptions,
      sensitivity: options.sensitivity
        ? this.grid(item, assumptions, options.sensitivity)
        : null,
    })
  }

  /** Le même rapport pour une annonce hypothétique : sans rang ni historique. */
  async reportForHypothetical(
    member: Member,
    listing: HypotheticalListing,
    scenario: AssumptionsOverride | undefined,
    sensitivity?: SensitivityRequest | undefined
  ): Promise<TargetPriceReport> {
    const result = await this.listings.evaluate(member, {
      listing,
      ...(scenario ? { assumptions: scenario } : {}),
    })
    const metrics = result.evaluation.metrics
    const brief = negotiationBrief(
      {
        price: result.listing.price,
        publishedAt: result.listing.publishedAt,
        createdAt: null,
        dpeClass: result.listing.dpeClass,
        renovationTotal: metrics.renovationTotal,
        annualCharges: result.listing.annualCharges,
        surface: result.listing.surface,
        priceEvents: [],
        offers: [],
      },
      result.evaluation.targetPrice,
      result.assumptions
    )
    return TargetPriceReportSchema.parse({
      listingId: null,
      title: result.listing.title,
      status: null,
      price: result.listing.price,
      targetPrice: result.evaluation.targetPrice,
      rank: null,
      negotiation: brief,
      notaryFees: metrics.notaryFeesDetail,
      assumptions: result.assumptions,
      sensitivity: sensitivity
        ? sensitivityGrid(
            financialsFromListing(result.listing),
            mergeAssumptions(
              result.assumptions,
              sensitivity.assumptions ?? null
            ),
            sensitivity
          )
        : null,
    })
  }

  async negotiation(member: Member, id: string): Promise<NegotiationBrief> {
    return (await this.report(member, id)).negotiation
  }

  async sensitivity(
    member: Member,
    id: string,
    request: SensitivityRequest
  ): Promise<SensitivityGrid> {
    const item = await this.listings.get(member, id)
    const assumptions = await this.assumptions.forListing(
      member.workspaceId,
      item.listing.assumptionsOverride
    )
    return this.grid(item, assumptions, request)
  }

  /** 2 à 6 annonces côte à côte, dans l'ordre demandé, avec leurs rangs. */
  async compare(member: Member, listingIds: string[]): Promise<CompareResult> {
    const rows = await this.prisma.listing.findMany({
      where: { id: { in: listingIds }, workspaceId: member.workspaceId },
      include: listingInclude,
    })
    const missing = listingIds.filter(id => !rows.some(row => row.id === id))
    if (missing.length > 0) {
      throw new NotFoundException(
        `Annonce(s) introuvable(s) : ${missing.join(', ')}`
      )
    }
    const base = await this.assumptions.currentValues(member.workspaceId)
    const byId = new Map(
      rows.map(row => [row.id, this.listings.evaluateRow(row, member, base)])
    )
    const items = listingIds.map(id => byId.get(id) as EvaluatedListing)
    const { ranks, best } = compareRankings(
      items.map(item => ({
        id: item.listing.id,
        score: item.evaluation.metrics.score,
        grossYield: item.evaluation.metrics.grossYield,
        netYield: item.evaluation.metrics.netYield,
        effort: item.evaluation.metrics.effort,
        pricePerM2: item.evaluation.metrics.pricePerM2,
        discount: item.evaluation.targetPrice.discount,
      }))
    )
    return CompareResultSchema.parse({
      items: items.map(item => ({
        ...item,
        ranks: ranks.get(item.listing.id),
      })),
      best,
    })
  }

  /** Rang par décote nécessaire croissante parmi les annonces actives de l'espace. */
  private async rankAmongActive(
    member: Member,
    id: string
  ): Promise<TargetPriceRank | null> {
    const rows = await this.prisma.listing.findMany({
      where: {
        workspaceId: member.workspaceId,
        status: { in: [...ACTIVE_LISTING_STATUSES] },
      },
      include: listingInclude,
    })
    const base = await this.assumptions.currentValues(member.workspaceId)
    const ranked = rows.map(row => {
      const item = this.listings.evaluateRow(row, member, base)
      return { id: row.id, value: item.evaluation.targetPrice.discount }
    })
    const position = rankValues(ranked, 'asc').get(id) ?? null
    if (position === null) return null
    return {
      position,
      total: ranked.filter(r => r.value !== null).length,
    }
  }

  private grid(
    item: EvaluatedListing,
    assumptions: Assumptions,
    request: SensitivityRequest
  ): SensitivityGrid {
    return sensitivityGrid(
      financialsFromListing(item.listing),
      mergeAssumptions(assumptions, request.assumptions ?? null),
      request
    )
  }
}

/** Le brief de négociation d'une annonce vue, avec son historique. */
export function briefOf(
  item: EvaluatedListing,
  assumptions: Assumptions,
  now?: Date
): NegotiationBrief {
  return negotiationBrief(
    {
      price: item.listing.price,
      publishedAt: item.listing.publishedAt,
      createdAt: item.listing.createdAt,
      dpeClass: item.listing.dpeClass,
      renovationTotal: item.evaluation.metrics.renovationTotal,
      annualCharges: item.listing.annualCharges,
      surface: item.listing.surface,
      priceEvents: item.priceEvents,
      offers: item.offers,
    },
    item.evaluation.targetPrice,
    assumptions,
    now ? { now } : {}
  )
}
