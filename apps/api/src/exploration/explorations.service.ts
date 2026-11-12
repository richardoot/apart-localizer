import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  EXPLORATION_LINK_PORTAL,
  EXPLORATION_PORTAL_LABELS,
  ListingCheckInputSchema,
  NEIGHBOURHOOD_TERRITORY,
  criteriaPortalsOf,
} from '@apart/contracts'
import type {
  ActivityChannel,
  BriefCriteriaInput,
  ExplorationDetail,
  ExplorationListQuery,
  ExplorationRecord,
  ExplorationRecordResult,
  ExplorationSummary,
  SearchBrief,
  TriageRequest,
  TriageResult,
} from '@apart/contracts'
import {
  briefZones,
  candidateEvidence,
  candidateObserved,
  candidateExcerpt,
  explorationCounts,
  explorationSummaryText,
  knownLineText,
  outDigest,
  perimeterLabel,
  searchBrief,
} from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { GeoService } from '../geo/geo.service'
import { countedStatuses, fitRuleOf } from '../listings/criteria-match.service'
import { ListingChecksService } from '../listings/listing-checks.service'
import { ListingLinksService } from '../listings/listing-links.service'
import type { LinkAddInput } from '../listings/listing-links.service'
import { PrismaService } from '../prisma/prisma.service'
import { perimeterOf } from '../search-criteria/search-criteria.mapper'
import { isUniqueViolation } from '../workspace/workspace.service'
import { Prisma } from '../generated/prisma'
import type {
  Member,
  SearchCriteria as SearchCriteriaRow,
} from '../generated/prisma'
import {
  explorationDetailInclude,
  explorationInclude,
  toExplorationDetail,
  toExplorationSummary,
} from './exploration.mapper'
import { ExplorationTriageService } from './exploration-triage.service'

/** Les explorations rendues au brief (bandeau, « dernières explorations »). */
const BRIEF_EXPLORATIONS = 5

/**
 * L'exploration par les critères (lot 16, ADR 0026) : le brief (ce que
 * Claude cherche), le tri à blanc des annonces lues, l'enregistrement d'une
 * exploration (le serveur retrie chaque annonce : il ne fait pas confiance
 * au client), son compte rendu. Claude n'ajoute jamais une annonce : toute
 * annonce gardée devient un brouillon « À valider » ; une annonce déjà
 * suivie revue au même lien devient une vérification du lot 15 ; une
 * annonce hors critères n'est qu'une ligne du compte rendu. Journalisé ;
 * aucune page de portail n'est téléchargée.
 */
