import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  AUTO_ATTACH_REVIEW_DAYS,
  DraftMergedLinkSchema,
  DuplicateCandidateSchema,
  EXPLORATION_LINK_PORTAL,
  EXPLORATION_PORTAL_LABELS,
  ListingCheckInputSchema,
  ListingDraftSchema,
  ListingInputSchema,
} from '@apart/contracts'
import type {
  ActivityChannel,
  DecisionProposal,
  DraftMergedLink,
  DraftUpdate,
  FieldSource,
  ListingCriteriaFit,
  ListingDraft,
  ListingDraftAcceptResult,
  ListingDraftBatchAccept,
  ListingDraftBatchAcceptResult,
  ListingDraftDecision,
  ListingDraftMerge,
  ListingDraftStatus,
  ListingEvaluation,
  ListingInput,
  ListingObserved,
  ListingMergeField,
  LocationPrecision,
  Point,
  SimilarDraftsResult,
} from '@apart/contracts'
import {
  connectorListingUpdate,
  detectLinkPortal,
  draftMergePlan,
  formatEuros,
  linkKey,
  mergedDraftReason,
  mergedListingRefusal,
  mergeUndoRefusal,
  rankSimilarListings,
} from '@apart/domain'
import type { SimilarRow } from '@apart/domain'
import type { DecisionJournal } from '@apart/domain'
import { z } from 'zod'
import { ActivityService } from '../activity/activity.service'
import {
  closeOpenDecisionsAsStale,
  decisionInclude,
  decisionViewOf,
  loadDecisionContext,
  openDecisionWhere,
} from '../decisions/decision-context'
import { CandidateFitService } from '../exploration/candidate-fit.service'
import { evaluateListing } from '../listings/evaluate'
import { ListingChecksService } from '../listings/listing-checks.service'
import { ListingLinksService } from '../listings/listing-links.service'
import { ListingsService } from '../listings/listings.service'
import { DuplicatesService } from '../listings/duplicates.service'
import { placementOf } from '../listings/listing.mapper'
import { provenanceAfterPatch } from '../listings/provenance'
import { purgeExpiredMerges } from '../listings/merge-purge'
import { mergedLinksOf } from './draft-merged-links'
import { draftProbe } from '../listings/similar-listings.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'
import type {
  ListingDraft as DraftRow,
  ListingPortal,
  Member,
} from '../generated/prisma'

/**
 * Ce qu'une lecture de brouillon charge avec lui : la vérification d'un
 * brouillon reconnu ; lot 18 : l'annonce et le lien d'un rattachement
 * d'office.
 */
const draftInclude = {
  mergedCheck: { select: { id: true, summary: true } },
  listing: {
    select: {
      id: true,
      title: true,
      price: true,
      sellerName: true,
      sellerReference: true,
    },
  },
  attachedLink: { select: { id: true, portal: true } },
  // Lot 21 : la proposition en cours (au plus une, contrainte en base).
  decisionProposals: {
    where: openDecisionWhere,
    include: decisionInclude,
    take: 1,
  },
} as const

/** Lot 21 : ce qu'un brouillon en attente montre en plus à la lecture. */
interface DraftReading {
  fit: ListingCriteriaFit
  evaluation: ListingEvaluation
  located: { point: Point | null; precision: LocationPrecision | null }
  decision: DecisionProposal | null
}

/** Lot 21 : une écriture née d'une décision à plusieurs ; lot 31 : son canal. */
export interface DraftWriteOptions {
  decision?: DecisionJournal
  /** Le canal du journal : l'application (par défaut) ou le connecteur. */
  channel?: ActivityChannel
}

/** Lot 31 : une correction de la fiche pré-remplie. */
export interface DraftUpdateOptions {
  channel?: ActivityChannel
  /** Provenance des champs écrits (`ai` : Claude a lu ; `user` : dicté). */
  provenance?: FieldSource
}

/** Lot 31 : les liens des brouillons absorbés, ajoutés à l'annonce ou écartés. */
export interface AbsorbedLinks {
  added: string[]
  skipped: { url: string; why: string }[]
}

/** Lot 31 : deux brouillons fusionnés. */
export interface DraftsMergeResult {
  kept: ListingDraft
  absorbed: ListingDraft
  fills: ListingMergeField[]
  differences: ListingMergeField[]
}

/** Les brouillons qu'on peut encore corriger ou fusionner. */
const OPEN_DRAFT_STATUSES: readonly ListingDraftStatus[] = [
  'pending',
  'dismissed',
]

type DraftRowWithCheck = Prisma.ListingDraftGetPayload<{
  include: typeof draftInclude
}>

/** La fiche d'un brouillon ; illisible : une fiche vide à compléter. */
function draftInput(row: Pick<DraftRow, 'input'>): ListingInput {
  const listing = ListingInputSchema.safeParse(row.input)
  return listing.success
    ? listing.data
    : ListingInputSchema.parse({ title: 'Annonce reçue', price: 0 })
}

type DraftListingRef = {
  id: string
  title: string
  price: { toString(): string } | number
  sellerName: string | null
  sellerReference: string | null
}

