import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  DecisionResultSchema,
  LISTING_STATUS_LABELS,
  WorkflowOverviewSchema,
} from '@apart/contracts'
import type {
  ActivityChannel,
  DecisionCard,
  DecisionChoice,
  DecisionInput,
  DecisionOutcome,
  DecisionProposal,
  DecisionRespond,
  DecisionResolution,
  DecisionResult,
  DecisionSessionResult,
  DecisionSettle,
  EvaluatedListing,
  ListingDraft,
  ListingDraftAcceptResult,
  ListingDraftBatchAccept,
  ListingDraftBatchAcceptResult,
  ListingDraftDecision,
  ListingStatus,
  ListingStatusChange,
  WorkflowOverview,
} from '@apart/contracts'
import {
  CREATED_LISTING_NO_UNDO,
  TO_SETTLE_MESSAGE,
  agreementRequired,
  appliedMessage,
  choiceLabel,
  choiceOfStatusChange,
  counterChoice,
  decideNowRefusal,
  decisionSides,
  isDecisionStale,
  isOpenDecision,
  joinFrench,
  mcpBlockedMessage,
  mcpProposedMessage,
  opinionHasRating,
  proposedMessage,
  reasonOfChoice,
  respondRefusal,
  settleRefusal,
  staleMessage,
  statusOfChoice,
  stepAfterResponse,
  waitingAfterAgreeMessage,
  waitingNames,
  withdrawRefusal,
  workflowOverview,
} from '@apart/domain'
import type { DecisionJournal, DecisionTargetState } from '@apart/domain'
import { randomUUID } from 'node:crypto'
import { ActivityService } from '../activity/activity.service'
import { DraftsService } from '../inbound/drafts.service'
import {
  listingInclude,
  toListingCriteriaFit,
} from '../listings/listing.mapper'
import { ListingsService } from '../listings/listings.service'
import { loadOpinionContext } from '../opinions/opinion-context'
import { PrismaService } from '../prisma/prisma.service'
import { refusalException } from '../workspace/members.service'
import { isUniqueViolation } from '../workspace/workspace.service'
import type { Member } from '../generated/prisma'
import {
  OPEN_STATES,
  decisionInclude,
  decisionViewOf,
  draftTitleOf,
  loadDecisionContext,
  toDecisionRecord,
} from './decision-context'
import type { DecisionContext, DecisionRow } from './decision-context'

/** Ce que retourne le changement de statut d'une annonce (REST, MCP). */
export interface StatusChangeOutcome {
  item: EvaluatedListing
  /** La proposition créée ou déjà en cours ; null si le statut a changé. */
  proposal: DecisionProposal | null
  outcome: 'proposed' | 'applied'
  message: string
}

/** Ce qu'une décision appliquée dit de la façon dont elle l'a été. */
interface ApplyOptions {
  resolution: DecisionResolution | 'undone'
  choice: DecisionChoice
  channel: ActivityChannel
  session: boolean
}

/**
 * Lot 21 (ADR 0031) : les décisions à plusieurs. Trier, c'est proposer :
 * garder ou écarter un brouillon, passer une annonce À visiter, écarter une
 * annonce attendent l'accord de tous les membres actifs si l'espace en a au
 * moins deux et si « Décider à plusieurs » est activé ; le reste, et tout
 * dans un espace à un membre, s'applique tout de suite. Les règles sont dans
 * `domain` (`decisions.ts`) ; ici, les transactions, le journal, l'appel des
 * services existants (`ListingsService.setStatus`, `DraftsService.accept`) et
 * le regroupement par session de tri.
 */