@Injectable()
export class ExplorationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly geo: GeoService,
    private readonly triageService: ExplorationTriageService,
    private readonly checks: ListingChecksService,
    private readonly links: ListingLinksService
  ) {}

  async list(
    member: Member,
    query: ExplorationListQuery
  ): Promise<ExplorationSummary[]> {
    const rows = await this.prisma.exploration.findMany({
      where: {
        workspaceId: member.workspaceId,
        ...(query.criteriaId
          ? { criteria: { array_contains: [{ id: query.criteriaId }] } }
          : {}),
      },
      include: explorationInclude,
      orderBy: { finishedAt: 'desc' },
      take: query.limit,
    })
    return rows.map(toExplorationSummary)
  }

  async get(member: Member, id: string): Promise<ExplorationDetail> {
    const row = await this.prisma.exploration.findFirst({
      where: { id, workspaceId: member.workspaceId },
      include: explorationDetailInclude,
    })
    if (!row) throw new NotFoundException('Exploration introuvable')
    return toExplorationDetail(row)
  }

  /** Toutes les explorations de l'espace, lignes comprises (export). */
  async all(workspaceId: string): Promise<ExplorationDetail[]> {
    const rows = await this.prisma.exploration.findMany({
      where: { workspaceId },
      include: explorationDetailInclude,
      orderBy: { finishedAt: 'desc' },
    })
    return rows.map(toExplorationDetail)
  }

  /**
   * Le brief : les critères actifs (ou un critère, archivé compris), marges
   * comprises, leurs zones (contours recoupés par le périmètre élargi de la
   * marge, module geo), les portails cochés et leurs liens fabriqués sans
   * réseau, ce qui est déjà suivi, écarté ou à valider, les dernières
   * explorations et les règles.
   */
  async brief(member: Member, criteriaId?: string): Promise<SearchBrief> {
    const workspaceId = member.workspaceId
    const rows = await this.prisma.searchCriteria.findMany({
      where: criteriaId
        ? { id: criteriaId, workspaceId }
        : { workspaceId, active: true },
      orderBy: { createdAt: 'asc' },
    })
    if (criteriaId && rows.length === 0) {
      throw new NotFoundException('Critère introuvable')
    }
    const criteria = await Promise.all(rows.map(row => this.briefInput(row)))
    const [tracked, discarded, dismissedDrafts, pending, explorations] =
      await Promise.all([
        this.prisma.listing.count({
          where: { workspaceId, status: { not: 'discarded' } },
        }),
        this.prisma.listing.count({
          where: { workspaceId, status: 'discarded', mergedIntoId: null },
        }),
        this.prisma.listingDraft.count({
          // Lot 31 : un brouillon absorbé ne compte pas à part.
          where: { workspaceId, status: 'dismissed', mergedIntoDraftId: null },
        }),
        this.prisma.listingDraft.count({
          where: { workspaceId, status: 'pending' },
        }),
        this.list(member, {
          limit: BRIEF_EXPLORATIONS,
          ...(criteriaId ? { criteriaId } : {}),
        }),
      ])
    return searchBrief({
      criteria,
      known: { tracked, dismissed: discarded + dismissedDrafts, pending },
      explorations,
      now: new Date().toISOString(),
    })
  }

  /** Ce que le brief lit d'un critère : règle, zones, portails, annonces gardées. */
  private async briefInput(
    row: SearchCriteriaRow
  ): Promise<BriefCriteriaInput> {
    const rule = fitRuleOf(row)
    const perimeter = perimeterOf(row)
    const zones =
      row.perimeterType === null
        ? []
        : await this.geo
            .criteriaZones(
              row.workspaceId,
              row.id,
              rule.tolerance.perimeterMeters,
              NEIGHBOURHOOD_TERRITORY
            )
            .then(found =>
              briefZones(
                found.map(z => ({
                  kind: z.kind,
                  name: z.name,
                  commune: z.commune,
                  inseeCode: z.insee_code,
                  share: z.share,
                }))
              )
            )
    const listingCount = await this.prisma.criteriaMatch.count({
      where: {
        criteriaId: row.id,
        level: { not: 'out' },
        listing: { status: { in: [...countedStatuses(rule)] } },
      },
    })
    return {
      id: row.id,
      name: row.name,
      active: row.active,
      perimeterType: row.perimeterType,
      perimeterLabel: perimeterLabel(perimeter),
      filters: rule.filters,
      tolerance: rule.tolerance,
      portals: criteriaPortalsOf(row.portals),
      zones,
      listingCount,
    }
  }

  /** `triage_candidates` : la décision pour chaque annonce lue ; rien n'est écrit. */
  async triage(member: Member, request: TriageRequest): Promise<TriageResult> {
    const run = await this.triageService.triage(member, request.candidates)
    const items = run.items.map(i => i.triage)
    const counts = explorationCounts(items)
    return {
      items,
      counts,
      activeCriteria: run.activeCriteria,
      summary: `${explorationSummaryText(counts)}${run.dropped ? ` (${run.dropped > 1 ? `${run.dropped} liens envoyés deux fois, comptés une fois` : '1 lien envoyé deux fois, compté une fois'})` : ''}`,
      persisted: false,
    }
  }

  /**
   * `record_exploration` : retrie chaque annonce, crée l'exploration, les
   * lignes du compte rendu et les brouillons « À valider » en une
   * transaction (journal `exploration.recorded`, notification de l'autre
   * membre), puis applique la vérification (lot 15) de chaque annonce déjà
   * suivie revue au même lien. Un second envoi du même `runKey` n'écrit rien
   * et rend l'exploration enregistrée.
   */
  async record(
    member: Member,
    input: ExplorationRecord,
    channel: Extract<ActivityChannel, 'mcp' | 'web'> = 'mcp'
  ): Promise<ExplorationRecordResult> {
    const replay = await this.byRunKey(member, input.runKey)
    if (replay) return replayed(replay)
    const criteria = await this.exploredCriteria(member, input.criteriaIds)
    const now = new Date()
    const run = await this.triageService.triage(member, input.candidates, now)
    const startedAt = input.startedAt ? new Date(input.startedAt) : now
    const finishedAt = input.finishedAt ? new Date(input.finishedAt) : now
    if (finishedAt.getTime() < startedAt.getTime()) {
      throw new BadRequestException(
        'La fin de l’exploration (finishedAt) précède son début (startedAt)'
      )
    }
    const triaged = run.items.map(i => i.triage)
    const counts = explorationCounts(triaged, input.portals)
    const summary = explorationSummaryText(counts, input.portals)
    const portalLabels = input.portals.map(
      p => EXPLORATION_PORTAL_LABELS[p.portal]
    )

    let written: {
      explorationId: string
      drafts: { id: string; title: string; index: number }[]
      attachedDrafts: Map<number, string>
    }
    try {
      written = await this.prisma.$transaction(async tx => {
        const exploration = await tx.exploration.create({
          data: {
            workspaceId: member.workspaceId,
            authorId: member.id,
            channel,
            runKey: input.runKey,
            startedAt,
            finishedAt,
            criteria: criteria as unknown as Prisma.InputJsonValue,
            portals: input.portals as unknown as Prisma.InputJsonValue,
            counts: counts as unknown as Prisma.InputJsonValue,
            summary,
            outDigest: outDigest(triaged),
            notes: input.notes ?? null,
          },
          select: { id: true },
        })
        const drafts: { id: string; title: string; index: number }[] = []
        for (const [index, item] of run.items.entries()) {
          if (!item.draft) continue
          const draft = await tx.listingDraft.create({
            data: {
              workspaceId: member.workspaceId,
              origin: 'exploration',
              status: 'pending',
              extractedBy: 'claude',
              input: item.draft.input as unknown as Prisma.InputJsonValue,
              duplicates: item.triage
                .duplicates as unknown as Prisma.InputJsonValue,
              warnings: item.draft.warnings,
              url: item.candidate.url,
              receivedAt: finishedAt,
              explorationId: exploration.id,
              portal: item.candidate.portal,
              excerpt: candidateExcerpt(item.candidate),
              locationPlacement: item.draft.placement
                ? (item.draft.placement as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
            },
            select: { id: true },
          })
          drafts.push({ id: draft.id, title: item.draft.input.title, index })
        }
        // Lot 18 : même agence et même référence qu'une annonce suivie : un
        // brouillon reconnu (merged), son lien rattaché d'office ensuite.
        const attachedDrafts = new Map<number, string>()
        for (const [index, item] of run.items.entries()) {
          if (!item.attach) continue
          const draft = await tx.listingDraft.create({
            data: {
              workspaceId: member.workspaceId,
              origin: 'exploration',
              status: 'merged',
              extractedBy: 'claude',
              input: item.attach.input as unknown as Prisma.InputJsonValue,
              duplicates: item.attach
                .duplicates as unknown as Prisma.InputJsonValue,
              warnings: item.attach.warnings,
              url: item.candidate.url,
              receivedAt: finishedAt,
              decidedAt: now,
              decidedById: member.id,
              listingId: item.attach.listingId,
              attachedAt: now,
              explorationId: exploration.id,
              portal: item.candidate.portal,
              excerpt: candidateExcerpt(item.candidate),
              locationPlacement: item.attach.placement
                ? (item.attach.placement as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
            },
            select: { id: true },
          })
          attachedDrafts.set(index, draft.id)
        }
        const draftAt = new Map([
          ...drafts.map(d => [d.index, d.id] as const),
          ...attachedDrafts.entries(),
        ])
        await tx.explorationCandidate.createMany({
          data: run.items.map((item, position) => ({
            explorationId: exploration.id,
            position,
            url: item.candidate.url,
            normalizedUrl: item.triage.normalizedUrl,
            portal: item.candidate.portal,
            title: item.triage.title,
            price: item.triage.price,
            surface: item.triage.surface,
            rooms: item.triage.rooms,
            commune: item.triage.commune,
            district: item.triage.district,
            outcome: item.triage.outcome,
            why: item.triage.why,
            reasons: item.triage.reasons,
            level: item.triage.fit?.level ?? null,
            listingId: item.triage.listing?.id ?? null,
            draftId: draftAt.get(position) ?? item.triage.draftId,
            excerpt: candidateExcerpt(item.candidate),
          })),
        })
        await this.activity.record(
          {
            workspaceId: member.workspaceId,
            actorMemberId: member.id,
            channel,
            action: 'exploration.recorded',
            after: {
              explorationId: exploration.id,
              summary,
              draftsCreated: drafts.length,
              counts,
              portals: portalLabels,
              blocked: input.portals
                .filter(p => p.status === 'blocked')
                .map(p => EXPLORATION_PORTAL_LABELS[p.portal]),
              criteria: criteria.map(c => c.name),
              draftIds: drafts.map(d => d.id),
              attached: attachedDrafts.size,
            },
          },
          tx
        )
        return { explorationId: exploration.id, drafts, attachedDrafts }
      })
    } catch (error) {
      // Deux envois simultanés du même runKey : le second rend le premier.
      if (isUniqueViolation(error)) {
        const again = await this.byRunKey(member, input.runKey)
        if (again) return replayed(again)
      }
      throw error
    }

    // Les annonces déjà suivies revues au même lien : une vérification du
    // lot 15 chacune (faits appliqués, statut jamais changé).
    const checks: ExplorationRecordResult['checks'] = []
    for (const [position, item] of run.items.entries()) {
      const listing = item.triage.listing
      const check = item.triage.check
      if (
        item.triage.outcome !== 'known' ||
        !listing ||
        !item.observed ||
        !check
      ) {
        continue
      }
      let applied = false
      let problem = check.problem
      let outcome = check.outcome
      let summaryText = check.summary
      if (!problem && item.expectedUpdatedAt) {
        try {
          const result = await this.checks.apply(
            member,
            listing.id,
            ListingCheckInputSchema.parse({
              observed: item.observed,
              evidence: candidateEvidence(item.candidate),
              checkedUrl: item.candidate.url,
              expectedUpdatedAt: item.expectedUpdatedAt,
              ...(item.linkId ? { linkId: item.linkId } : {}),
            }),
            channel
          )
          applied = true
          outcome = result.check.outcome
          summaryText = result.check.summary
        } catch (error) {
          problem =
            error instanceof Error ? error.message : 'vérification refusée'
        }
      }
      checks.push({
        listingId: listing.id,
        title: listing.title,
        outcome: applied ? outcome : null,
        summary: summaryText,
        applied,
        problem,
      })
      const why = knownLineText(
        { ...check, problem: applied ? null : problem },
        applied
      )
      await this.prisma.explorationCandidate.updateMany({
        where: { explorationId: written.explorationId, position },
        data: { why },
      })
    }
    // Lot 18 : les liens rattachés d'office (même agence, même référence),
    // chacun dans sa transaction ; un rattachement refusé (vendeur qui
    // contredit, lien pris) laisse le brouillon « à valider ».
    const attached: ExplorationRecordResult['attached'] = []
    for (const [position, item] of run.items.entries()) {
      const draftId = written.attachedDrafts.get(position)
      if (!item.attach || !draftId) continue
      const c = item.candidate
      const title = item.triage.listing?.title ?? item.attach.input.title
      try {
        const result = await this.links.add(
          member,
          item.attach.listingId,
          {
            url: c.url,
            portal: EXPLORATION_LINK_PORTAL[c.portal],
            online: true,
            ...(c.price !== undefined ? { price: c.price } : {}),
            ...(c.publishedAt !== undefined
              ? { publishedAt: c.publishedAt }
              : {}),
            ...(c.sellerType !== undefined ? { sellerType: c.sellerType } : {}),
            ...(c.sellerName !== undefined ? { sellerName: c.sellerName } : {}),
            ...(c.reference !== undefined ? { reference: c.reference } : {}),
            evidence: candidateEvidence(c),
            facts: factsOfCandidate(c),
          },
          {
            channel,
            origin: 'exploration',
            auto: true,
            draftId,
            strictSeller: true,
          }
        )
        await this.prisma.listingDraft.update({
          where: { id: draftId },
          data: {
            attachedLinkId: result.link?.id ?? null,
            mergedCheckId: result.check?.id ?? null,
          },
        })
        attached.push({
          listingId: item.attach.listingId,
          title,
          linkId: result.link?.id ?? null,
          draftId,
          summary: result.summary,
          applied: true,
          problem: null,
        })
        await this.prisma.explorationCandidate.updateMany({
          where: { explorationId: written.explorationId, position },
          data: { why: `${item.triage.why} : ${result.summary}` },
        })
      } catch (error) {
        const problem =
          error instanceof Error ? error.message : 'rattachement refusé'
        await this.prisma.listingDraft.update({
          where: { id: draftId },
          data: {
            status: 'pending',
            listingId: null,
            attachedAt: null,
            decidedAt: null,
            decidedById: null,
          },
        })
        attached.push({
          listingId: item.attach.listingId,
          title,
          linkId: null,
          draftId,
          summary: item.triage.why,
          applied: false,
          problem,
        })
        await this.prisma.explorationCandidate.updateMany({
          where: { explorationId: written.explorationId, position },
          data: {
            outcome: 'duplicate_probable',
            why: `Même référence que « ${title} », rattachement refusé (${problem}) : à trancher dans « À valider »`,
          },
        })
      }
    }
    const refused = attached.filter(a => !a.applied).length
    const checksChanged = checks.filter(
      c =>
        c.applied &&
        (c.outcome === 'changed' ||
          c.outcome === 'offline' ||
          c.outcome === 'republished')
    ).length
    if (checksChanged !== counts.checksChanged || refused > 0) {
      await this.prisma.exploration.update({
        where: { id: written.explorationId },
        data: {
          counts: {
            ...counts,
            checksChanged,
            attached: counts.attached - refused,
            duplicateProbable: counts.duplicateProbable + refused,
            toValidate: counts.toValidate + refused,
            draftsCreated: counts.draftsCreated + refused,
          } as unknown as Prisma.InputJsonValue,
        },
      })
    }
    const exploration = await this.get(member, written.explorationId)
    return {
      exploration,
      replayed: false,
      drafts: [
        ...written.drafts.map(d => ({ id: d.id, title: d.title })),
        ...attached
          .filter(a => !a.applied && a.draftId)
          .map(a => ({ id: a.draftId as string, title: a.title })),
      ],
      checks,
      attached,
      persisted: true,
    }
  }

  /** Les critères explorés : ceux demandés (de l'espace), sinon les actifs. */
  private async exploredCriteria(
    member: Member,
    ids: readonly string[]
  ): Promise<{ id: string; name: string }[]> {
    const rows = await this.prisma.searchCriteria.findMany({
      where: ids.length
        ? { workspaceId: member.workspaceId, id: { in: [...ids] } }
        : { workspaceId: member.workspaceId, active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    })
    if (ids.length && rows.length !== new Set(ids).size) {
      throw new NotFoundException(
        'Un critère demandé (criteriaIds) est introuvable dans l’espace'
      )
    }
    return rows
  }

  private async byRunKey(
    member: Member,
    runKey: string
  ): Promise<ExplorationDetail | null> {
    const row = await this.prisma.exploration.findUnique({
      where: {
        workspaceId_runKey: { workspaceId: member.workspaceId, runKey },
      },
      include: explorationDetailInclude,
    })
    return row ? toExplorationDetail(row) : null
  }
}

/** Les faits du bien lus sur la page d'une annonce rattachée d'office (lot 18). */
function factsOfCandidate(
  candidate: Parameters<typeof candidateObserved>[0]
): NonNullable<LinkAddInput['facts']> {
  const {
    online: _online,
    price: _price,
    sellerType: _sellerType,
    sellerName: _sellerName,
    reference: _reference,
    url: _url,
    ...facts
  } = candidateObserved(candidate)
  return facts
}

/** La réponse d'un envoi rejoué : rien n'est écrit. */
function replayed(exploration: ExplorationDetail): ExplorationRecordResult {
  return {
    exploration,
    replayed: true,
    drafts: [],
    checks: [],
    attached: [],
    persisted: true,
  }
}
