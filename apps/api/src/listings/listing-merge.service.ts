import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { z } from 'zod'
import { EMPTY_MERGE_COUNTS } from '@apart/contracts'
import type {
  ActivityChannel,
  EvaluatedListing,
  ListingMergeCounts,
  ListingMergeInput,
  ListingMergePreview,
  ListingMergeResult,
  ListingMergeSide,
} from '@apart/contracts'
import {
  MERGE_FILL_FIELDS,
  fichePriceDecision,
  mergeFieldPlan,
  mergeLeftBehindLines,
  mergeMoveLines,
  mergeRefusal,
  mergeSellersPlan,
  mergeSummaryText,
  mergedDiscardReason,
  mergedFieldSources,
  mergedNotes,
  mergedSellerLines,
  priceTrigger,
  suggestKeep,
  tasksToMove,
  withoutMergedNotes,
  enrichmentNeeds,
} from '@apart/domain'
import type {
  FichePriceDecision,
  MergeFieldValues,
  MergeListingFacts,
} from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { closeOpenDecisionsAsStale } from '../decisions/decision-context'
import { Prisma } from '../generated/prisma'
import type { Member } from '../generated/prisma'
import { PrismaService } from '../prisma/prisma.service'
import { ListingEnrichmentService } from './enrichment.service'
import {
  priceEventData,
  sellerData,
  syncPrimaryLink,
  withListingProvenance,
} from './link-writes'
import type { Tx } from './link-writes'
import { linkStatesOf } from './listing-checks.service'
import { toMergeRecord } from './listing.mapper'
import { createListingSeller, sellersOf } from './listing-sellers.service'
import { ListingsService } from './listings.service'

const ids = z.array(z.string()).default([])

/**
 * Ce qu'une fusion a fait passer de la fiche absorbée à la fiche gardée,
 * gardé dans `listing_merges.moved` pour l'annuler.
 */
const MergeMovedSchema = z.object({
  linkIds: ids,
  checkIds: ids,
  /** Les autres agences créées sur la fiche gardée. */
  sellerIds: ids,
  /** L'agence principale donnée à la fiche gardée, qui n'en avait pas. */
  principalSeller: z
    .object({
      sellerType: z.string(),
      sellerName: z.string().nullable(),
      sellerReference: z.string().nullable(),
    })
    .nullable()
    .default(null),
  visitIds: ids,
  offerIds: ids,
  opinionIds: ids,
  taskIds: ids,
  agencyRequestIds: ids,
  contact: z.boolean().default(false),
  renovation: z.boolean().default(false),
  rentalPlan: z.boolean().default(false),
  draftIds: ids,
  explorationLineIds: ids,
  /** Les champs vides de la fiche gardée, avec la valeur reçue. */
  fields: z.record(z.string(), z.unknown()).default({}),
  notesAppended: z.string().nullable().default(null),
  absorbedBefore: z
    .object({
      status: z.string(),
      discardReason: z.string().nullable(),
      discardedAt: z.string().nullable(),
    })
    .nullable()
    .default(null),
})
type MergeMoved = z.infer<typeof MergeMovedSchema>

const MERGE_INCLUDE = {
  kept: { select: { title: true } },
  absorbed: { select: { title: true } },
} as const

/** Ce que la fusion ferait : les deux fiches, ce qui passe de l'une à l'autre, ce qui reste. */
interface MergePlan {
  keep: EvaluatedListing
  absorb: EvaluatedListing
  refusal: string | null
  facts: { keep: MergeListingFacts; absorb: MergeListingFacts }
  fieldPlan: ReturnType<typeof mergeFieldPlan>
  sellersPlan: ReturnType<typeof mergeSellersPlan>
  notes: ReturnType<typeof mergedNotes>
  moved: Omit<MergeMoved, 'sellerIds' | 'absorbedBefore'>
  counts: ListingMergeCounts
  left: { opinionsKept: number; tasksKept: number }
}

