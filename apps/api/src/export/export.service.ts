import { Injectable } from '@nestjs/common'
import {
  CriteriaFitLevelSchema,
  EXPORT_FORMAT_ID,
  EXPORT_FORMAT_VERSION,
  ExportDocumentSchema,
  LISTING_PAGE_MAX,
  ListingStatusSchema,
  listingFiltersFromQuery,
} from '@apart/contracts'
import type {
  EvaluatedListing,
  ExportDocument,
  ExportQuery,
  ListingFilters,
  Visit,
} from '@apart/contracts'
import { AssumptionsService } from '../assumptions/assumptions.service'
import { ListingsService } from '../listings/listings.service'
import { PrismaService } from '../prisma/prisma.service'
import { toListingCheckDto } from '../listings/listing.mapper'
import { toSearchCriteriaDto } from '../search-criteria/search-criteria.mapper'
import { toRentComparableDto, toScenarioDto } from '../study/study.mapper'
import { VisitsService } from '../visits/visits.service'
import {
  explorationDetailInclude,
  toExplorationDetail,
} from '../exploration/exploration.mapper'
import { AgencyRequestsService } from '../agency-requests/agency-requests.service'
import { MEMBER_ORDER } from '../workspace/member-order'
import type { Member } from '../generated/prisma'
import { LISTING_CSV_COLUMNS, listingCsvRow, toCsv } from './csv'

export interface ExportFile {
  filename: string
  contentType: string
  body: string
}