export function toDraftDto(
  row: DraftRow & {
    mergedCheck?: { id: string; summary: string } | null
    listing?: DraftListingRef | null
    attachedLink?: { id: string; portal: ListingPortal } | null
  },
  fit: ListingCriteriaFit | null = null,
  reading: Pick<
    DraftReading,
    'evaluation' | 'located' | 'decision'
  > | null = null
): ListingDraft {
  return ListingDraftSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    origin: row.origin,
    status: row.status,
    extractedBy: row.extractedBy,
    listing: draftInput(row),
    duplicates: z
      .array(DuplicateCandidateSchema)
      .catch([])
      .parse(row.duplicates),
    warnings: z.array(z.string()).catch([]).parse(row.warnings),
    url: row.url,
    emailSubject: row.emailSubject,
    emailFrom: row.emailFrom,
    receivedAt: row.receivedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedById: row.decidedById,
    listingId: row.listingId,
    createdAt: row.createdAt.toISOString(),
    explorationId: row.explorationId,
    portal: row.portal,
    excerpt: row.excerpt,
    dismissReason: row.dismissReason,
    distinct: row.distinctAt !== null,
    merge:
      row.status === 'merged'
        ? {
            checkId: row.mergedCheck?.id ?? row.mergedCheckId,
            summary: row.mergedCheck?.summary ?? 'Fiche mise à jour',
          }
        : null,
    fit,
    // Lot 18 : le lien rattaché d'office (même agence, même référence).
    attachment:
      row.status === 'merged' && row.attachedAt && row.listing
        ? {
            listingId: row.listing.id,
            listingTitle: row.listing.title,
            linkId: row.attachedLink?.id ?? row.attachedLinkId,
            portal:
              row.attachedLink?.portal ??
              (row.portal
                ? EXPLORATION_LINK_PORTAL[row.portal]
                : detectLinkPortal(row.url)),
            attachedAt: row.attachedAt.toISOString(),
            fichePrice: Number(row.listing.price),
            sellerName: row.listing.sellerName,
            sellerReference: row.listing.sellerReference,
            summary: row.mergedCheck?.summary ?? 'Lien rattaché à la fiche',
          }
        : null,
    detachedAt: row.detachedAt?.toISOString() ?? null,
    decision: reading?.decision ?? null,
    evaluation: reading?.evaluation ?? null,
    located: reading?.located ?? null,
    updatedAt: row.updatedAt.toISOString(),
    mergedIntoDraftId: row.mergedIntoDraftId,
    mergedAt: row.mergedAt?.toISOString() ?? null,
    mergedLinks: mergedLinksOf(row),
  })
}

/** Les faits lus d'un brouillon, pour la vérification de l'annonce suivie qui est la même. */
export function observedFromDraft(input: ListingInput): ListingObserved {
  const read = (key: string): boolean => key in input.fieldSources
  const observed: ListingObserved = {}
  if (read('price') && input.price > 0) observed.price = input.price
  if (read('surface') && input.surface !== null)
    observed.surface = input.surface
  if (read('rooms') && input.rooms !== null) observed.rooms = input.rooms
  if (read('dpeClass') && input.dpeClass !== null)
    observed.dpeClass = input.dpeClass
  if (read('annualCharges') && input.annualCharges !== null)
    observed.annualCharges = input.annualCharges
  if (read('propertyTax') && input.propertyTax !== null)
    observed.propertyTax = input.propertyTax
  return observed
}

/** « trouvée par Claude », « reçue par e-mail » : l'origine dans le journal. */
const originOf = (row: Pick<DraftRow, 'origin'>) => row.origin

/**
 * Les brouillons « À valider » (alertes e-mail, lot 6 ; explorations de
 * Claude, lot 16) : la liste avec l'adéquation calculée à la lecture,
 * l'ajout direct à la liste (« Ajouter à la liste ») ou par le formulaire
 * pré-rempli (validation avec l'annonce créée), l'écart avec une raison
 * facultative (jamais reproposé) et son annulation, « c'est la même »
 * (vérification lot 15 de l'annonce suivie, brouillon `merged`) et « c'en
 * est une autre ». Chaque écriture est journalisée.
 */