/**
 * Lot 27 (ADR 0037) : fusionner deux fiches du même bien. La fiche gardée
 * reçoit les liens (avec leurs vérifications), les agences et leurs
 * références, les visites, offres, avis, tâches et questions aux agences de
 * la fiche absorbée ; ses champs vides sont complétés ; son prix suit ses
 * liens (lot 18). La fiche absorbée n'est pas supprimée : écartée comme
 * doublon, liée à la fiche gardée, cachée des listes. Tout est écrit dans une
 * transaction, journalisé des deux côtés, et s'annule (`undo`) : ce qui était
 * venu repart, la fiche absorbée retrouve son statut. Par un membre dans
 * l'application, ou par Claude après son accord ; l'annulation, dans
 * l'application seulement.
 */
@Injectable()
export class ListingMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly listings: ListingsService,
    private readonly enrichment: ListingEnrichmentService
  ) {}

  /** L'aperçu : ce que la fusion ferait, sans rien écrire. */
  async preview(
    member: Member,
    keepId: string,
    absorbId: string
  ): Promise<ListingMergePreview> {
    const plan = await this.plan(member, keepId, absorbId)
    const suggestion = suggestKeep(plan.facts.keep, plan.facts.absorb)
    const { principal, others } = sellersOf(plan.keep)
    return {
      keep: sideOf(plan.keep, plan.facts.keep),
      absorb: sideOf(plan.absorb, plan.facts.absorb),
      suggestedKeepId: suggestion.id,
      suggestionReason: suggestion.reason,
      moves: mergeMoveLines(plan.counts),
      fills: plan.fieldPlan.fills,
      differences: plan.fieldPlan.differences,
      sellers: mergedSellerLines({
        keep: principal,
        keepOthers: others,
        plan: plan.sellersPlan,
      }),
      leftBehind: mergeLeftBehindLines({
        ...plan.left,
        sellersDropped: plan.sellersPlan.dropped,
        hasAddress: Boolean(
          plan.absorb.listing.location.addressRaw ||
          plan.absorb.listing.location.point
        ),
      }),
      refusal: plan.refusal,
    }
  }

  /** Fusionne la fiche `input.absorbedId` dans la fiche `keepId`. */
  async merge(
    member: Member,
    keepId: string,
    input: ListingMergeInput,
    channel: ActivityChannel = 'web'
  ): Promise<ListingMergeResult> {
    const plan = await this.plan(member, keepId, input.absorbedId)
    if (plan.refusal) throw new ConflictException(plan.refusal)
    if (input.expectedUpdatedAt !== undefined) {
      this.listings.checkGuards(plan.keep.listing, {
        expectedUpdatedAt: input.expectedUpdatedAt,
      })
    }
    if (input.expectedAbsorbedUpdatedAt !== undefined) {
      this.listings.checkGuards(plan.absorb.listing, {
        expectedUpdatedAt: input.expectedAbsorbedUpdatedAt,
      })
    }
    const keep = plan.keep.listing
    const absorb = plan.absorb.listing
    const now = new Date()
    const before = linkStatesOf(plan.keep)
    const price = fichePriceDecision({
      fichePrice: keep.price,
      priceSource: keep.fieldSources.price?.source ?? null,
      before,
      after: [...before, ...linkStatesOf(plan.absorb)],
    })
    const filled = Object.keys(plan.fieldPlan.values)
    const summary = mergeSummaryText(absorb.title, plan.counts)

    const mergeId = await this.prisma.$transaction(async tx => {
      // La fiche absorbée est réservée d'abord : deux fusions ne se croisent pas.
      const claimed = await tx.listing.updateMany({
        where: { id: absorb.id, mergedIntoId: null },
        data: {
          mergedIntoId: keep.id,
          mergedAt: now,
          status: 'discarded',
          discardReason: mergedDiscardReason(keep.title),
          discardedAt: now,
        },
      })
      if (claimed.count === 0) {
        throw new ConflictException(
          `« ${absorb.title} » vient d’être fusionnée dans une autre fiche.`
        )
      }
      const sellerIds = await this.moveIn(tx, member, plan)
      const source = await tx.listing.findUniqueOrThrow({
        where: { id: absorb.id },
      })
      const values: Prisma.ListingUncheckedUpdateInput = {}
      for (const field of filled) {
        Object.assign(values, {
          [field]: (source as unknown as Record<string, unknown>)[field],
        })
      }
      const { principal } = sellersOf(plan.keep)
      const sellerKeys = plan.sellersPlan.principal
        ? ['sellerType', 'sellerName', 'sellerReference']
        : []
      let fieldSources = mergedFieldSources(
        keep.fieldSources,
        absorb.fieldSources,
        [...filled, ...sellerKeys]
      )
      if (price.kind === 'apply') {
        fieldSources = withListingProvenance(fieldSources, ['price'], now)
      }
      await tx.listing.update({
        where: { id: keep.id },
        data: {
          ...values,
          ...(plan.sellersPlan.principal
            ? sellerData(principal, plan.sellersPlan.principal)
            : {}),
          ...(plan.notes ? { notes: plan.notes.notes } : {}),
          ...(price.kind === 'apply'
            ? { price: new Prisma.Decimal(price.to) }
            : {}),
          fieldSources: fieldSources as Prisma.InputJsonValue,
          updatedAt: now,
        },
      })
      if (price.kind === 'apply') {
        await tx.priceEvent.create({
          data: priceEventData(keep.id, price.from, price.to, 'listing', now),
        })
      }
      await syncPrimaryLink(tx, keep.id)
      await syncPrimaryLink(tx, absorb.id)
      // Une proposition en cours sur le doublon n'a plus d'objet.
      await closeOpenDecisionsAsStale(tx, this.activity, {
        workspaceId: member.workspaceId,
        target: { listingId: absorb.id },
        actorMemberId: member.id,
        channel,
        why: `l’annonce a été fusionnée dans « ${keep.title} »`,
      })
      const moved: MergeMoved = {
        ...plan.moved,
        sellerIds,
        absorbedBefore: {
          status: absorb.status,
          discardReason: absorb.discardReason,
          discardedAt: absorb.discardedAt,
        },
      }
      const merge = await tx.listingMerge.create({
        data: {
          workspaceId: member.workspaceId,
          keptId: keep.id,
          absorbedId: absorb.id,
          mergedById: member.id,
          channel,
          mergedAt: now,
          summary,
          counts: plan.counts as unknown as Prisma.InputJsonValue,
          moved: moved as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: keep.id,
          actorMemberId: member.id,
          channel,
          action: 'listing.merged',
          before:
            price.kind === 'apply' ? { facts: { price: price.from } } : null,
          after: {
            mergeId: merge.id,
            absorbedId: absorb.id,
            absorbedTitle: absorb.title,
            summary,
            counts: plan.counts,
            ...(price.kind === 'apply' ? { facts: { price: price.to } } : {}),
          },
        },
        tx
      )
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: absorb.id,
          actorMemberId: member.id,
          channel,
          action: 'listing.absorbed',
          before: { status: absorb.status },
          after: { mergeId: merge.id, keptId: keep.id, keptTitle: keep.title },
        },
        tx
      )
      return merge.id
    })

    const needs = enrichmentNeeds([
      ...filled,
      ...(plan.moved.rentalPlan ? ['rentalPlan'] : []),
    ])
    if (needs.enrich) {
      await this.enrichment.enrich(member, keep.id, { dpe: needs.dpe, channel })
    }
    return this.result(member, mergeId, channel, price, summary, absorb.id)
  }

  /**
   * Annule une fusion : ce qui était venu de la fiche absorbée y retourne
   * (ce qui a été ajouté depuis sur la fiche gardée y reste), les champs
   * complétés qui n'ont pas été retouchés se vident, la fiche absorbée
   * retrouve son statut et sa place dans les listes.
   */
  async undo(member: Member, mergeId: string): Promise<ListingMergeResult> {
    const merge = await this.prisma.listingMerge.findFirst({
      where: { id: mergeId, workspaceId: member.workspaceId },
      include: {
        ...MERGE_INCLUDE,
        kept: { select: { title: true, mergedIntoId: true } },
        absorbed: { select: { title: true, mergedIntoId: true } },
      },
    })
    if (!merge) throw new NotFoundException('Fusion introuvable')
    if (merge.undoneAt || merge.absorbed.mergedIntoId !== merge.keptId) {
      throw new ConflictException('Cette fusion a déjà été annulée.')
    }
    if (merge.kept.mergedIntoId) {
      throw new ConflictException(
        `« ${merge.kept.title} » a elle-même été fusionnée dans une autre fiche : annule d’abord cette fusion-là.`
      )
    }
    const moved = MergeMovedSchema.parse(merge.moved)
    const keptId = merge.keptId
    const absorbedId = merge.absorbedId
    const item = await this.listings.get(member, keptId)
    const keep = item.listing
    const now = new Date()
    const before = linkStatesOf(item)
    const price = fichePriceDecision({
      fichePrice: keep.price,
      priceSource: keep.fieldSources.price?.source ?? null,
      before,
      after: before.filter(link => !moved.linkIds.includes(link.id)),
    })
    // Un champ complété se vide s'il porte encore la valeur reçue.
    const current = keep as unknown as Record<string, unknown>
    const emptied = Object.entries(moved.fields)
      .filter(
        ([field, value]) =>
          JSON.stringify(current[field] ?? null) === JSON.stringify(value)
      )
      .map(([field]) => field)
    const principalStillThere =
      moved.principalSeller !== null &&
      keep.sellerType === moved.principalSeller.sellerType &&
      keep.sellerName === moved.principalSeller.sellerName &&
      keep.sellerReference === moved.principalSeller.sellerReference
    const sellerKeys = principalStillThere
      ? ['sellerType', 'sellerName', 'sellerReference']
      : []
    const notes = moved.notesAppended
      ? withoutMergedNotes(keep.notes, moved.notesAppended)
      : keep.notes
    const fieldSources = { ...keep.fieldSources }
    for (const field of [...emptied, ...sellerKeys]) delete fieldSources[field]
    const provenance =
      price.kind === 'apply'
        ? withListingProvenance(fieldSources, ['price'], now)
        : fieldSources

    await this.prisma.$transaction(async tx => {
      const claimed = await tx.listingMerge.updateMany({
        where: { id: mergeId, undoneAt: null },
        data: { undoneAt: now, undoneById: member.id },
      })
      if (claimed.count === 0) {
        throw new ConflictException('Cette fusion a déjà été annulée.')
      }
      await this.moveBack(tx, keptId, absorbedId, moved)
      await tx.listing.update({
        where: { id: keptId },
        data: {
          ...Object.fromEntries(emptied.map(field => [field, null])),
          ...(principalStillThere
            ? {
                sellerType: 'unknown',
                sellerName: null,
                sellerReference: null,
                sellerReferenceKey: null,
              }
            : {}),
          notes,
          ...(price.kind === 'apply'
            ? { price: new Prisma.Decimal(price.to) }
            : {}),
          fieldSources: provenance as Prisma.InputJsonValue,
          updatedAt: now,
        },
      })
      if (price.kind === 'apply') {
        await tx.priceEvent.create({
          data: priceEventData(keptId, price.from, price.to, 'listing', now),
        })
      }
      const previous = moved.absorbedBefore
      await tx.listing.update({
        where: { id: absorbedId },
        data: {
          mergedIntoId: null,
          mergedAt: null,
          status: (previous?.status ??
            'to_study') as Prisma.ListingUncheckedUpdateInput['status'],
          discardReason: previous?.discardReason ?? null,
          discardedAt: previous?.discardedAt
            ? new Date(previous.discardedAt)
            : null,
        },
      })
      await syncPrimaryLink(tx, keptId)
      await syncPrimaryLink(tx, absorbedId)
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: keptId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'listing.unmerged',
          before:
            price.kind === 'apply' ? { facts: { price: price.from } } : null,
          after: {
            mergeId,
            absorbedId,
            absorbedTitle: merge.absorbed.title,
            ...(price.kind === 'apply' ? { facts: { price: price.to } } : {}),
          },
        },
        tx
      )
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: absorbedId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'listing.unabsorbed',
          after: { mergeId, keptId, keptTitle: merge.kept.title },
        },
        tx
      )
    })
    const needs = enrichmentNeeds(emptied)
    if (needs.enrich) {
      await this.enrichment.enrich(member, keptId, {
        dpe: needs.dpe,
        channel: 'web',
      })
    }
    return this.result(
      member,
      mergeId,
      'web',
      price,
      `Fusion annulée : « ${merge.absorbed.title} » redevient une fiche à part`,
      absorbedId
    )
  }

  /** Les deux fiches à jour après l'écriture (adéquation aux critères comprise), et la fusion. */
  private async result(
    member: Member,
    mergeId: string,
    channel: ActivityChannel,
    price: FichePriceDecision,
    summary: string,
    absorbedId: string
  ): Promise<ListingMergeResult> {
    const merge = await this.prisma.listingMerge.findUniqueOrThrow({
      where: { id: mergeId },
      include: MERGE_INCLUDE,
    })
    await this.listings.afterWrite(member, absorbedId, channel, 'status', {
      quiet: true,
    })
    const listing = await this.listings.afterWrite(
      member,
      merge.keptId,
      channel,
      price.kind === 'apply' ? priceTrigger(price.from, price.to) : 'updated'
    )
    return { merge: toMergeRecord(merge), listing, summary }
  }

  /** Charge les deux fiches et calcule ce qui passerait de l'une à l'autre. */
  private async plan(
    member: Member,
    keepId: string,
    absorbId: string
  ): Promise<MergePlan> {
    if (keepId === absorbId) {
      throw new BadRequestException(
        'Une fiche ne se fusionne pas avec elle-même.'
      )
    }
    const [keep, absorb] = await Promise.all([
      this.listings.get(member, keepId),
      this.listings.get(member, absorbId),
    ])
    const where = { listingId: { in: [keepId, absorbId] } }
    const [visits, offers, opinions, tasks, requests, checks, contacts, more] =
      await Promise.all([
        this.prisma.visit.findMany({
          where,
          select: { id: true, listingId: true, prepTaskId: true },
        }),
        this.prisma.offer.findMany({
          where,
          select: { id: true, listingId: true },
        }),
        this.prisma.opinion.findMany({
          where,
          select: { id: true, listingId: true, memberId: true },
        }),
        this.prisma.task.findMany({
          where,
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, listingId: true, label: true, requestId: true },
        }),
        this.prisma.agencyRequest.findMany({
          where: { listingId: absorbId },
          select: { id: true },
        }),
        this.prisma.listingCheck.findMany({
          where: { listingId: absorbId, linkId: { not: null } },
          select: { id: true },
        }),
        this.prisma.listingContact.findMany({
          where,
          select: { listingId: true },
        }),
        Promise.all([
          this.prisma.listingDraft.findMany({
            where: { listingId: absorbId },
            select: { id: true },
          }),
          this.prisma.explorationCandidate.findMany({
            where: { listingId: absorbId },
            select: { id: true },
          }),
        ]),
      ])
    const [drafts, lines] = more
    const of = <T extends { listingId: string }>(rows: T[], id: string): T[] =>
      rows.filter(row => row.listingId === id)

    // Un avis par membre et par fiche : celui de la fiche gardée reste.
    const keptAuthors = new Set(of(opinions, keepId).map(o => o.memberId))
    const movedOpinions = of(opinions, absorbId).filter(
      opinion => !keptAuthors.has(opinion.memberId)
    )
    // Les tâches que la fiche gardée n'a pas déjà ; celles d'une question à
    // l'agence ou d'une visite suivent toujours leur demande ou leur visite.
    const absorbTasks = of(tasks, absorbId)
    const movedVisits = of(visits, absorbId)
    const bound = new Set(
      movedVisits.map(v => v.prepTaskId).filter((id): id is string => !!id)
    )
    const byLabel = new Set(
      tasksToMove(of(tasks, keepId), absorbTasks).map(task => task.id)
    )
    const movedTasks = absorbTasks.filter(
      task =>
        byLabel.has(task.id) || task.requestId !== null || bound.has(task.id)
    )
    const hasContact = (id: string): boolean =>
      contacts.some(contact => contact.listingId === id)

    const facts = {
      keep: factsOf(
        keep,
        of(visits, keepId).length,
        of(opinions, keepId).length
      ),
      absorb: factsOf(
        absorb,
        movedVisits.length,
        of(opinions, absorbId).length
      ),
    }
    const fieldPlan = mergeFieldPlan(fieldValues(keep), fieldValues(absorb))
    const keepSellers = sellersOf(keep)
    const absorbSellers = sellersOf(absorb)
    const sellersPlan = mergeSellersPlan({
      keep: keepSellers.principal,
      keepOthers: keepSellers.others,
      absorb: absorbSellers.principal,
      absorbOthers: absorbSellers.others,
    })
    const notes = mergedNotes(
      keep.listing.notes,
      absorb.listing.notes,
      absorb.listing.title
    )
    const moved: MergePlan['moved'] = {
      linkIds: absorb.links.map(link => link.id),
      checkIds: checks.map(check => check.id),
      principalSeller: sellersPlan.principal
        ? {
            sellerType: sellersPlan.principal.sellerType,
            sellerName: sellersPlan.principal.sellerName,
            sellerReference: sellersPlan.principal.sellerReference,
          }
        : null,
      visitIds: movedVisits.map(visit => visit.id),
      offerIds: of(offers, absorbId).map(offer => offer.id),
      opinionIds: movedOpinions.map(opinion => opinion.id),
      taskIds: movedTasks.map(task => task.id),
      agencyRequestIds: requests.map(request => request.id),
      contact: hasContact(absorbId) && !hasContact(keepId),
      renovation:
        absorb.listing.renovation !== null && keep.listing.renovation === null,
      rentalPlan:
        absorb.listing.rentalPlan !== null && keep.listing.rentalPlan === null,
      draftIds: drafts.map(draft => draft.id),
      explorationLineIds: lines.map(line => line.id),
      fields: fieldPlan.values,
      notesAppended: notes?.appended ?? null,
    }
    const counts: ListingMergeCounts = {
      ...EMPTY_MERGE_COUNTS,
      links: moved.linkIds.length,
      sellers: sellersPlan.add.length + (sellersPlan.principal ? 1 : 0),
      visits: moved.visitIds.length,
      offers: moved.offerIds.length,
      opinions: moved.opinionIds.length,
      tasks: moved.taskIds.length,
      agencyRequests: moved.agencyRequestIds.length,
      fields: fieldPlan.fills.length,
      notes: notes !== null,
    }
    return {
      keep,
      absorb,
      refusal: mergeRefusal(facts.keep, facts.absorb),
      facts,
      fieldPlan,
      sellersPlan,
      notes,
      moved,
      counts,
      left: {
        opinionsKept: of(opinions, absorbId).length - movedOpinions.length,
        tasksKept: absorbTasks.length - movedTasks.length,
      },
    }
  }

  /** Fait passer à la fiche gardée ce que le plan désigne ; rend les agences créées. */
  private async moveIn(
    tx: Tx,
    member: Member,
    plan: MergePlan
  ): Promise<string[]> {
    const keepId = plan.keep.listing.id
    const absorbId = plan.absorb.listing.id
    const { moved } = plan
    const to = { listingId: keepId }
    const from = (list: readonly string[]) => ({
      id: { in: [...list] },
      listingId: absorbId,
    })
    await tx.listingLink.updateMany({ where: from(moved.linkIds), data: to })
    await tx.listingCheck.updateMany({ where: from(moved.checkIds), data: to })
    await tx.visit.updateMany({ where: from(moved.visitIds), data: to })
    await tx.offer.updateMany({ where: from(moved.offerIds), data: to })
    await tx.opinion.updateMany({ where: from(moved.opinionIds), data: to })
    await tx.agencyRequest.updateMany({
      where: from(moved.agencyRequestIds),
      data: to,
    })
    // Les tâches reprises se rangent à la suite de celles de la fiche gardée.
    const last = await tx.task.aggregate({
      where: { listingId: keepId },
      _max: { position: true },
    })
    let position = (last._max.position ?? -1) + 1
    for (const id of moved.taskIds) {
      await tx.task.updateMany({
        where: { id, listingId: absorbId },
        data: { listingId: keepId, position },
      })
      position += 1
    }
    if (moved.contact) {
      await tx.listingContact.update({
        where: { listingId: absorbId },
        data: to,
      })
    }
    if (moved.renovation) {
      await tx.renovation.update({ where: { listingId: absorbId }, data: to })
    }
    if (moved.rentalPlan) {
      await tx.rentalPlan.update({ where: { listingId: absorbId }, data: to })
    }
    await tx.listingDraft.updateMany({ where: from(moved.draftIds), data: to })
    await tx.explorationCandidate.updateMany({
      where: from(moved.explorationLineIds),
      data: to,
    })
    const sellerIds: string[] = []
    for (const seller of plan.sellersPlan.add) {
      const created = await createListingSeller(tx, {
        workspaceId: member.workspaceId,
        listingId: keepId,
        seller,
        origin: 'merge',
        addedById: member.id,
      })
      sellerIds.push(created.id)
    }
    return sellerIds
  }

  /** Rend à la fiche absorbée ce qui en était venu et qui est encore sur la fiche gardée. */
  private async moveBack(
    tx: Tx,
    keptId: string,
    absorbedId: string,
    moved: MergeMoved
  ): Promise<void> {
    const to = { listingId: absorbedId }
    const from = (list: readonly string[]) => ({
      id: { in: [...list] },
      listingId: keptId,
    })
    await tx.listingLink.updateMany({ where: from(moved.linkIds), data: to })
    await tx.listingCheck.updateMany({ where: from(moved.checkIds), data: to })
    await tx.visit.updateMany({ where: from(moved.visitIds), data: to })
    await tx.offer.updateMany({ where: from(moved.offerIds), data: to })
    await tx.opinion.updateMany({ where: from(moved.opinionIds), data: to })
    await tx.agencyRequest.updateMany({
      where: from(moved.agencyRequestIds),
      data: to,
    })
    await tx.task.updateMany({ where: from(moved.taskIds), data: to })
    await tx.listingDraft.updateMany({ where: from(moved.draftIds), data: to })
    await tx.explorationCandidate.updateMany({
      where: from(moved.explorationLineIds),
      data: to,
    })
    await tx.listingSeller.deleteMany({ where: from(moved.sellerIds) })
    // Un contact, des travaux ou une phase 2 ne retournent que si la fiche
    // absorbée n'en a pas reçu d'autres entre-temps (elle était cachée).
    if (moved.contact) {
      await tx.listingContact.updateMany({
        where: { listingId: keptId },
        data: to,
      })
    }
    if (moved.renovation) {
      await tx.renovation.updateMany({ where: { listingId: keptId }, data: to })
    }
    if (moved.rentalPlan) {
      await tx.rentalPlan.updateMany({ where: { listingId: keptId }, data: to })
    }
  }
}

/** Les champs du bien qu'une fusion peut compléter, lus sur une annonce vue. */
function fieldValues(item: EvaluatedListing): MergeFieldValues {
  const listing = item.listing as unknown as Record<string, unknown>
  return Object.fromEntries(
    MERGE_FILL_FIELDS.map(field => [field, listing[field]])
  )
}

function factsOf(
  item: EvaluatedListing,
  visits: number,
  opinions: number
): MergeListingFacts {
  return {
    id: item.listing.id,
    title: item.listing.title,
    status: item.listing.status,
    createdAt: item.listing.createdAt,
    mergedIntoId: item.mergedInto?.id ?? null,
    locationPrecision: item.listing.location.precision,
    counts: {
      links: item.links.length,
      visits,
      offers: item.offers.length,
      opinions,
      tasks: item.tasks.length,
    },
  }
}

function sideOf(
  item: EvaluatedListing,
  facts: MergeListingFacts
): ListingMergeSide {
  return {
    id: item.listing.id,
    title: item.listing.title,
    status: item.listing.status,
    price: item.listing.price,
    surface: item.listing.surface,
    commune: item.listing.location.commune,
    createdAt: item.listing.createdAt,
    updatedAt: item.listing.updatedAt,
    ...facts.counts,
  }
}