/**
 * L'export de l'espace (portabilité) : toutes les annonces, ou la sélection
 * courante (filtres de la liste et identifiants cochés), en CSV pour un
 * tableur ou en JSON complet et versionné. Réservé aux membres : le garde
 * Supabase résout le membre, et rien ne sort d'un autre espace.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: ListingsService,
    private readonly assumptions: AssumptionsService,
    private readonly visits: VisitsService,
    private readonly agency: AgencyRequestsService
  ) {}

  /** Les annonces exportées, évaluées par `domain` comme dans la liste. */
  async selectListings(
    member: Member,
    query: ExportQuery
  ): Promise<EvaluatedListing[]> {
    const { format: _format, scope, ids, ...listQuery } = query
    const filters: ListingFilters =
      scope === 'workspace'
        ? listingFiltersFromQuery({
            sort: listQuery.sort,
            order: listQuery.order,
            status: [...ListingStatusSchema.options],
            // Lot 14 : toute l'adéquation, hors critères compris.
            fit: [...CriteriaFitLevelSchema.options],
          })
        : listingFiltersFromQuery(listQuery)
    const items: EvaluatedListing[] = []
    for (let page = 1; ; page += 1) {
      const result = await this.listings.list(member, {
        ...filters,
        page,
        limit: LISTING_PAGE_MAX,
      })
      items.push(...result.items)
      if (page >= result.pageCount) break
    }
    return ids?.length
      ? items.filter(item => ids.includes(item.listing.id))
      : items
  }

  async export(member: Member, query: ExportQuery): Promise<ExportFile> {
    const items = await this.selectListings(member, query)
    const visits = await this.visits.listWithoutPhotos(
      member,
      items.map(i => i.listing.id)
    )
    const stamp = new Date().toISOString().slice(0, 10)
    if (query.format === 'csv') {
      const counts = new Map<string, number>()
      for (const visit of visits) {
        counts.set(visit.listingId, (counts.get(visit.listingId) ?? 0) + 1)
      }
      return {
        filename: `apart-localizer-${stamp}.csv`,
        contentType: 'text/csv; charset=utf-8',
        body: toCsv(
          LISTING_CSV_COLUMNS,
          items.map(item =>
            listingCsvRow(item, counts.get(item.listing.id) ?? 0)
          )
        ),
      }
    }
    const document = await this.document(member, query, items, visits)
    return {
      filename: `apart-localizer-${stamp}.json`,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(
        document,
        (_key, value: unknown) =>
          typeof value === 'number' && !Number.isFinite(value) ? null : value,
        2
      ),
    }
  }

  async document(
    member: Member,
    query: ExportQuery,
    items: EvaluatedListing[],
    visits: Visit[]
  ): Promise<ExportDocument> {
    const ids = items.map(i => i.listing.id)
    const [
      workspace,
      current,
      history,
      criteria,
      scenarios,
      comparables,
      checks,
      explorations,
      exchanges,
    ] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: member.workspaceId },
        // Membres actifs et anciens (auteurs d'avis, de tâches, de visites) ;
        // pas les invitations.
        include: {
          members: {
            where: { status: { in: ['active', 'removed'] } },
            orderBy: MEMBER_ORDER,
          },
        },
      }),
      this.assumptions.current(member.workspaceId),
      this.assumptions.history(member.workspaceId),
      this.prisma.searchCriteria.findMany({
        where: { workspaceId: member.workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.scenario.findMany({
        where: {
          workspaceId: member.workspaceId,
          OR: [{ listingId: null }, { listingId: { in: ids } }],
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.rentComparable.findMany({
        where: { listingId: { in: ids } },
        orderBy: { createdAt: 'asc' },
      }),
      // Lot 15 : les vérifications sur le portail.
      this.prisma.listingCheck.findMany({
        where: { workspaceId: member.workspaceId, listingId: { in: ids } },
        orderBy: { checkedAt: 'desc' },
        include: {
          linkedListing: { select: { id: true, title: true, status: true } },
        },
      }),
      // Lot 16 : les explorations des portails par Claude, avec leurs lignes.
      this.prisma.exploration.findMany({
        where: { workspaceId: member.workspaceId },
        orderBy: { finishedAt: 'desc' },
        include: explorationDetailInclude,
      }),
      // Lot 17 : contact de l'annonceur et demandes.
      this.agency.forExport(member, items),
    ])
    const byListing = <T extends { listingId: string }>(rows: T[]) => {
      const map = new Map<string, T[]>()
      for (const row of rows) {
        map.set(row.listingId, [...(map.get(row.listingId) ?? []), row])
      }
      return map
    }
    const visitsOf = byListing(visits)
    const comparablesOf = byListing(comparables.map(toRentComparableDto))
    const checksOf = byListing(checks.map(toListingCheckDto))
    // Les NaN (surface ou coût nul) restent des nombres ici ; ils deviennent
    // null à l'écriture du fichier.
    return ExportDocumentSchema.parse({
      format: EXPORT_FORMAT_ID,
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      scope: query.scope,
      workspace: { id: workspace.id, name: workspace.name },
      members: workspace.members.map(m => ({
        id: m.id,
        handle: m.handle,
        displayName: m.displayName,
      })),
      assumptions: { current, history },
      listings: items.map(item => ({
        listing: item.listing,
        indicators: {
          metrics: item.evaluation.metrics,
          rentalVerdict: item.evaluation.rental.verdict,
          targetPrice: item.evaluation.targetPrice,
        },
        opinions: item.opinions,
        tasks: item.tasks,
        priceEvents: item.priceEvents,
        offers: item.offers,
        visits: (visitsOf.get(item.listing.id) ?? []).map(
          ({ photos: _photos, ...visit }) => visit
        ),
        rentComparables: comparablesOf.get(item.listing.id) ?? [],
        checks: checksOf.get(item.listing.id) ?? [],
        criteriaFit: item.criteriaFit,
        contact: exchanges.contacts.get(item.listing.id) ?? null,
        agencyRequests: exchanges.requests.get(item.listing.id) ?? [],
      })),
      searchCriteria: criteria.map(toSearchCriteriaDto),
      scenarios: scenarios.map(toScenarioDto),
      explorations: explorations.map(toExplorationDetail),
    })
  }
}