@Injectable()
export class DecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly listings: ListingsService,
    private readonly drafts: DraftsService
  ) {}

  context(workspaceId: string): Promise<DecisionContext> {
    return loadDecisionContext(this.prisma, workspaceId)
  }

  /** Les compteurs de la barre, « Ce qui t'attend » et les propositions en cours. */
  async overview(member: Member): Promise<WorkflowOverview> {
    const [ctx, opinions, listingRows, drafts, open] = await Promise.all([
      this.context(member.workspaceId),
      loadOpinionContext(this.prisma, member.workspaceId),
      this.prisma.listing.findMany({
        where: { workspaceId: member.workspaceId },
        select: {
          id: true,
          status: true,
          criteriaFitChangedAt: true,
          criteriaFitOrigin: true,
          criteriaMatches: listingInclude.criteriaMatches,
          visits: { select: { status: true } },
          opinions: {
            where: { memberId: member.id },
            include: { scores: true },
          },
          offers: {
            orderBy: { madeAt: 'desc' },
            take: 1,
            select: { response: true },
          },
        },
      }),
      this.drafts.list(member, 'pending'),
      this.prisma.decisionProposal.findMany({
        where: {
          workspaceId: member.workspaceId,
          state: { in: [...OPEN_STATES] },
        },
        include: decisionInclude,
        orderBy: { createdAt: 'asc' },
      }),
    ])
    const views = open.map(row => decisionViewOf(row, member, ctx))
    const byListing = new Map(
      views.filter(v => v.listingId).map(v => [v.listingId, v])
    )
    return WorkflowOverviewSchema.parse(
      workflowOverview({
        viewerId: member.id,
        decideTogether: ctx.decideTogether,
        activeMembers: ctx.active,
        listings: listingRows.map(row => {
          const mine = row.opinions[0]
          return {
            id: row.id,
            status: row.status,
            fit: toListingCriteriaFit(row),
            plannedVisits: row.visits.filter(v => v.status === 'planned')
              .length,
            viewerRated: opinionHasRating(
              mine
                ? {
                    rating: mine.rating,
                    scores: mine.scores.map(s => ({
                      key: s.criterionKey,
                      score: s.score,
                      word: s.word,
                    })),
                  }
                : null,
              opinions.visibleKeys
            ),
            lastOffer: row.offers[0]?.response ?? null,
            decision: byListing.get(row.id) ?? null,
          }
        }),
        drafts: drafts.map(draft => ({
          id: draft.id,
          fit: draft.fit,
          decision: draft.decision,
        })),
        proposals: views,
      })
    )
  }

  /** Les propositions à confirmer par ce membre, ou à trancher, avec ce qu'elles visent. */
  async cards(
    member: Member,
    kind: 'confirm' | 'settle'
  ): Promise<DecisionCard[]> {
    const ctx = await this.context(member.workspaceId)
    const rows = await this.prisma.decisionProposal.findMany({
      where: {
        workspaceId: member.workspaceId,
        state: kind === 'settle' ? 'to_settle' : 'open',
      },
      include: decisionInclude,
      orderBy: { createdAt: 'asc' },
    })
    const views = rows
      .map(row => decisionViewOf(row, member, ctx))
      .filter(v =>
        kind === 'settle' ? v.viewer.canSettle : v.viewer.canRespond
      )
    return Promise.all(
      views.map(async proposal => ({
        proposal,
        listing: proposal.listingId
          ? await this.listings.get(member, proposal.listingId)
          : null,
        draft: proposal.draftId
          ? await this.drafts.get(member, proposal.draftId)
          : null,
      }))
    )
  }

  /** Les propositions de l'espace, pour l'export. */
  async allForExport(member: Member): Promise<DecisionProposal[]> {
    const [ctx, rows] = await Promise.all([
      this.context(member.workspaceId),
      this.prisma.decisionProposal.findMany({
        where: { workspaceId: member.workspaceId },
        include: decisionInclude,
        orderBy: { createdAt: 'desc' },
      }),
    ])
    return rows.map(row => decisionViewOf(row, member, ctx))
  }

  // -------------------------------------------------------------------------
  // Décider
  // -------------------------------------------------------------------------

  /** `POST /decisions` : une proposition, ou appliqué tout de suite. */
  async decide(
    member: Member,
    input: DecisionInput,
    channel: ActivityChannel = 'web'
  ): Promise<DecisionResult> {
    const ctx = await this.context(member.workspaceId)
    const reason = input.reason?.trim() || null
    const session = input.sessionId ?? null
    if (input.target.kind === 'listing') {
      const row = await this.listingOf(member, input.target.id)
      if (input.expectedStatus && input.expectedStatus !== row.status) {
        throw this.expectedStatusConflict(input.expectedStatus, row.status)
      }
      const next = statusOfChoice(input.choice, row.status)
      if (next === row.status) {
        throw new ConflictException(
          `L’annonce est déjà « ${LISTING_STATUS_LABELS[row.status]} ».`
        )
      }
      if (agreementRequired(ctx.settings)) {
        const created = await this.propose(member, {
          target: { listingId: row.id },
          title: row.title,
          choice: input.choice,
          reason,
          fromStatus: row.status,
          sessionId: session,
          channel,
          ctx,
        })
        return this.result('proposed', {
          message: proposedMessage(waitingNames(created)),
          proposal: created,
          listingId: row.id,
          undoable: true,
        })
      }
      const item = await this.listings.setStatus(
        member,
        row.id,
        { status: next, reason },
        channel
      )
      return this.result('applied', {
        message: appliedMessage('listing', input.choice, item.listing.status),
        listingId: row.id,
        undoable: true,
      })
    }
    const draft = await this.drafts.get(member, input.target.id)
    if (agreementRequired(ctx.settings)) {
      const created = await this.proposeDraft(
        member,
        draft,
        input.choice,
        reason,
        session,
        channel,
        ctx
      )
      return this.result('proposed', {
        message: proposedMessage(waitingNames(created)),
        proposal: created,
        draftId: draft.id,
        undoable: true,
      })
    }
    if (input.choice === 'keep') {
      const accepted = await this.drafts.accept(member, draft.id)
      return this.result('applied', {
        message: appliedMessage('draft', 'keep', null),
        listingId: accepted.listingId,
        draftId: draft.id,
        createdListing: true,
        undoable: false,
      })
    }
    await this.drafts.decide(member, draft.id, {
      status: 'dismissed',
      ...(reason ? { reason } : {}),
    })
    return this.result('applied', {
      message: appliedMessage('draft', 'discard', null),
      draftId: draft.id,
      undoable: true,
    })
  }

  /** Une proposition sur un brouillon en attente (aucune autre ne doit être en cours). */
  private async proposeDraft(
    member: Member,
    draft: ListingDraft,
    choice: DecisionChoice,
    reason: string | null,
    sessionId: string | null,
    channel: ActivityChannel,
    ctx: DecisionContext
  ): Promise<DecisionProposal> {
    if (draft.status !== 'pending') {
      throw new ConflictException('Ce brouillon n’est plus à valider.')
    }
    return this.propose(member, {
      target: { draftId: draft.id },
      title: draft.listing.title,
      choice,
      reason,
      fromStatus: null,
      sessionId,
      channel,
      ctx,
    })
  }

  /** Écrit une proposition et son journal ; hors session, les autres sont prévenus. */
  private async propose(
    member: Member,
    input: {
      target: { listingId: string } | { draftId: string }
      title: string
      choice: DecisionChoice
      reason: string | null
      fromStatus: ListingStatus | null
      sessionId: string | null
      channel: ActivityChannel
      ctx: DecisionContext
    }
  ): Promise<DecisionProposal> {
    const kind = 'listingId' in input.target ? 'listing' : 'draft'
    const label = choiceLabel(kind, input.choice)
    try {
      const row = await this.prisma.$transaction(async tx => {
        const created = await tx.decisionProposal.create({
          data: {
            workspaceId: member.workspaceId,
            ...input.target,
            authorId: member.id,
            choice: input.choice,
            reason: input.reason,
            fromStatus: input.fromStatus,
            sessionId: input.sessionId,
            channel: input.channel,
            notifiedAt: input.sessionId ? null : new Date(),
          },
          include: decisionInclude,
        })
        await this.activity.record(
          {
            workspaceId: member.workspaceId,
            listingId:
              'listingId' in input.target ? input.target.listingId : null,
            actorMemberId: member.id,
            channel: input.channel,
            action: 'decision.proposed',
            after: {
              proposalId: created.id,
              target: kind,
              title: input.title,
              choice: input.choice,
              choiceLabel: label,
              reason: input.reason,
              fromStatus: input.fromStatus,
              session: input.sessionId !== null,
            },
          },
          tx
        )
        return created
      })
      return decisionViewOf(row, member, input.ctx)
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      throw new ConflictException(
        'Une proposition est déjà en cours sur cette annonce : répondez-y, ou retirez la vôtre.'
      )
    }
  }

  /**
   * `POST /listings/:id/status` et `set_listing_status` : une décision à deux
   * devient une proposition (au nom du membre connecté) ; le reste s'applique
   * tout de suite. Au MCP, une proposition d'un autre membre bloque l'appel :
   * Claude ne confirme jamais à sa place.
   */
  async changeStatus(
    member: Member,
    listingId: string,
    change: ListingStatusChange,
    channel: ActivityChannel = 'web'
  ): Promise<StatusChangeOutcome> {
    const row = await this.listingOf(member, listingId)
    if (change.expectedStatus && change.expectedStatus !== row.status) {
      throw this.expectedStatusConflict(change.expectedStatus, row.status)
    }
    if (change.status === 'discarded' && !change.reason?.trim()) {
      throw new BadRequestException('Écarter une annonce demande une raison')
    }
    const ctx = await this.context(member.workspaceId)
    const choice = choiceOfStatusChange(row.status, change.status)
    if (choice && agreementRequired(ctx.settings)) {
      const open = await this.prisma.decisionProposal.findFirst({
        where: { listingId, state: { in: [...OPEN_STATES] } },
        include: decisionInclude,
      })
      if (open)
        return this.onExistingProposal(member, open, choice, ctx, channel)
      const proposal = await this.propose(member, {
        target: { listingId },
        title: row.title,
        choice,
        reason: change.reason?.trim() || null,
        fromStatus: row.status,
        sessionId: null,
        channel,
        ctx,
      })
      return {
        item: await this.listings.get(member, listingId),
        proposal,
        outcome: 'proposed',
        message:
          channel === 'mcp'
            ? mcpProposedMessage({
                target: 'listing',
                fromStatus: row.status,
                names: waitingNames(proposal),
              })
            : proposedMessage(waitingNames(proposal)),
      }
    }
    const item = await this.listings.setStatus(
      member,
      listingId,
      change,
      channel
    )
    return {
      item,
      proposal: null,
      outcome: 'applied',
      message: `Statut : ${LISTING_STATUS_LABELS[item.listing.status]}.`,
    }
  }

  /**
   * Une proposition est déjà en cours sur l'annonce. La sienne, identique :
   * rien à refaire. Sinon, refus : au MCP, jamais de confirmation à la place
   * d'un autre membre, on renvoie vers l'application.
   */
  private async onExistingProposal(
    member: Member,
    open: DecisionRow,
    choice: DecisionChoice,
    ctx: DecisionContext,
    channel: ActivityChannel
  ): Promise<StatusChangeOutcome> {
    const view = decisionViewOf(open, member, ctx)
    if (open.authorId === member.id && open.choice === choice) {
      return {
        item: await this.listings.get(member, view.listingId as string),
        proposal: view,
        outcome: 'proposed',
        message:
          channel === 'mcp'
            ? mcpProposedMessage({
                target: 'listing',
                fromStatus: open.fromStatus,
                names: waitingNames(view),
              })
            : proposedMessage(waitingNames(view)),
      }
    }
    if (channel === 'mcp') {
      throw new ConflictException(
        mcpBlockedMessage({
          authorName: view.author?.displayName ?? 'Un membre',
          choiceLabel: view.choiceLabel,
          toSettle: view.state === 'to_settle',
        })
      )
    }
    throw new ConflictException(
      view.state === 'to_settle'
        ? 'Vos choix diffèrent sur cette annonce : tranchez-la dans « À trancher ensemble ».'
        : 'Une proposition est déjà en cours sur cette annonce : répondez-y, ou retirez la vôtre.'
    )
  }

  // -------------------------------------------------------------------------
  // Les routes historiques des brouillons (lot 16), à la même règle
  // -------------------------------------------------------------------------

  /** « Ajouter à la liste » : une proposition à plusieurs, l'annonce sinon. */
  async keepDraft(
    member: Member,
    id: string
  ): Promise<ListingDraftAcceptResult> {
    const ctx = await this.context(member.workspaceId)
    const draft = await this.drafts.get(member, id)
    if (agreementRequired(ctx.settings)) {
      const proposal = await this.proposeDraft(
        member,
        draft,
        'keep',
        null,
        null,
        'web',
        ctx
      )
      return {
        draft: { ...draft, decision: proposal },
        listingId: null,
        title: draft.listing.title,
      }
    }
    return this.drafts.accept(member, id)
  }

  /** `PATCH /listing-drafts/:id` : écarter passe par la même règle ; l'ajout par formulaire aussi. */
  async decideDraft(
    member: Member,
    id: string,
    decision: ListingDraftDecision
  ): Promise<ListingDraft> {
    if (decision.status === 'pending') {
      return this.drafts.decide(member, id, decision)
    }
    const ctx = await this.context(member.workspaceId)
    if (!agreementRequired(ctx.settings)) {
      return this.drafts.decide(member, id, decision)
    }
    if (decision.status === 'accepted') {
      throw new ConflictException(
        'Dans un espace à plusieurs, on garde un brouillon depuis « À valider » : les autres membres confirment, puis l’annonce est créée.'
      )
    }
    const reason = decision.reason?.trim() || null
    if (!reason) {
      throw new BadRequestException('Écarter demande une raison')
    }
    const draft = await this.drafts.get(member, id)
    const proposal = await this.proposeDraft(
      member,
      draft,
      'discard',
      reason,
      null,
      'web',
      ctx
    )
    return { ...draft, decision: proposal }
  }

  /**
   * « Ajouter celles « dans les critères » » : à plusieurs, une seule session
   * de propositions, donc une seule notification.
   */
  async keepInCriteria(
    member: Member,
    request: ListingDraftBatchAccept
  ): Promise<ListingDraftBatchAcceptResult> {
    const ctx = await this.context(member.workspaceId)
    if (!agreementRequired(ctx.settings)) {
      const result = await this.drafts.acceptInCriteria(member, request)
      return { ...result, proposed: 0 }
    }
    const sessionId = randomUUID()
    const drafts = await this.drafts.list(
      member,
      'pending',
      request.explorationId
    )
    const accepted: ListingDraftBatchAcceptResult['accepted'] = []
    let skipped = 0
    for (const draft of drafts) {
      const undecided = draft.duplicates.length > 0 && !draft.distinct
      if (draft.fit?.level !== 'in' || undecided || draft.decision) {
        skipped += 1
        continue
      }
      await this.proposeDraft(
        member,
        draft,
        'keep',
        null,
        sessionId,
        'web',
        ctx
      )
      accepted.push({
        draftId: draft.id,
        listingId: null,
        title: draft.listing.title,
      })
    }
    if (accepted.length > 0) await this.finishSession(member, sessionId)
    return { accepted, skipped, proposed: accepted.length }
  }

  // -------------------------------------------------------------------------
  // Répondre, trancher, retirer
  // -------------------------------------------------------------------------

  /** D'accord, ou non avec un autre choix ; plus tard n'écrit rien. */
  async respond(
    member: Member,
    id: string,
    input: DecisionRespond
  ): Promise<DecisionResult> {
    const ctx = await this.context(member.workspaceId)
    const row = await this.row(member, id)
    const record = toDecisionRecord(row)
    const refusal = respondRefusal(record, member.id)
    if (refusal) throw refusalException(refusal)
    const session = input.sessionId ?? null
    const reason = input.reason?.trim() || null
    if (!input.agree) {
      return this.disagree(member, row, input, reason, session, ctx)
    }
    let response: { id: string }
    try {
      response = await this.prisma.decisionResponse.create({
        data: {
          proposalId: id,
          memberId: member.id,
          agrees: true,
          reason,
          sessionId: session,
        },
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      throw new ConflictException('Vous avez déjà répondu à cette proposition.')
    }
    const fresh = await this.row(member, id)
    const step = stepAfterResponse(
      record,
      { memberId: member.id, agrees: true },
      ctx.settings.activeMemberIds
    )
    if (step === 'apply') {
      try {
        return await this.applyProposal(member, fresh, ctx, {
          resolution: 'agreed',
          choice: fresh.choice,
          channel: 'web',
          session: session !== null,
        })
      } catch (error) {
        // La décision n'a pas pu s'appliquer : la réponse ne compte pas.
        await this.prisma.decisionResponse.delete({
          where: { id: response.id },
        })
        throw error
      }
    }
    await this.activity.record({
      workspaceId: member.workspaceId,
      listingId: fresh.listingId,
      actorMemberId: member.id,
      channel: 'web',
      action: 'decision.answered',
      after: {
        proposalId: id,
        choiceLabel: choiceLabel(this.targetKind(fresh), fresh.choice),
        session: session !== null,
      },
    })
    const view = decisionViewOf(fresh, member, ctx)
    return this.result('waiting', {
      message: waitingAfterAgreeMessage(waitingNames(view)),
      proposal: view,
      listingId: fresh.listingId,
      draftId: fresh.draftId,
      undoable: true,
    })
  }

  private async disagree(
    member: Member,
    row: DecisionRow,
    input: DecisionRespond,
    reason: string | null,
    session: string | null,
    ctx: DecisionContext
  ): Promise<DecisionResult> {
    const kind = this.targetKind(row)
    const counter =
      input.choice ?? counterChoice(kind, row.choice, row.fromStatus)
    if (counter === row.choice) {
      throw new BadRequestException(
        'Dire non demande un autre choix que celui de la proposition'
      )
    }
    await this.prisma.$transaction(async tx => {
      await tx.decisionResponse.create({
        data: {
          proposalId: row.id,
          memberId: member.id,
          agrees: false,
          choice: counter,
          reason,
          sessionId: session,
        },
      })
      const moved = await tx.decisionProposal.updateMany({
        where: { id: row.id, state: 'open' },
        data: { state: 'to_settle' },
      })
      if (moved.count === 0) {
        throw new ConflictException('Cette proposition n’est plus en cours.')
      }
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: row.listingId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'decision.disagreed',
          after: {
            proposalId: row.id,
            choice: counter,
            choiceLabel: choiceLabel(kind, counter),
            proposedLabel: choiceLabel(kind, row.choice),
            authorName: row.authorId
              ? (ctx.names.get(row.authorId) ?? null)
              : null,
            reason,
            session: session !== null,
          },
        },
        tx
      )
    })
    return this.result('to_settle', {
      message: TO_SETTLE_MESSAGE,
      proposal: decisionViewOf(await this.row(member, row.id), member, ctx),
      listingId: row.listingId,
      draftId: row.draftId,
      undoable: true,
    })
  }

  /** « À trancher ensemble » : un clic d'un membre sur l'un des choix suffit. */
  async settle(
    member: Member,
    id: string,
    input: DecisionSettle
  ): Promise<DecisionResult> {
    const ctx = await this.context(member.workspaceId)
    const row = await this.row(member, id)
    const refusal = settleRefusal(toDecisionRecord(row), input.choice)
    if (refusal) throw refusalException(refusal)
    return this.applyProposal(member, row, ctx, {
      resolution: 'settled',
      choice: input.choice,
      channel: 'web',
      session: false,
    })
  }

  /** « Décider sans attendre » : l'auteur, sur une proposition ouverte. */
  async decideNow(member: Member, id: string): Promise<DecisionResult> {
    const ctx = await this.context(member.workspaceId)
    const row = await this.row(member, id)
    const refusal = decideNowRefusal(toDecisionRecord(row), member.id)
    if (refusal) throw refusalException(refusal)
    return this.applyProposal(member, row, ctx, {
      resolution: 'without_waiting',
      choice: row.choice,
      channel: 'web',
      session: false,
    })
  }

  /** Retirer sa proposition. */
  async withdraw(member: Member, id: string): Promise<DecisionResult> {
    const ctx = await this.context(member.workspaceId)
    const row = await this.row(member, id)
    const refusal = withdrawRefusal(toDecisionRecord(row), member.id)
    if (refusal) throw refusalException(refusal)
    await this.prisma.$transaction(async tx => {
      const moved = await tx.decisionProposal.updateMany({
        where: { id, state: { in: [...OPEN_STATES] } },
        data: {
          state: 'withdrawn',
          closedAt: new Date(),
          closedById: member.id,
        },
      })
      if (moved.count === 0) {
        throw new ConflictException('Cette proposition n’est plus en cours.')
      }
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: row.listingId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'decision.withdrawn',
          after: {
            proposalId: id,
            choiceLabel: choiceLabel(this.targetKind(row), row.choice),
            // Sans notification de la session, personne n'a rien à apprendre.
            notified: row.notifiedAt !== null,
            title: this.titleOf(row),
          },
        },
        tx
      )
    })
    return this.result('withdrawn', {
      message: 'Proposition retirée.',
      proposal: decisionViewOf(await this.row(member, id), member, ctx),
      listingId: row.listingId,
      draftId: row.draftId,
    })
  }

  /**
   * « Annuler » la dernière décision d'une session : retire la proposition,
   * la réponse, ou remet l'annonce à son statut de départ. Jamais quand un
   * brouillon est devenu une annonce : pas de suppression.
   */
  async undo(member: Member, id: string): Promise<DecisionResult> {
    const ctx = await this.context(member.workspaceId)
    const row = await this.row(member, id)
    if (isOpenDecision(row.state)) {
      const mine = row.responses.find(r => r.memberId === member.id)
      if (mine) return this.undoResponse(member, row, mine.id, ctx)
      return this.withdraw(member, id)
    }
    if (row.state !== 'applied' || row.closedById !== member.id) {
      throw new ConflictException('Cette décision ne peut plus être annulée.')
    }
    if (row.draftId && row.appliedChoice === 'keep') {
      throw new ConflictException(CREATED_LISTING_NO_UNDO)
    }
    return this.undoApplied(member, row, ctx)
  }

  private async undoResponse(
    member: Member,
    row: DecisionRow,
    responseId: string,
    ctx: DecisionContext
  ): Promise<DecisionResult> {
    await this.prisma.$transaction(async tx => {
      await tx.decisionResponse.delete({ where: { id: responseId } })
      if (row.state === 'to_settle') {
        const others = await tx.decisionResponse.count({
          where: { proposalId: row.id, agrees: false },
        })
        if (others === 0) {
          await tx.decisionProposal.update({
            where: { id: row.id },
            data: { state: 'open' },
          })
        }
      }
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: row.listingId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'decision.response_undone',
          after: {
            proposalId: row.id,
            choiceLabel: choiceLabel(this.targetKind(row), row.choice),
          },
        },
        tx
      )
    })
    return this.result('waiting', {
      message: 'Réponse annulée.',
      proposal: decisionViewOf(await this.row(member, row.id), member, ctx),
      listingId: row.listingId,
      draftId: row.draftId,
    })
  }

  private async undoApplied(
    member: Member,
    row: DecisionRow,
    ctx: DecisionContext
  ): Promise<DecisionResult> {
    const journal = this.journal(row, ctx, member, {
      resolution: 'undone',
      choice: row.appliedChoice ?? row.choice,
      channel: 'web',
      session: true,
    })
    if (row.listingId) {
      const from = row.fromStatus as ListingStatus
      const stillThere =
        row.listing?.status ===
        statusOfChoice(row.appliedChoice ?? row.choice, from)
      if (!stillThere) {
        throw new ConflictException(
          'L’annonce a changé d’étape depuis : cette décision ne peut plus être annulée.'
        )
      }
      if (row.appliedChoice !== 'keep') {
        await this.listings.setStatus(
          member,
          row.listingId,
          { status: from, reason: null },
          'web',
          { decision: journal }
        )
      }
    } else if (row.draftId) {
      await this.drafts.decide(member, row.draftId, { status: 'pending' })
    }
    const previousState = row.resolution === 'settled' ? 'to_settle' : 'open'
    await this.prisma.$transaction(async tx => {
      await tx.decisionProposal.update({
        where: { id: row.id },
        data: {
          state: previousState,
          resolution: null,
          appliedChoice: null,
          closedAt: null,
          closedById: null,
        },
      })
      if (row.resolution === 'agreed') {
        await tx.decisionResponse.deleteMany({
          where: { proposalId: row.id, memberId: member.id },
        })
      }
    })
    return this.result('waiting', {
      message: 'Décision annulée.',
      proposal: decisionViewOf(await this.row(member, row.id), member, ctx),
      listingId: row.listingId,
      draftId: row.draftId,
    })
  }

  // -------------------------------------------------------------------------
  // Sessions de tri
  // -------------------------------------------------------------------------

  /**
   * « Terminer et prévenir » : une notification pour la session, s'il y a au
   * moins une proposition ou une réponse pas encore annoncée. Sans effet la
   * seconde fois.
   */
  async finishSession(
    member: Member,
    sessionId: string
  ): Promise<DecisionSessionResult> {
    const ctx = await this.context(member.workspaceId)
    const proposals = await this.prisma.decisionProposal.findMany({
      where: {
        workspaceId: member.workspaceId,
        authorId: member.id,
        sessionId,
        notifiedAt: null,
        state: { in: [...OPEN_STATES] },
      },
    })
    const responses = await this.prisma.decisionResponse.findMany({
      where: { memberId: member.id, sessionId, notifiedAt: null },
      include: { proposal: true },
    })
    if (proposals.length === 0 && responses.length === 0) {
      return {
        notified: false,
        applied: 0,
        stale: 0,
        message: 'Rien à prévenir.',
      }
    }
    const now = new Date()
    await this.prisma.$transaction(async tx => {
      if (proposals.length > 0) {
        await tx.decisionProposal.updateMany({
          where: { id: { in: proposals.map(p => p.id) } },
          data: { notifiedAt: now },
        })
        const keep = proposals.filter(p => p.choice !== 'discard').length
        await this.activity.record(
          {
            workspaceId: member.workspaceId,
            actorMemberId: member.id,
            channel: 'web',
            action: 'decision.session_finished',
            after: {
              sessionId,
              keep,
              discard: proposals.length - keep,
            },
          },
          tx
        )
      }
      if (responses.length > 0) {
        await tx.decisionResponse.updateMany({
          where: { id: { in: responses.map(r => r.id) } },
          data: { notifiedAt: now },
        })
        const perAuthor = new Map<
          string,
          {
            authorId: string
            changed: number
            toSettle: number
            waiting: number
          }
        >()
        for (const response of responses) {
          const authorId = response.proposal.authorId
          if (!authorId) continue
          const entry = perAuthor.get(authorId) ?? {
            authorId,
            changed: 0,
            toSettle: 0,
            waiting: 0,
          }
          if (response.proposal.state === 'applied') entry.changed += 1
          else if (response.proposal.state === 'to_settle') entry.toSettle += 1
          else if (response.proposal.state === 'open') entry.waiting += 1
          perAuthor.set(authorId, entry)
        }
        const entries = [...perAuthor.values()]
        await this.activity.record(
          {
            workspaceId: member.workspaceId,
            actorMemberId: member.id,
            channel: 'web',
            action: 'decision.session_answered',
            after: {
              sessionId,
              perAuthor: entries,
              authorNames: joinFrench(
                entries
                  .map(e => ctx.names.get(e.authorId))
                  .filter((n): n is string => Boolean(n))
              ),
              changed: entries.reduce((sum, e) => sum + e.changed, 0),
              toSettle: entries.reduce((sum, e) => sum + e.toSettle, 0),
              waiting: entries.reduce((sum, e) => sum + e.waiting, 0),
            },
          },
          tx
        )
      }
    })
    return {
      notified: true,
      applied: 0,
      stale: 0,
      message:
        proposals.length > 0
          ? `${joinFrench(ctx.active.filter(m => m.id !== member.id).map(m => m.displayName))} ${ctx.active.length > 2 ? 'ont reçu' : 'a reçu'} une seule notification.`
          : 'C’est envoyé.',
    }
  }

  /** « Décider sans attendre » à la fin d'une session : tous ses choix. */
  async decideSessionNow(
    member: Member,
    sessionId: string
  ): Promise<DecisionSessionResult> {
    const ctx = await this.context(member.workspaceId)
    const rows = await this.prisma.decisionProposal.findMany({
      where: {
        workspaceId: member.workspaceId,
        authorId: member.id,
        sessionId,
        state: 'open',
      },
      include: decisionInclude,
      orderBy: { createdAt: 'asc' },
    })
    let applied = 0
    let stale = 0
    for (const row of rows) {
      const result = await this.applyProposal(member, row, ctx, {
        resolution: 'without_waiting',
        choice: row.choice,
        channel: 'web',
        session: true,
      })
      if (result.outcome === 'stale') stale += 1
      else applied += 1
    }
    let notified = false
    if (applied > 0) {
      await this.prisma.decisionProposal.updateMany({
        where: { id: { in: rows.map(r => r.id) } },
        data: { notifiedAt: new Date() },
      })
      const keep = rows.filter(r => r.choice !== 'discard').length
      await this.activity.record({
        workspaceId: member.workspaceId,
        actorMemberId: member.id,
        channel: 'web',
        action: 'decision.session_finished',
        after: {
          sessionId,
          keep,
          discard: rows.length - keep,
          decidedNow: true,
        },
      })
      notified = true
    }
    const others = joinFrench(
      ctx.active.filter(m => m.id !== member.id).map(m => m.displayName)
    )
    return {
      notified,
      applied,
      stale,
      message:
        applied > 0
          ? `C’est appliqué. Le journal indique que tu as décidé sans attendre ${others}.`
          : 'Rien à appliquer.',
    }
  }

  // -------------------------------------------------------------------------
  // Appliquer
  // -------------------------------------------------------------------------

  /**
   * Applique une proposition : si ce qu'elle vise a changé, elle se ferme
   * caduque sans rien appliquer ; sinon elle est réservée, puis la décision
   * passe par les services existants (journal, enrichissements, adéquation).
   */
  private async applyProposal(
    member: Member,
    row: DecisionRow,
    ctx: DecisionContext,
    options: ApplyOptions
  ): Promise<DecisionResult> {
    const kind = this.targetKind(row)
    const target: DecisionTargetState =
      kind === 'listing'
        ? { kind, status: row.listing?.status as ListingStatus }
        : {
            kind,
            status: row.draft?.status as 'pending',
          }
    if (isDecisionStale(row.fromStatus, target)) {
      return this.closeStale(member, row, target, ctx)
    }
    const previous = { state: row.state }
    const claim = await this.prisma.decisionProposal.updateMany({
      where: { id: row.id, state: { in: [...OPEN_STATES] } },
      data: {
        state: 'applied',
        resolution: options.resolution === 'undone' ? null : options.resolution,
        appliedChoice: options.choice,
        closedAt: new Date(),
        closedById: member.id,
      },
    })
    if (claim.count === 0) {
      throw new ConflictException('Cette proposition n’est plus en cours.')
    }
    const journal = this.journal(row, ctx, member, options)
    const reason = reasonOfChoice(toDecisionRecord(row), options.choice)
    try {
      if (kind === 'listing') {
        return await this.applyToListing(
          member,
          row,
          ctx,
          options,
          journal,
          reason
        )
      }
      return await this.applyToDraft(member, row, ctx, options, journal, reason)
    } catch (error) {
      // Le service a refusé : la proposition redevient ce qu'elle était.
      await this.prisma.decisionProposal.update({
        where: { id: row.id },
        data: {
          state: previous.state,
          resolution: null,
          appliedChoice: null,
          closedAt: null,
          closedById: null,
        },
      })
      throw error
    }
  }

  private async applyToListing(
    member: Member,
    row: DecisionRow,
    ctx: DecisionContext,
    options: ApplyOptions,
    journal: DecisionJournal,
    reason: string | null
  ): Promise<DecisionResult> {
    const listingId = row.listingId as string
    const from = row.fromStatus as ListingStatus
    const status = statusOfChoice(options.choice, from)
    if (status === from) {
      // On garde l'annonce où elle est : rien ne change, le journal le dit.
      await this.activity.record({
        workspaceId: member.workspaceId,
        listingId,
        actorMemberId: member.id,
        channel: options.channel,
        action: 'decision.kept',
        after: {
          proposalId: row.id,
          status: from,
          title: this.titleOf(row),
          decision: journal,
        },
      })
    } else {
      await this.listings.setStatus(
        member,
        listingId,
        { status, reason: status === 'discarded' ? reason : null },
        options.channel,
        { decision: journal }
      )
    }
    return this.result('applied', {
      message: appliedMessage('listing', options.choice, status),
      proposal: decisionViewOf(await this.row(member, row.id), member, ctx),
      listingId,
      undoable: true,
    })
  }

  private async applyToDraft(
    member: Member,
    row: DecisionRow,
    ctx: DecisionContext,
    options: ApplyOptions,
    journal: DecisionJournal,
    reason: string | null
  ): Promise<DecisionResult> {
    const draftId = row.draftId as string
    if (options.choice === 'keep') {
      const accepted = await this.drafts.accept(member, draftId, {
        decision: journal,
      })
      return this.result('applied', {
        message: appliedMessage('draft', 'keep', null),
        proposal: decisionViewOf(await this.row(member, row.id), member, ctx),
        listingId: accepted.listingId,
        draftId,
        createdListing: true,
        undoable: false,
      })
    }
    await this.drafts.decide(
      member,
      draftId,
      { status: 'dismissed', ...(reason ? { reason } : {}) },
      { decision: journal }
    )
    return this.result('applied', {
      message: appliedMessage('draft', 'discard', null),
      proposal: decisionViewOf(await this.row(member, row.id), member, ctx),
      draftId,
      undoable: true,
    })
  }

  private async closeStale(
    member: Member,
    row: DecisionRow,
    target: DecisionTargetState,
    ctx: DecisionContext
  ): Promise<DecisionResult> {
    const message = staleMessage(row.fromStatus, target)
    await this.prisma.$transaction(async tx => {
      await tx.decisionProposal.updateMany({
        where: { id: row.id, state: { in: [...OPEN_STATES] } },
        data: { state: 'stale', closedAt: new Date(), closedById: member.id },
      })
      await this.activity.record(
        {
          workspaceId: member.workspaceId,
          listingId: row.listingId,
          actorMemberId: member.id,
          channel: 'web',
          action: 'decision.stale',
          after: {
            proposalId: row.id,
            choiceLabel: choiceLabel(this.targetKind(row), row.choice),
            why: message,
          },
        },
        tx
      )
    })
    return this.result('stale', {
      message,
      proposal: decisionViewOf(await this.row(member, row.id), member, ctx),
      listingId: row.listingId,
      draftId: row.draftId,
    })
  }

  /** Ce que la ligne de statut ou de brouillon garde de la décision. */
  private journal(
    row: DecisionRow,
    ctx: DecisionContext,
    member: Member,
    options: ApplyOptions
  ): DecisionJournal {
    const view = decisionViewOf(row, member, ctx)
    const kind = this.targetKind(row)
    return {
      proposalId: row.id,
      resolution: options.resolution,
      authorName: row.authorId ? (ctx.names.get(row.authorId) ?? null) : null,
      waitedForNames: view.waitingFor
        .filter(m => m.id !== member.id)
        .map(m => m.displayName),
      sides:
        row.state === 'to_settle'
          ? decisionSides(view).map(side => ({
              name: side.who,
              label: side.choiceLabel,
            }))
          : undefined,
      choiceLabel: choiceLabel(kind, options.choice),
      session: options.session,
    }
  }

  // -------------------------------------------------------------------------

  private result(
    outcome: DecisionOutcome,
    fields: {
      message: string
      proposal?: DecisionProposal | null
      listingId?: string | null
      draftId?: string | null
      createdListing?: boolean
      undoable?: boolean
    }
  ): DecisionResult {
    return DecisionResultSchema.parse({
      outcome,
      message: fields.message,
      proposal: fields.proposal ?? null,
      listingId: fields.listingId ?? null,
      draftId: fields.draftId ?? null,
      createdListing: fields.createdListing ?? false,
      undoable: fields.undoable ?? false,
    })
  }

  private targetKind(row: Pick<DecisionRow, 'listingId'>): 'listing' | 'draft' {
    return row.listingId ? 'listing' : 'draft'
  }

  private titleOf(row: DecisionRow): string {
    return (
      row.listing?.title ??
      (row.draft ? draftTitleOf(row.draft.input) : 'Annonce')
    )
  }

  private expectedStatusConflict(
    expected: ListingStatus,
    current: ListingStatus
  ): ConflictException {
    return new ConflictException(
      `Le statut attendu était « ${expected} », l'annonce est « ${current} »`
    )
  }

  private async listingOf(
    member: Member,
    id: string
  ): Promise<{ id: string; title: string; status: ListingStatus }> {
    const row = await this.prisma.listing.findFirst({
      where: { id, workspaceId: member.workspaceId },
      select: { id: true, title: true, status: true },
    })
    if (!row) throw new NotFoundException('Annonce introuvable')
    return row
  }

  private async row(member: Member, id: string): Promise<DecisionRow> {
    const row = await this.prisma.decisionProposal.findFirst({
      where: { id, workspaceId: member.workspaceId },
      include: decisionInclude,
    })
    if (!row) throw new NotFoundException('Proposition introuvable')
    return row
  }
}
