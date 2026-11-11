import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ExtractionRequestSchema } from '@apart/contracts'
import type {
  ActivityChannel,
  CheckedLink,
  EvaluatedListing,
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
  linkCheckDiff,
  linkKey,
  listingCheckSummary,
  observedFromExtraction,
  orderRepublication,
  primaryLink,
  republicationLinkProblem,
  republicationProposal,
  resolveLinkCheckOutcome,
  sanitizeEvidence,
} from '@apart/domain'
import type {
  CheckOutcomeResolution,
  LinkCheckDiff,
  LinkState,
  RepublicationCandidate,
} from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { PrismaService } from '../prisma/prisma.service'
import type { Prisma } from '../generated/prisma'
import type { Member } from '../generated/prisma'
import { DuplicatesService } from './duplicates.service'
import { ListingEnrichmentService } from './enrichment.service'
import { ExtractionService } from './extraction.service'
import { writeCheckFacts } from './link-writes'
import { toListingCheckDto } from './listing.mapper'
import { ListingsService } from './listings.service'

/** Les annonces liées se lisent en quelques champs. */
const LINKED_SELECT = { id: true, title: true, status: true } as const
/** Le lien vérifié (lot 18), en quelques champs. */
const LINK_SELECT = { id: true, portal: true, url: true } as const

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
  diff: LinkCheckDiff
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
  /** Lot 18 : le lien vérifié (null : annonce sans lien). */
  checked: CheckedLink | null
}

/** Les liens d'une annonce vue, pour les règles de `domain`. */
export function linkStatesOf(item: EvaluatedListing): LinkState[] {
  return item.links.map(l => ({
    id: l.id,
    portal: l.portal,
    url: l.url,
    normalizedUrl: l.normalizedUrl,
    externalId: l.externalId,
    price: l.price,
    priceAt: l.priceAt,
    online: l.online,
    offlineSince: l.offlineSince,
    lastSeenOnlineAt: l.lastSeenOnlineAt,
    lastCheckedAt: l.lastCheckedAt,
    createdAt: l.createdAt,
    origin: l.origin,
    readSellerName: l.readSellerName,
    readReference: l.readReference,
  }))
}

/**
 * Le lien qu'une vérification porte (lot 18) : celui désigné (`linkId`),
 * sinon celui dont l'URL est l'URL consultée, sinon le lien principal. Une
 * URL consultée qui n'est aucun lien de l'annonce est refusée (sauf si c'est
 * le nouveau lien lu, `observed.url`) : ajoutez-la d'abord.
 */
export function checkedLinkOf(
  item: EvaluatedListing,
  input: {
    linkId?: string | undefined
    checkedUrl?: string | undefined
    observedUrl?: string | undefined
  }
): LinkState | null {
  const links = linkStatesOf(item)
  if (input.linkId !== undefined) {
    const found = links.find(l => l.id === input.linkId)
    if (!found) {
      throw new NotFoundException(
        'Lien introuvable sur cette annonce (linkId) : relisez ses liens avec get_listing'
      )
    }
    return found
  }
  const primary = primaryLink(links)
  if (input.checkedUrl !== undefined && links.length > 0) {
    const key = linkKey(input.checkedUrl)
    const found = links.find(l => l.normalizedUrl === key)
    if (found) return found
    if (input.observedUrl !== undefined && linkKey(input.observedUrl) === key) {
      return primary
    }
    throw new BadRequestException(
      'Le lien consulté (checkedUrl) n’est aucun des liens de cette annonce : ajoute-le d’abord (add_listing_link, ou « Ajouter un lien » dans la fiche), ou passe linkId'
    )
  }
  return primary
}

