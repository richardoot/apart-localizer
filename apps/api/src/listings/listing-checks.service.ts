import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ExtractionRequestSchema } from '@apart/contracts'
import type {
  ActivityChannel,
  EvaluatedListing,
  FieldProvenanceMap,
  LinkedListing,
  ListingCheck,
  ListingCheckChange,
  ListingCheckInput,
  ListingCheckOutcome,
  ListingCheckPreview,
  ListingCheckPreviewRequest,
  ListingCheckSuggestion,
  ListingCheckWriteResult,
  ListingObserved,
} from '@apart/contracts'
import {
  effectiveObserved,
  listingCheckDiff,
  listingCheckSummary,
  observedFromExtraction,
  orderRepublication,
  republicationLinkProblem,
  republicationProposal,
  resolveCheckOutcome,
  sanitizeEvidence,
} from '@apart/domain'
import type {
  CheckOutcomeResolution,
  ListingCheckDiff,
  ListingCheckPatch,
  RepublicationCandidate,
} from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type { Member } from '../generated/prisma'
import { DuplicatesService } from './duplicates.service'
import { ListingEnrichmentService } from './enrichment.service'
import { ExtractionService } from './extraction.service'
import { toListingCheckDto } from './listing.mapper'
import { ListingsService, priceEventData } from './listings.service'

/** Les annonces liées se lisent en quelques champs. */
const LINKED_SELECT = { id: true, title: true, status: true } as const

/** Au-delà, une chaîne de republications est tronquée (garde-fou). */
const MAX_CHAIN = 20

/** Une annonce candidate à une republication, avec ses liens actuels. */
interface RepublicationNode extends RepublicationCandidate {
  republishedFromId: string | null
  republishedToId: string | null
}

/** Ce qu'une vérification ferait : calculé une fois, pour la vérification à blanc et l'enregistrement. */
interface CheckPlan {
  observed: ListingObserved
  diff: ListingCheckDiff
  resolution: CheckOutcomeResolution
  /** Les écarts gardés avec la vérification (proposition de republication comprise). */
  changes: ListingCheckChange[]
  summary: string
  suggestion: ListingCheckSuggestion | null
  link: {
    predecessor: RepublicationNode
    successor: RepublicationNode
    other: LinkedListing
  } | null
  linkProblem: string | null
}

/**
 * Le suivi des mises à jour des annonces (lot 15, ADR 0025). Une
 * vérification part de ce que Claude a lu sur la page du portail dans le
 * navigateur de l'utilisateur (ou du texte de la page, lu par l'extraction) :
 * le serveur ne télécharge jamais la page. `domain` compare et classe ; ce
 * service applique les faits en une transaction (fiche, historique des
 * prix, dates de vérification, ligne `listing_checks`, journal et
 * notifications), puis relance les enrichissements et les critères. Un
 * statut n'est jamais changé : il est proposé.
 */