@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly listings: ListingsService,
    private readonly checks: ListingChecksService,
    private readonly fit: CandidateFitService,
    private readonly links: ListingLinksService,
    private readonly duplicates: DuplicatesService
  ) {}

  async list(
    member: Member,
    status: ListingDraftStatus,
    explorationId?: string,
    attached = false
  ): Promise<ListingDraft[]> {
    const since = new Date(Date.now() - AUTO_ATTACH_REVIEW_DAYS * 86_400_000)
    const rows = await this.prisma.listingDraft.findMany({
      where: {
        workspaceId: member.workspaceId,
        status: attached ? 'merged' : status,
        // Lot 31 : un brouillon absorbé est caché (son lien est sur le gardé).
        mergedIntoDraftId: null,
        ...(explorationId ? { explorationId } : {}),
        // Lot 18 : les liens rattachés d'office des derniers jours.
        ...(attached ? { attachedAt: { gte: since } } : {}),
      },
      include: draftInclude,
      orderBy: { receivedAt: 'desc' },
      // Les écartés restent tous visibles dans les archives (lot 21).
      take: status === 'dismissed' ? 500 : 100,
    })
    const readings =
      status === 'pending'
        ? await this.readings(member, rows)
        : new Map<string, DraftReading>()
    return rows.map(row => {
      const reading = readings.get(row.id) ?? null
      return toDraftDto(row, reading?.fit ?? null, reading)
    })
  }

  async get(member: Member, id: string): Promise<ListingDraft> {
    const row = await this.row(member, id)
    const readings =
      row.status === 'pending'
        ? await this.readings(member, [row])
        : new Map<string, DraftReading>()
    const reading = readings.get(row.id) ?? null
    return toDraftDto(row, reading?.fit ?? null, reading)
  }

  /**
   * Ce qu'un brouillon en attente montre à la lecture, sans réseau :
   * l'adéquation, les chiffres avec les hypothèses de l'espace (lot 21), le
   * repère pour la carte et la proposition en cours.
   */
  private async readings(
    member: Member,
    rows: readonly DraftRowWithCheck[]
  ): Promise<Map<string, DraftReading>> {
    const items = await Promise.all(
      rows.map(async row => {
        const located = await this.fit.offlineLocation(
          draftInput(row),
          placementOf(row.locationPlacement)
        )
        return { key: row.id, listing: located.listing, area: located.area }
      })
    )
    const [context, decisions] = await Promise.all([
      this.fit.context(member.workspaceId),
      loadDecisionContext(this.prisma, member.workspaceId),
    ])
    const fits = await this.fit.fits(member.workspaceId, items, context)
    const proposals = new Map(
      rows.map(row => [row.id, row.decisionProposals[0] ?? null])
    )
    const readings = new Map<string, DraftReading>()
    for (const item of items) {
      const fit = fits.get(item.key)
      if (!fit) continue
      const proposal = proposals.get(item.key) ?? null
      readings.set(item.key, {
        fit,
        evaluation: evaluateListing(item.listing, context.base),
        located: {
          point: item.listing.location.point ?? null,
          precision: item.listing.location.precision ?? null,
        },
        decision: proposal ? decisionViewOf(proposal, member, decisions) : null,
      })
    }
    return readings
  }

  /**
   * Valide (le formulaire a créé l'annonce), écarte (raison facultative) ou
   * remet « à valider » un brouillon écarté.
   */
  async decide(
    member: Member,
    id: string,
    decision: ListingDraftDecision,
    options: DraftWriteOptions = {}
  ): Promise<ListingDraft> {
    const row = await this.row(member, id)
    const channel = options.channel ?? 'web'
    if (decision.status === 'pending') return this.restore(member, row, channel)
    this.assertPending(row)
    const createdId =
      decision.status === 'accepted' ? (decision.listingId ?? null) : null
    if (decision.status === 'accepted') {
      const listing = await this.prisma.listing.findFirst({
        where: { id: createdId ?? '', workspaceId: member.workspaceId },
        select: { id: true },
      })
      if (!listing) {
        throw new BadRequestException("L'annonce créée est introuvable")
      }
    }
    const reason =
      decision.status === 'dismissed' && decision.reason
        ? decision.reason
        : null
    const saved = await this.prisma.$transaction(async tx => {
      const written = await tx.listingDraft.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: decision.status,
          decidedAt: new Date(),
          decidedById: member.id,
          listingId: createdId,
          dismissReason: reason,
        },
      })
      if (written.count === 0) throw this.alreadyDecided()
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: createdId,
          actorMemberId: member.id,
          channel,
          action:
            decision.status === 'accepted'
              ? 'draft.accepted'
              : 'draft.dismissed',
          after: {
            draftId: id,
            url: row.url,
            origin: originOf(row),
            ...(reason ? { reason } : {}),
            ...(options.decision ? { decision: options.decision } : {}),
          },
        },
        tx
      )
      // Lot 21 : un fait appliqué directement rend caduque la proposition.
      if (!options.decision) {
        await closeOpenDecisionsAsStale(tx, this.activity, {
          workspaceId: member.workspaceId,
          target: { draftId: id },
          actorMemberId: member.id,
          channel,
          why: 'le brouillon a été traité',
        })
      }
      return tx.listingDraft.findUniqueOrThrow({
        where: { id },
        include: draftInclude,
      })
    })
    return toDraftDto(saved)
  }

  /** « Annuler » un écart : le brouillon revient « à valider ». */
  private async restore(
    member: Member,
    row: DraftRowWithCheck,
    channel: ActivityChannel = 'web'
  ): Promise<ListingDraft> {
    if (row.status !== 'dismissed') {
      throw new ConflictException(
        'Seul un brouillon écarté peut revenir « à valider ».'
      )
    }
    // Lot 31 : un brouillon absorbé se repêche pendant sept jours.
    const tooOld =
      row.mergedIntoDraftId && row.mergedAt
        ? mergeUndoRefusal(row.mergedAt, new Date())
        : null
    if (tooOld) throw new ConflictException(tooOld)
    await this.prisma.$transaction(async tx => {
      const written = await tx.listingDraft.updateMany({
        where: { id: row.id, status: 'dismissed' },
        data: {
          status: 'pending',
          decidedAt: null,
          decidedById: null,
          dismissReason: null,
          // Lot 31 : un brouillon absorbé repêché redevient un brouillon à part.
          mergedIntoDraftId: null,
          mergedAt: null,
        },
      })
      if (written.count === 0) throw this.alreadyDecided()
      // Son lien quitte le brouillon gardé.
      if (row.mergedIntoDraftId) {
        const kept = await tx.listingDraft.findUnique({
          where: { id: row.mergedIntoDraftId },
          select: { mergedLinks: true },
        })
        if (kept) {
          await tx.listingDraft.update({
            where: { id: row.mergedIntoDraftId },
            data: {
              mergedLinks: mergedLinksOf(kept).filter(
                link => link.draftId !== row.id
              ) as unknown as Prisma.InputJsonValue,
            },
          })
        }
      }
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          actorMemberId: member.id,
          channel,
          action: 'draft.restored',
          after: { draftId: row.id, url: row.url, origin: originOf(row) },
        },
        tx
      )
    })
    return this.get(member, row.id)
  }

  /**
   * « Ajouter à la liste » sans repasser par le formulaire : l'annonce est
   * créée depuis la fiche pré-remplie (repère replacé par le géocodeur en
   * cache, doublons vus par le membre), puis le brouillon est validé. Le
   * brouillon est réservé avant la création : deux clics ne créent pas deux
   * annonces.
   */
  async accept(
    member: Member,
    id: string,
    options: DraftWriteOptions = {}
  ): Promise<ListingDraftAcceptResult> {
    const row = await this.row(member, id)
    this.assertPending(row)
    const channel = options.channel ?? 'web'
    const claimed = await this.prisma.listingDraft.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: 'accepted',
        decidedAt: new Date(),
        decidedById: member.id,
      },
    })
    if (claimed.count === 0) throw this.alreadyDecided()
    const input = draftInput(row)
    const duplicates = z
      .array(DuplicateCandidateSchema)
      .catch([])
      .parse(row.duplicates)
    let created
    try {
      created = await this.listings.create(member, input, {
        channel,
        provenance: row.extractedBy === 'ai' ? 'ai' : 'listing',
        ignoreDuplicates: duplicates.length > 0,
        viaDecision: options.decision !== undefined,
      })
    } catch (error) {
      await this.prisma.listingDraft.update({
        where: { id },
        data: { status: 'pending', decidedAt: null, decidedById: null },
      })
      throw error
    }
    const listingId = created.listing.id
    const saved = await this.prisma.$transaction(async tx => {
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId,
          actorMemberId: member.id,
          channel,
          action: 'draft.accepted',
          after: {
            draftId: id,
            url: row.url,
            origin: originOf(row),
            direct: true,
            ...(options.decision ? { decision: options.decision } : {}),
          },
        },
        tx
      )
      // Lot 21 : un fait appliqué directement rend caduque la proposition.
      if (!options.decision) {
        await closeOpenDecisionsAsStale(tx, this.activity, {
          workspaceId: member.workspaceId,
          target: { draftId: id },
          actorMemberId: member.id,
          channel,
          why: 'le brouillon a été traité',
        })
      }
      return tx.listingDraft.update({
        where: { id },
        data: { listingId },
        include: draftInclude,
      })
    })
    // Lot 31 : les liens des brouillons absorbés rejoignent l'annonce créée.
    const links = await this.attachAbsorbedLinks(member, id, listingId, channel)
    return {
      draft: toDraftDto(saved),
      listingId,
      title: created.listing.title,
      ...(links.added.length || links.skipped.length ? { links } : {}),
    }
  }

  /**
   * « Ajouter celles « dans les critères » » : les brouillons à valider dont
   * l'adéquation est « dans les critères », sans doublon probable à
   * trancher ; les autres restent à valider.
   */
  async acceptInCriteria(
    member: Member,
    request: ListingDraftBatchAccept
  ): Promise<ListingDraftBatchAcceptResult> {
    const drafts = await this.list(member, 'pending', request.explorationId)
    const accepted: ListingDraftBatchAcceptResult['accepted'] = []
    let skipped = 0
    for (const draft of drafts) {
      const undecided = draft.duplicates.length > 0 && !draft.distinct
      if (draft.fit?.level !== 'in' || undecided) {
        skipped += 1
        continue
      }
      const result = await this.accept(member, draft.id)
      accepted.push({
        draftId: draft.id,
        listingId: result.listingId,
        title: result.title,
      })
    }
    return { accepted, skipped, proposed: 0 }
  }

  /**
   * « C'est la même : mettre à jour la fiche » : le brouillon est le même
   * bien qu'une annonce suivie (un de ses doublons probables, ou, lot 27,
   * une annonce retrouvée par « Déjà vue » ; une autre agence lue sur le
   * brouillon est alors enregistrée avec sa référence). Les faits lus
   * s'appliquent à cette annonce par une vérification du lot 15 (rien de
   * plus : ni statut, ni lien), le brouillon passe à « merged », lié à
   * l'annonce et à la vérification.
   */
  async merge(
    member: Member,
    id: string,
    request: ListingDraftMerge,
    options: { channel?: Extract<ActivityChannel, 'web' | 'mcp'> } = {}
  ): Promise<ListingDraft> {
    const channel = options.channel ?? 'web'
    const row = await this.row(member, id)
    this.assertPending(row)
    // Lot 27 : l'annonce suivie est un doublon probable, ou une annonce que
    // le membre a retrouvée par « Déjà vue » (toute annonce de l'espace).
    const item = await this.listings.get(member, request.listingId)
    if (item.mergedInto) {
      throw new ConflictException(
        `${mergedListingRefusal(item.mergedInto.title)} Choisis plutôt « ${item.mergedInto.title} ».`
      )
    }
    const input = draftInput(row)
    const portal = row.portal ? EXPLORATION_PORTAL_LABELS[row.portal] : null
    const evidence = `Même bien vu ${portal ? `sur ${portal}` : 'dans une alerte'}${input.price > 0 ? ` : Prix : ${formatEuros(input.price)}` : ''}`
    const expectedUpdatedAt =
      request.expectedUpdatedAt ?? item.listing.updatedAt
    // Lot 18 : « C'est la même » ajoute le lien du brouillon à la fiche (le
    // prix lu devient celui de ce lien) ; un lien déjà sur la fiche est
    // vérifié ; sans lien, la vérification du lot 16.
    const key = linkKey(row.url)
    const own = key ? item.links.find(l => l.normalizedUrl === key) : undefined
    let result: { check: { id: string; summary: string } }
    if (row.url && key && !own) {
      const { price, ...facts } = observedFromDraft(input)
      const added = await this.links.add(
        member,
        request.listingId,
        {
          url: row.url,
          portal: row.portal
            ? EXPLORATION_LINK_PORTAL[row.portal]
            : detectLinkPortal(row.url),
          online: true,
          ...(price !== undefined ? { price } : {}),
          facts,
          ...(input.sellerType !== 'unknown'
            ? { sellerType: input.sellerType }
            : {}),
          ...(input.sellerName ? { sellerName: input.sellerName } : {}),
          ...(input.sellerReference
            ? { reference: input.sellerReference }
            : {}),
          evidence,
          expectedUpdatedAt,
        },
        {
          channel,
          origin: row.origin === 'exploration' ? 'exploration' : 'email',
          draftId: id,
        }
      )
      if (!added.check) throw new ConflictException('Lien non ajouté')
      result = { check: added.check }
    } else {
      const observed = observedFromDraft(input)
      result = await this.checks.apply(
        member,
        request.listingId,
        ListingCheckInputSchema.parse({
          observed: own ? { ...observed, online: true } : observed,
          evidence,
          ...(own ? { linkId: own.id, checkedUrl: row.url } : {}),
          expectedUpdatedAt,
        }),
        channel
      )
    }
    const saved = await this.prisma.$transaction(async tx => {
      const written = await tx.listingDraft.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: 'merged',
          decidedAt: new Date(),
          decidedById: member.id,
          listingId: request.listingId,
          mergedCheckId: result.check.id,
        },
      })
      if (written.count === 0) throw this.alreadyDecided()
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: request.listingId,
          actorMemberId: member.id,
          channel,
          action: 'draft.merged',
          after: {
            draftId: id,
            url: row.url,
            origin: originOf(row),
            listingTitle: item.listing.title,
            checkId: result.check.id,
            summary: result.check.summary,
          },
        },
        tx
      )
      // Lot 21 : « c'est la même » s'applique tout de suite.
      await closeOpenDecisionsAsStale(tx, this.activity, {
        workspaceId: member.workspaceId,
        target: { draftId: id },
        actorMemberId: member.id,
        channel,
        why: 'le brouillon a été reconnu comme une annonce suivie',
      })
      return tx.listingDraft.findUniqueOrThrow({
        where: { id },
        include: draftInclude,
      })
    })
    // Lot 31 : les liens des brouillons absorbés rejoignent aussi la fiche.
    await this.attachAbsorbedLinks(member, id, request.listingId, channel)
    return toDraftDto(saved)
  }

  /**
   * Lot 18 : « Ce n'est pas la même » sur un lien rattaché d'office : le lien
   * est retiré de la fiche (journalisé, le prix de la fiche suit ses liens
   * restants) et le brouillon revient « à valider », noté « c'en est une
   * autre » (ses doublons ne sont plus proposés).
   */
  async detach(member: Member, id: string): Promise<ListingDraft> {
    const row = await this.row(member, id)
    if (row.status !== 'merged' || !row.attachedAt || !row.listingId) {
      throw new ConflictException(
        'Ce brouillon n’a pas de lien rattaché d’office à détacher.'
      )
    }
    // Le lien retiré et le brouillon rouvert dans une même transaction.
    const now = new Date()
    const reopen = async (tx: Prisma.TransactionClient): Promise<void> => {
      const written = await tx.listingDraft.updateMany({
        where: { id, status: 'merged' },
        data: {
          status: 'pending',
          listingId: null,
          attachedLinkId: null,
          mergedCheckId: null,
          decidedAt: null,
          decidedById: null,
          detachedAt: now,
          distinctAt: now,
        },
      })
      if (written.count === 0) throw this.alreadyDecided()
    }
    if (row.attachedLinkId) {
      await this.links.detach(
        member,
        row.listingId,
        row.attachedLinkId,
        id,
        reopen
      )
    } else {
      await this.prisma.$transaction(tx => reopen(tx))
    }
    return this.get(member, id)
  }

  /** « C'en est une autre » : les doublons probables ne sont plus proposés. */
  async distinct(member: Member, id: string): Promise<ListingDraft> {
    const row = await this.row(member, id)
    this.assertPending(row)
    await this.prisma.$transaction(async tx => {
      await tx.listingDraft.update({
        where: { id },
        data: { distinctAt: new Date() },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'draft.distinct',
          after: {
            draftId: id,
            url: row.url,
            origin: originOf(row),
            duplicates: z
              .array(DuplicateCandidateSchema)
              .catch([])
              .parse(row.duplicates)
              .map(d => d.listingId),
          },
        },
        tx
      )
    })
    return this.get(member, id)
  }

  /**
   * Lot 31 (ADR 0044) : corrige la fiche pré-remplie d'un brouillon à valider
   * ou écarté. Garde-fou `expectedUpdatedAt` ; au connecteur, les règles de
   * l'ADR 0040 (plafond, loyer de marché, sorties du géocodeur, estimations
   * sans extrait). Une localisation corrigée est replacée à la lecture ; les
   * doublons probables sont recalculés. Journalisé (`draft.updated`).
   */
  async update(
    member: Member,
    id: string,
    input: DraftUpdate,
    options: DraftUpdateOptions = {}
  ): Promise<ListingDraft> {
    const channel = options.channel ?? 'web'
    const provenance = options.provenance ?? 'user'
    const row = await this.row(member, id)
    this.assertOpen(row)
    this.checkUpdatedAt(row, input.expectedUpdatedAt)
    const current = draftInput(row)
    const { status: _status, ...raw } = input.patch as typeof input.patch & {
      status?: unknown
    }
    const patch =
      channel === 'mcp'
        ? connectorListingUpdate(
            raw,
            {
              location: current.location,
              rentalPlan: current.rentalPlan,
              fieldSources: current.fieldSources,
            },
            provenance
          ).patch
        : raw
    const fields = Object.entries(patch)
      .filter(([key, value]) => value !== undefined && key !== 'fieldSources')
      .map(([key]) => key)
    if (fields.length === 0) {
      throw new BadRequestException('Rien à corriger : le patch est vide.')
    }
    const now = new Date()
    const values = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    )
    let fieldSources = provenanceAfterPatch(
      current.fieldSources,
      values,
      provenance,
      now
    )
    if (patch.location) {
      for (const key of ['addressRaw', 'commune', 'district', 'point']) {
        const value = (patch.location as Record<string, unknown>)[key]
        if (value !== null && value !== undefined) {
          fieldSources = {
            ...fieldSources,
            [key]: { source: provenance, recordedAt: now.toISOString() },
          }
        }
      }
    }
    const next = ListingInputSchema.parse({
      ...current,
      ...values,
      fieldSources,
    })
    const duplicates = await this.duplicates.findForInput(member, next)
    const saved = await this.prisma.$transaction(async tx => {
      const written = await tx.listingDraft.updateMany({
        where: { id, updatedAt: row.updatedAt },
        data: {
          input: next as unknown as Prisma.InputJsonValue,
          duplicates: duplicates as unknown as Prisma.InputJsonValue,
          ...(patch.location ? { locationPlacement: Prisma.DbNull } : {}),
          ...(patch.url !== undefined ? { url: next.url } : {}),
          updatedAt: now,
        },
      })
      if (written.count === 0) throw this.changedSinceRead()
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          actorMemberId: member.id,
          channel,
          action: 'draft.updated',
          after: {
            draftId: id,
            url: row.url,
            origin: originOf(row),
            title: next.title,
            fields,
          },
        },
        tx
      )
      return tx.listingDraft.findUniqueOrThrow({
        where: { id },
        include: draftInclude,
      })
    })
    return this.get(member, saved.id)
  }

  /**
   * Lot 31 (ADR 0044) : deux brouillons du même bien n'en font plus qu'un. Le
   * brouillon gardé l'emporte, ses vides se complètent de l'autre
   * (`draftMergePlan`), il reprend son lien s'il n'en avait pas ; l'autre est
   * écarté comme doublon, lié au gardé (son lien rejoindra l'annonce créée
   * depuis le gardé, ou la fiche suivie qui est la même). Les deux doivent
   * être à valider ou écartés. Une seule transaction, journalisée
   * (`draft.absorbed`) ; une proposition en cours sur l'absorbé devient
   * caduque. L'absorbé est caché des listes et supprimé sept jours après
   * (ADR 0045) ; repêché d'ici là, il redevient un brouillon à part.
   */
  async mergeDrafts(
    member: Member,
    keepId: string,
    absorbId: string,
    guards: { keepUpdatedAt: string; absorbUpdatedAt: string },
    channel: ActivityChannel = 'web'
  ): Promise<DraftsMergeResult> {
    if (keepId === absorbId) {
      throw new BadRequestException(
        'Un brouillon ne se fusionne pas avec lui-même.'
      )
    }
    // Les brouillons absorbés depuis plus de sept jours partent d'abord.
    await purgeExpiredMerges(this.prisma, member.workspaceId)
    const [keep, absorb] = await Promise.all([
      this.row(member, keepId),
      this.row(member, absorbId),
    ])
    this.assertOpen(keep)
    this.assertOpen(absorb)
    for (const row of [keep, absorb]) {
      if (row.mergedIntoDraftId) {
        throw new ConflictException(
          `« ${draftInput(row).title} » a déjà été fusionné dans un autre brouillon : repêche-le d’abord, ou garde ce brouillon-là.`
        )
      }
    }
    this.checkUpdatedAt(keep, guards.keepUpdatedAt)
    this.checkUpdatedAt(absorb, guards.absorbUpdatedAt)
    const keptInput = draftInput(keep)
    const absorbedInput = draftInput(absorb)
    const plan = draftMergePlan(keptInput, absorbedInput)
    const takesUrl = !keep.url && Boolean(absorb.url)
    const nextInput = takesUrl ? { ...plan.input, url: absorb.url } : plan.input
    const now = new Date()
    // Lot 31 (ADR 0045) : le lien de l'absorbé, ses faits lus et sa raison
    // d'écart passent sur le gardé, avec ceux qu'il avait lui-même absorbés :
    // ils survivent à sa suppression, sept jours après.
    const entry: DraftMergedLink | null =
      absorb.url && !takesUrl
        ? DraftMergedLinkSchema.parse({
            draftId: absorb.id,
            url: absorb.url,
            portal: absorb.portal,
            origin: absorb.origin,
            title: absorbedInput.title,
            price: absorbedInput.price > 0 ? absorbedInput.price : 0,
            sellerType: absorbedInput.sellerType,
            sellerName: absorbedInput.sellerName,
            sellerReference: absorbedInput.sellerReference,
            observed: observedFromDraft(absorbedInput),
            reason: absorb.status === 'dismissed' ? absorb.dismissReason : null,
            mergedAt: now.toISOString(),
          })
        : null
    const mergedLinks = [
      ...mergedLinksOf(keep),
      ...(entry ? [entry] : []),
      ...mergedLinksOf(absorb),
    ]
    await this.prisma.$transaction(async tx => {
      const claimed = await tx.listingDraft.updateMany({
        where: {
          id: absorbId,
          updatedAt: absorb.updatedAt,
          mergedIntoDraftId: null,
          status: { in: [...OPEN_DRAFT_STATUSES] },
        },
        data: {
          status: 'dismissed',
          dismissReason: mergedDraftReason(keptInput.title),
          decidedAt: now,
          decidedById: member.id,
          mergedIntoDraftId: keepId,
          mergedAt: now,
          mergedLinks: [],
          // Son lien passe au gardé, qui n'en avait pas.
          ...(takesUrl ? { url: null } : {}),
          updatedAt: now,
        },
      })
      if (claimed.count === 0) throw this.changedSinceRead()
      const written = await tx.listingDraft.updateMany({
        where: { id: keepId, updatedAt: keep.updatedAt },
        data: {
          input: nextInput as unknown as Prisma.InputJsonValue,
          mergedLinks: mergedLinks as unknown as Prisma.InputJsonValue,
          ...(takesUrl ? { url: absorb.url } : {}),
          ...(nextInput.location !== keptInput.location
            ? { locationPlacement: Prisma.DbNull }
            : {}),
          updatedAt: now,
        },
      })
      if (written.count === 0) throw this.changedSinceRead()
      // Les brouillons déjà absorbés par l'absorbé suivent le gardé (leur
      // délai de suppression ne change pas).
      await tx.listingDraft.updateMany({
        where: { mergedIntoDraftId: absorbId },
        data: { mergedIntoDraftId: keepId },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          actorMemberId: member.id,
          channel,
          action: 'draft.absorbed',
          after: {
            draftId: absorbId,
            keptDraftId: keepId,
            url: absorb.url,
            origin: originOf(absorb),
            keptTitle: keptInput.title,
            absorbedTitle: absorbedInput.title,
            fields: plan.fills.map(fill => fill.field),
          },
        },
        tx
      )
      await closeOpenDecisionsAsStale(tx, this.activity, {
        workspaceId: member.workspaceId,
        target: { draftId: absorbId },
        actorMemberId: member.id,
        channel,
        why: `le brouillon a été fusionné dans « ${keptInput.title} »`,
      })
    })
    const [kept, absorbed] = await Promise.all([
      this.get(member, keepId),
      this.get(member, absorbId),
    ])
    return {
      kept,
      absorbed,
      fills: plan.fills,
      differences: plan.differences,
    }
  }

  /**
   * Lot 31 : les brouillons qui ressemblent à un brouillon (ceux des statuts
   * demandés, sauf les brouillons déjà absorbés), classés par la même règle
   * que les annonces (`rankSimilarListings`), sans distance : le repère d'un
   * brouillon n'est pas en base géographique. Lecture seule.
   */
  async similar(
    member: Member,
    id: string,
    statuses: readonly ListingDraftStatus[],
    limit: number
  ): Promise<SimilarDraftsResult> {
    const target = await this.row(member, id)
    const { probe } = draftProbe(draftInput(target), target.url)
    const rows = await this.prisma.listingDraft.findMany({
      where: {
        workspaceId: member.workspaceId,
        id: { not: id },
        status: { in: [...statuses] },
        mergedIntoDraftId: null,
      },
      orderBy: { receivedAt: 'desc' },
      take: 1000,
    })
    const byId = new Map(rows.map(row => [row.id, row]))
    const similarRows: SimilarRow[] = rows.map(row => {
      const input = draftInput(row)
      return {
        id: row.id,
        title: input.title,
        // Le statut d'une annonce n'a pas de sens ici : rendu à part.
        status: 'to_study',
        price: input.price,
        surface: input.surface,
        commune: input.location.commune,
        url: row.url ?? input.url,
        addressRaw: input.location.addressRaw,
        addressNormalized: input.location.addressNormalized,
        sellerType: input.sellerType,
        sellerName: input.sellerName,
        sellerReference: input.sellerReference,
        rooms: input.rooms,
        floor: input.floor,
        dpeClass: input.dpeClass,
        constructionYear: input.constructionYear,
        locationPrecision: input.location.precision,
        district: input.location.district,
        updatedAt: row.updatedAt.toISOString(),
      }
    })
    const ranked = rankSimilarListings(probe, similarRows, new Map(), {
      limit,
    })
    return {
      compared: ranked.compared,
      items: ranked.items.map(item => {
        const row = byId.get(item.listingId)
        const { listingId, status: _status, linkCount: _links, ...rest } = item
        return {
          ...rest,
          draftId: listingId,
          status: row?.status ?? 'pending',
          dismissReason: row?.dismissReason ?? null,
        }
      }),
    }
  }

  /**
   * Lot 31 : les liens des brouillons absorbés par `draftId` rejoignent
   * l'annonce `listingId` (créée depuis le brouillon, ou la fiche suivie qui
   * est la même). Un lien déjà sur la fiche, ou refusé (déjà sur une autre
   * fiche, agence qui contredit), est passé et dit.
   */
  private async attachAbsorbedLinks(
    member: Member,
    draftId: string,
    listingId: string,
    channel: ActivityChannel
  ): Promise<AbsorbedLinks> {
    const kept = await this.prisma.listingDraft.findUnique({
      where: { id: draftId },
      select: { mergedLinks: true },
    })
    const result: AbsorbedLinks = { added: [], skipped: [] }
    for (const link of kept ? mergedLinksOf(kept) : []) {
      const url = link.url
      const { price: _read, ...facts } = link.observed
      const price = link.price > 0 ? link.price : undefined
      try {
        await this.links.add(
          member,
          listingId,
          {
            url,
            portal: link.portal
              ? EXPLORATION_LINK_PORTAL[link.portal]
              : detectLinkPortal(url),
            online: true,
            ...(price !== undefined ? { price } : {}),
            facts,
            ...(link.sellerType !== 'unknown'
              ? { sellerType: link.sellerType }
              : {}),
            ...(link.sellerName ? { sellerName: link.sellerName } : {}),
            ...(link.sellerReference
              ? { reference: link.sellerReference }
              : {}),
            evidence: 'Même bien : brouillon fusionné',
          },
          {
            channel,
            origin: link.origin === 'exploration' ? 'exploration' : 'email',
            draftId: link.draftId,
          }
        )
        result.added.push(url)
      } catch (error) {
        const why = error instanceof Error ? error.message : 'refusé'
        result.skipped.push({ url, why })
      }
    }
    return result
  }

  /** Lot 31 : un brouillon validé ou reconnu ne se corrige ni ne se fusionne plus. */
  private assertOpen(row: DraftRow): void {
    if (!OPEN_DRAFT_STATUSES.includes(row.status)) {
      throw this.alreadyDecided(row.status)
    }
  }

  private checkUpdatedAt(row: DraftRow, expected: string): void {
    if (row.updatedAt.getTime() !== Date.parse(expected)) {
      throw this.changedSinceRead()
    }
  }

  private changedSinceRead(): ConflictException {
    return new ConflictException(
      'Le brouillon a changé depuis ta lecture : relis-le (get_draft) avant de réécrire. Rien n’a été modifié.'
    )
  }

  private assertPending(row: DraftRow): void {
    if (row.status !== 'pending') throw this.alreadyDecided(row.status)
  }

  private alreadyDecided(status?: ListingDraftStatus): ConflictException {
    const label =
      status === 'accepted'
        ? 'validé'
        : status === 'dismissed'
          ? 'écarté'
          : status === 'merged'
            ? 'reconnu comme une annonce suivie'
            : 'traité'
    return new ConflictException(`Ce brouillon est déjà ${label}.`)
  }

  private async row(member: Member, id: string): Promise<DraftRowWithCheck> {
    const row = await this.prisma.listingDraft.findFirst({
      where: { id, workspaceId: member.workspaceId },
      include: draftInclude,
    })
    if (!row) throw new NotFoundException('Brouillon introuvable')
    return row
  }
}