/**
 * Le suivi des mises à jour des annonces (lot 15, ADR 0025), lien par lien
 * depuis le lot 18 (ADR 0028). Une vérification part de ce que Claude a lu
 * sur la page d'un lien dans le navigateur de l'utilisateur (ou du texte de
 * la page, lu par l'extraction) : le serveur ne télécharge jamais la page.
 * `domain` compare et classe (`linkCheckDiff`) ; ce service applique les
 * faits en une transaction (fiche, prix de la fiche par l'historique, état
 * du lien, vendeur lu, dates, ligne `listing_checks`, journal et
 * notifications), puis relance les enrichissements et les critères. Un
 * statut n'est jamais changé : il est proposé, et seulement quand plus aucun
 * lien n'est en ligne.
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

  /** Les vérifications d'une annonce (chronologie de l'Historique), de la plus récente à la plus ancienne. */
  async list(member: Member, listingId: string): Promise<ListingCheck[]> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, workspaceId: member.workspaceId },
      select: { id: true },
    })
    if (!listing) throw new NotFoundException('Annonce introuvable')
    const rows = await this.prisma.listingCheck.findMany({
      where: { listingId, workspaceId: member.workspaceId },
      orderBy: { checkedAt: 'desc' },
      include: {
        linkedListing: { select: LINKED_SELECT },
        link: { select: LINK_SELECT },
      },
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
    const target = checkedLinkOf(item, {
      linkId: request.linkId,
      observedUrl: request.observed?.url,
    })
    let observed: ListingObserved = request.observed ?? {}
    let extraction: ListingCheckPreview['extraction'] = null
    const text = request.pageText?.trim() ? request.pageText : null
    if (text !== null || request.images.length > 0) {
      const result = await this.extraction.extract(
        member,
        ExtractionRequestSchema.parse({
          text,
          url: target?.url ?? item.listing.url,
          images: request.images,
          quality: request.quality,
        }),
        channel
      )
      // Ce que Claude a lu lui-même prime sur ce que le modèle a extrait.
      observed = { ...observedFromExtraction(result.listing), ...observed }
      extraction = { usage: result.usage, warnings: result.warnings }
    }
    const plan = await this.plan(member, item, target, {
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
          ? [
              ...new Set(
                plan.changes
                  .filter(c => c.disposition === 'applied')
                  .map(c => c.field)
              ),
            ]
          : [],
      updatesLastSeenOnline: ok?.seenOnline ?? false,
      suggestion: plan.suggestion,
      duplicates,
      republication: item.republication,
      link: plan.checked,
      extraction,
      persisted: false,
    }
  }

  /**
   * Enregistre une vérification (`apply_listing_check`, boutons de la
   * fiche, prix ou état d'un lien relevés à la main) : garde-fous
   * optimistes, faits appliqués, prix de la fiche par l'historique des prix
   * (source `listing`), état du lien, dates de vérification, rattachement
   * d'une republication, ligne `listing_checks` et journal
   * `listing.checked`, dans une transaction. Le statut proposé n'est jamais
   * appliqué.
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
    const target = checkedLinkOf(item, {
      linkId: input.linkId,
      checkedUrl: input.checkedUrl,
      observedUrl: input.observed.url,
    })
    const plan = await this.plan(member, item, target, input)
    if (!plan.resolution.ok) {
      throw new BadRequestException(plan.resolution.problem)
    }
    if (plan.linkProblem) throw new BadRequestException(plan.linkProblem)
    const { outcome, seenOnline, applyFacts } = plan.resolution
    const applied = applyFacts
      ? plan.changes.filter(c => c.disposition === 'applied')
      : []
    const now = new Date()
    const evidence = sanitizeEvidence(input.evidence)
    const linkHere =
      plan.link !== null &&
      plan.link.successor.id === listingId &&
      plan.link.successor.republishedFromId !== plan.link.predecessor.id

    const created = await this.prisma.$transaction(async tx => {
      await writeCheckFacts(tx, {
        listingId,
        item,
        diff: plan.diff,
        applyFacts,
        seenOnline,
        now,
        channel,
        linkId: plan.checked?.id ?? null,
        portal: plan.checked?.portal ?? null,
        ...(linkHere && plan.link
          ? { alsoTouches: { republishedFromId: plan.link.predecessor.id } }
          : {}),
      })
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
          linkId: plan.checked?.id ?? null,
        },
        include: {
          linkedListing: { select: LINKED_SELECT },
          link: { select: LINK_SELECT },
        },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: 'listing.checked',
          before: applied.length ? { facts: factsOf(applied, 'before') } : null,
          after: {
            checkId: check.id,
            outcome,
            summary: plan.summary,
            ...(applied.length ? { facts: factsOf(applied, 'after') } : {}),
            ...(plan.suggestion
              ? {
                  suggestedStatus: plan.suggestion.status,
                  suggestedFor: plan.suggestion.listingId,
                }
              : {}),
            ...(plan.link ? { linkedListingId: plan.link.other.id } : {}),
            ...(input.checkedUrl ? { checkedUrl: input.checkedUrl } : {}),
            ...(plan.checked
              ? { linkId: plan.checked.id, portal: plan.checked.portal }
              : {}),
          },
        },
        tx
      )
      return check
    })

    // Surface et pièces nourrissent le plafond d'encadrement et le marché.
    const patch = applyFacts ? plan.diff.patch : {}
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
    target: LinkState | null,
    input: {
      observed: ListingObserved
      outcome?: ListingCheckOutcome | undefined
      republishedListingId?: string | undefined
    }
  ): Promise<CheckPlan> {
    const observed = effectiveObserved(input.observed, input.outcome)
    const diff = linkCheckDiff({
      stored: item.listing,
      priceSource: item.listing.fieldSources.price?.source ?? null,
      seller: {
        sellerType: item.listing.sellerType,
        sellerName: item.listing.sellerName,
        sellerReference: item.listing.sellerReference,
      },
      // Lot 27 : la page d'un lien peut montrer une autre agence de la fiche.
      otherSellers: item.sellers.map(other => ({
        sellerType: other.sellerType,
        sellerName: other.sellerName,
        sellerReference: other.sellerReference,
      })),
      links: linkStatesOf(item),
      linkId: target?.id ?? null,
      observed,
      now: new Date().toISOString(),
    })
    const linked = input.republishedListingId !== undefined
    const resolution = resolveLinkCheckOutcome({
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
            reason:
              item.links.length > 1
                ? 'L’annonce n’est plus en ligne sur aucun de ses portails.'
                : 'L’annonce n’est plus en ligne sur le portail.',
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
      checked: target
        ? { id: target.id, portal: target.portal, url: target.url }
        : null,
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

/**
 * Les faits de la fiche qu'une vérification change, avant ou après, pour le
 * journal (« ce qui a changé » lit `facts.price`). Le prix de la fiche
 * (`price`) et les faits du bien ; le prix d'un portail est `linkPrice`.
 */
export function factsOf(
  changes: readonly ListingCheckChange[],
  side: 'before' | 'after'
): Record<string, unknown> {
  return Object.fromEntries(changes.map(c => [c.field, c[side]]))
}
