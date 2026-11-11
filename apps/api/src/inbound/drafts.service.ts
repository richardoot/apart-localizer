import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  AUTO_ATTACH_REVIEW_DAYS,
  DuplicateCandidateSchema,
  EXPLORATION_LINK_PORTAL,
  EXPLORATION_PORTAL_LABELS,
  ListingCheckInputSchema,
  ListingDraftSchema,
  ListingInputSchema,
} from '@apart/contracts'
import type {
  DecisionProposal,
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
  LocationPrecision,
  Point,
} from '@apart/contracts'
import {
  detectLinkPortal,
  formatEuros,
  linkKey,
  mergedListingRefusal,
} from '@apart/domain'
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
import { placementOf } from '../listings/listing.mapper'
import { PrismaService } from '../prisma/prisma.service'
import type { Prisma } from '../generated/prisma'
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

/** Lot 21 : une écriture née d'une décision à plusieurs. */
export interface DraftWriteOptions {
  decision?: DecisionJournal
}

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
    private readonly links: ListingLinksService
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
    if (decision.status === 'pending') return this.restore(member, row)
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
          channel: 'web',
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
          channel: 'web',
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
    row: DraftRowWithCheck
  ): Promise<ListingDraft> {
    if (row.status !== 'dismissed') {
      throw new ConflictException(
        'Seul un brouillon écarté peut revenir « à valider ».'
      )
    }
    await this.prisma.$transaction(async tx => {
      const written = await tx.listingDraft.updateMany({
        where: { id: row.id, status: 'dismissed' },
        data: {
          status: 'pending',
          decidedAt: null,
          decidedById: null,
          dismissReason: null,
        },
      })
      if (written.count === 0) throw this.alreadyDecided()
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          actorMemberId: member.id,
          channel: 'web',
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
        channel: 'web',
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
          channel: 'web',
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
          channel: 'web',
          why: 'le brouillon a été traité',
        })
      }
      return tx.listingDraft.update({
        where: { id },
        data: { listingId },
        include: draftInclude,
      })
    })
    return {
      draft: toDraftDto(saved),
      listingId,
      title: created.listing.title,
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
    request: ListingDraftMerge
  ): Promise<ListingDraft> {
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
          channel: 'web',
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
        'web'
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
          channel: 'web',
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
        channel: 'web',
        why: 'le brouillon a été reconnu comme une annonce suivie',
      })
      return tx.listingDraft.findUniqueOrThrow({
        where: { id },
        include: draftInclude,
      })
    })
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