@Injectable()
export class ListingChecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly listings: ListingsService,
    private readonly enrichment: ListingEnrichmentService,
    private readonly duplicates: DuplicatesService,
    private readonly extraction: ExtractionService
  ) {}

  /** La chronologie « Mises à jour » d'une annonce, de la plus récente à la plus ancienne. */
  async list(member: Member, listingId: string): Promise<ListingCheck[]> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, workspaceId: member.workspaceId },
      select: { id: true },
    })
    if (!listing) throw new NotFoundException('Annonce introuvable')
    const rows = await this.prisma.listingCheck.findMany({
      where: { listingId, workspaceId: member.workspaceId },
      orderBy: { checkedAt: 'desc' },
      include: { linkedListing: { select: LINKED_SELECT } },
      take: 200,
    })
    return rows.map(toListingCheckDto)
  }

  /**
   * Une vérification à blanc (`check_listing`) : rien n'est écrit, sauf la
   * ligne de coût au journal quand le texte de la page passe par
   * l'extraction (comme `extract_listing`).
   */
  async preview(
    member: Member,
    listingId: string,
    request: ListingCheckPreviewRequest,
    channel: ActivityChannel = 'web'
  ): Promise<ListingCheckPreview> {
    const item = await this.listings.get(member, listingId)
    let observed: ListingObserved = request.observed ?? {}
    let extraction: ListingCheckPreview['extraction'] = null
    const text = request.pageText?.trim() ? request.pageText : null
    if (text !== null || request.images.length > 0) {
      const result = await this.extraction.extract(
        member,
        ExtractionRequestSchema.parse({
          text,
          url: item.listing.url,
          images: request.images,
          quality: request.quality,
        }),
        channel
      )
      // Ce que Claude a lu lui-même prime sur ce que le modèle a extrait.
      observed = { ...observedFromExtraction(result.listing), ...observed }
      extraction = { usage: result.usage, warnings: result.warnings }
    }
    const plan = await this.plan(member, item, {
      observed,
      outcome: request.outcome,
      republishedListingId: request.republishedListingId,
    })
    const duplicates = await this.duplicates.find(member, {
      listingId,
      ...(plan.observed.url ? { url: plan.observed.url } : {}),
      ...(plan.observed.price !== undefined
        ? { price: plan.observed.price }
        : {}),
      ...(plan.observed.surface !== undefined
        ? { surface: plan.observed.surface }
        : {}),
    })
    const ok = plan.resolution.ok ? plan.resolution : null
    return {
      listingId,
      title: item.listing.title,
      currentStatus: item.listing.status,
      guards: {
        expectedUpdatedAt: item.listing.updatedAt,
        expectedPrice: item.listing.price,
      },
      observed: plan.observed,
      outcome: ok && !plan.linkProblem ? ok.outcome : null,
      problem: plan.resolution.ok ? plan.linkProblem : plan.resolution.problem,
      changes: plan.changes,
      summary: plan.summary,
      applies:
        ok?.applyFacts === true
          ? plan.changes
              .filter(c => c.disposition === 'applied')
              .map(c => c.field)
          : [],
      updatesLastSeenOnline: ok?.seenOnline ?? false,
      suggestion: plan.suggestion,
      duplicates,
      republication: item.republication,
      extraction,
      persisted: false,
    }
  }

  /**
   * Enregistre une vérification (`apply_listing_check`, boutons de la
   * fiche) : garde-fous optimistes, faits appliqués, historique des prix
   * (source `listing`), dates de vérification, rattachement d'une
   * republication, ligne `listing_checks` et journal `listing.checked`,
   * dans une transaction. Le statut proposé n'est jamais appliqué.
   */
  async apply(
    member: Member,
    listingId: string,
    input: ListingCheckInput,
    channel: Extract<ActivityChannel, 'web' | 'mcp'> = 'web'
  ): Promise<ListingCheckWriteResult> {
    const item = await this.listings.get(member, listingId)
    this.listings.checkGuards(item.listing, {
      expectedUpdatedAt: input.expectedUpdatedAt,
      ...(input.expectedPrice !== undefined
        ? { expectedPrice: input.expectedPrice }
        : {}),
    })
    const plan = await this.plan(member, item, input)
    if (!plan.resolution.ok) {
      throw new BadRequestException(plan.resolution.problem)
    }
    if (plan.linkProblem) throw new BadRequestException(plan.linkProblem)
    const { outcome, seenOnline, applyFacts } = plan.resolution
    const patch: ListingCheckPatch = applyFacts ? plan.diff.patch : {}
    const applied = applyFacts
      ? plan.changes.filter(c => c.disposition === 'applied')
      : []
    const now = new Date()
    const evidence = sanitizeEvidence(input.evidence)
    const linkHere =
      plan.link !== null &&
      plan.link.successor.id === listingId &&
      plan.link.successor.republishedFromId !== plan.link.predecessor.id
    const touchesListing = Object.keys(patch).length > 0 || linkHere

    const created = await this.prisma.$transaction(async tx => {
      await tx.listing.update({
        where: { id: listingId },
        data: {
          ...patchData(patch),
          ...(Object.keys(patch).length > 0
            ? {
                fieldSources: withListingProvenance(
                  item.listing.fieldSources,
                  Object.keys(patch),
                  now
                ) as Prisma.InputJsonValue,
              }
            : {}),
          ...(linkHere && plan.link
            ? { republishedFromId: plan.link.predecessor.id }
            : {}),
          lastCheckedAt: now,
          ...(seenOnline ? { lastSeenOnlineAt: now } : {}),
          // Une vérification qui ne change aucun fait ne « modifie » pas la
          // fiche : les garde-fous des autres lecteurs restent valables.
          ...(touchesListing
            ? {}
            : { updatedAt: new Date(item.listing.updatedAt) }),
        },
      })
      if (plan.diff.price && applyFacts) {
        await tx.priceEvent.create({
          data: priceEventData(
            listingId,
            plan.diff.price.from,
            plan.diff.price.to,
            'listing',
            now
          ),
        })
      }
      if (
        plan.link &&
        !linkHere &&
        plan.link.successor.republishedFromId !== plan.link.predecessor.id
      ) {
        await tx.listing.update({
          where: { id: plan.link.successor.id },
          data: { republishedFromId: plan.link.predecessor.id },
        })
      }
      const check = await tx.listingCheck.create({
        data: {
          listingId,
          workspaceId: member.workspaceId,
          checkedAt: now,
          authorId: member.id,
          channel,
          outcome,
          changes: (applyFacts
            ? plan.changes
            : []) as unknown as Prisma.InputJsonValue,
          summary: plan.summary,
          evidence,
          checkedUrl: input.checkedUrl ?? null,
          linkedListingId: plan.link?.other.id ?? null,
          suggestedStatus: plan.suggestion?.status ?? null,
        },
        include: { linkedListing: { select: LINKED_SELECT } },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: 'listing.checked',
          before: applied.length
            ? {
                facts: Object.fromEntries(
                  applied.map(c => [c.field, c.before])
                ),
              }
            : null,
          after: {
            checkId: check.id,
            outcome,
            summary: plan.summary,
            ...(applied.length
              ? {
                  facts: Object.fromEntries(
                    applied.map(c => [c.field, c.after])
                  ),
                }
              : {}),
            ...(plan.suggestion
              ? {
                  suggestedStatus: plan.suggestion.status,
                  suggestedFor: plan.suggestion.listingId,
                }
              : {}),
            ...(plan.link ? { linkedListingId: plan.link.other.id } : {}),
            ...(input.checkedUrl ? { checkedUrl: input.checkedUrl } : {}),
          },
        },
        tx
      )
      return check
    })

    // Surface et pièces nourrissent le plafond d'encadrement et le marché.
    if (patch.surface !== undefined || patch.rooms !== undefined) {
      await this.enrichment.enrich(member, listingId, { dpe: false, channel })
    }
    const listing = await this.listings.afterWrite(member, listingId, channel)
    return {
      check: toListingCheckDto(created),
      listing,
      suggestion: plan.suggestion,
      linked: plan.link?.other ?? null,
    }
  }

  /** Les écarts, le résultat, la republication et le statut proposé d'une vérification. */
  private async plan(
    member: Member,
    item: EvaluatedListing,
    input: {
      observed: ListingObserved
      outcome?: ListingCheckOutcome | undefined
      republishedListingId?: string | undefined
    }
  ): Promise<CheckPlan> {
    const observed = effectiveObserved(input.observed, input.outcome)
    const diff = listingCheckDiff(item.listing, observed)
    const linked = input.republishedListingId !== undefined
    const resolution = resolveCheckOutcome({
      declared: input.outcome,
      observed,
      diff,
      linked,
    })
    let changes = [...diff.changes]
    let suggestion: ListingCheckSuggestion | null =
      diff.suggestedStatus !== null
        ? {
            listingId: item.listing.id,
            title: item.listing.title,
            currentStatus: item.listing.status,
            status: diff.suggestedStatus,
            reason: 'L’annonce n’est plus en ligne sur le portail.',
          }
        : null
    let link: CheckPlan['link'] = null
    let linkProblem: string | null = null
    let role: 'predecessor' | 'successor' | null = null
    if (input.republishedListingId !== undefined) {
      const self: RepublicationNode = {
        id: item.listing.id,
        title: item.listing.title,
        status: item.listing.status,
        publishedAt: item.listing.publishedAt,
        createdAt: item.listing.createdAt,
        republishedFromId: item.listing.republishedFromId,
        republishedToId: item.republication.to?.id ?? null,
      }
      const other = await this.node(member, input.republishedListingId)
      const { predecessor, successor } = orderRepublication(self, other) as {
        predecessor: RepublicationNode
        successor: RepublicationNode
      }
      linkProblem = republicationLinkProblem({
        predecessor,
        successor,
        successorFromId: successor.republishedFromId,
        predecessorToId: predecessor.republishedToId,
        predecessorAncestors: await this.ancestors(
          member,
          predecessor.republishedFromId
        ),
      })
      link = {
        predecessor,
        successor,
        other: { id: other.id, title: other.title, status: other.status },
      }
      role = other.id === successor.id ? 'successor' : 'predecessor'
      // La proposition vise la publication d'origine, nommée.
      changes = changes.filter(
        c => !(c.field === 'status' && c.disposition === 'proposed')
      )
      const proposal = republicationProposal(predecessor, successor)
      if (proposal) {
        changes.push(proposal)
        suggestion = {
          listingId: predecessor.id,
          title: predecessor.title,
          currentStatus: predecessor.status,
          status: 'sold_or_withdrawn',
          reason: `Le même bien est republié sous « ${successor.title} ».`,
        }
      } else {
        suggestion = null
      }
    }
    const outcome = resolution.ok ? resolution.outcome : 'changed'
    const shown = resolution.ok && !resolution.applyFacts ? [] : changes
    return {
      observed,
      diff,
      resolution,
      changes: shown,
      summary: listingCheckSummary(
        outcome,
        shown,
        link && role ? { title: link.other.title, role } : null
      ),
      suggestion: resolution.ok && resolution.applyFacts ? suggestion : null,
      link,
      linkProblem,
    }
  }

  /** L'autre annonce d'une republication, dans l'espace du membre. */
  private async node(member: Member, id: string): Promise<RepublicationNode> {
    const row = await this.prisma.listing.findFirst({
      where: { id, workspaceId: member.workspaceId },
      select: {
        id: true,
        title: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        republishedFromId: true,
        republishedAs: { select: { id: true } },
      },
    })
    if (!row) {
      throw new NotFoundException(
        'Annonce liée (republishedListingId) introuvable dans l’espace'
      )
    }
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      republishedFromId: row.republishedFromId,
      republishedToId: row.republishedAs?.id ?? null,
    }
  }

  /** Les annonces qu'une annonce reprend, de proche en proche. */
  private async ancestors(
    member: Member,
    fromId: string | null
  ): Promise<string[]> {
    const ids: string[] = []
    let next = fromId
    while (next !== null && ids.length < MAX_CHAIN && !ids.includes(next)) {
      ids.push(next)
      const row = await this.prisma.listing.findFirst({
        where: { id: next, workspaceId: member.workspaceId },
        select: { republishedFromId: true },
      })
      next = row?.republishedFromId ?? null
    }
    return ids
  }
}

/** Les faits d'une vérification en colonnes Prisma. */
function patchData(
  patch: ListingCheckPatch
): Prisma.ListingUncheckedUpdateInput {
  const data: Prisma.ListingUncheckedUpdateInput = {}
  const decimal = (value: number) => new Prisma.Decimal(value)
  if (patch.price !== undefined) data.price = decimal(patch.price)
  if (patch.annualCharges !== undefined)
    data.annualCharges = decimal(patch.annualCharges)
  if (patch.propertyTax !== undefined)
    data.propertyTax = decimal(patch.propertyTax)
  if (patch.surface !== undefined) data.surface = decimal(patch.surface)
  if (patch.rooms !== undefined) data.rooms = patch.rooms
  if (patch.dpeClass !== undefined) data.dpeClass = patch.dpeClass
  if (patch.gesClass !== undefined) data.gesClass = patch.gesClass
  if (patch.dpeConsumption !== undefined)
    data.dpeConsumption = patch.dpeConsumption
  if (patch.description !== undefined) data.description = patch.description
  if (patch.publishedAt !== undefined)
    data.publishedAt = new Date(patch.publishedAt)
  if (patch.sourceUpdatedAt !== undefined)
    data.sourceUpdatedAt = new Date(patch.sourceUpdatedAt)
  if (patch.url !== undefined) data.url = patch.url
  return data
}

/** Les champs appliqués par une vérification prennent la provenance « lue dans l'annonce ». */
export function withListingProvenance(
  existing: FieldProvenanceMap,
  keys: readonly string[],
  now: Date
): FieldProvenanceMap {
  const result: FieldProvenanceMap = { ...existing }
  for (const key of keys) {
    result[key] = { source: 'listing', recordedAt: now.toISOString() }
  }
  return result
}
