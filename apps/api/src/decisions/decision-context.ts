import { ListingInputSchema } from '@apart/contracts'
import type { ActivityChannel, DecisionProposal } from '@apart/contracts'
import { choiceLabel, decisionProposalView } from '@apart/domain'
import type {
  DecisionNames,
  DecisionRecord,
  DecisionSettings,
} from '@apart/domain'
import type { ActivityService } from '../activity/activity.service'
import type { DecisionState, Member, Prisma } from '../generated/prisma'
import { MEMBER_ORDER } from '../workspace/member-order'

/**
 * Lot 21 (ADR 0031) : ce qu'une proposition demande pour être lue ou close.
 * Des fonctions sur un client Prisma (pas de service) : les annonces, les
 * brouillons et les membres les appellent sans dépendre du module des
 * décisions, comme `opinion-context.ts` au lot 20.
 */

type Db = Prisma.TransactionClient

/** Les états d'une proposition qui attend encore (ouverte ou à trancher). */
export const OPEN_STATES: DecisionState[] = ['open', 'to_settle']

/** Le filtre d'une proposition en cours, dans les `include` des annonces et des brouillons. */
export const openDecisionWhere = { state: { in: OPEN_STATES } }

/** Une proposition avec ce qu'il faut pour la lire. */
export const decisionInclude = {
  responses: { orderBy: { createdAt: 'asc' } },
  listing: { select: { id: true, title: true, status: true } },
  draft: { select: { id: true, input: true, status: true } },
} as const

export type DecisionRow = Prisma.DecisionProposalGetPayload<{
  include: typeof decisionInclude
}>

/** Ce que la règle et les lectures savent de l'espace. */
export interface DecisionContext extends DecisionNames {
  decideTogether: boolean
  settings: DecisionSettings
}

export async function loadDecisionContext(
  db: Db,
  workspaceId: string
): Promise<DecisionContext> {
  const [workspace, members] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { decideTogether: true },
    }),
    db.member.findMany({
      where: { workspaceId, status: { in: ['active', 'removed'] } },
      select: { id: true, displayName: true, status: true },
      orderBy: MEMBER_ORDER,
    }),
  ])
  const active = members
    .filter(m => m.status === 'active')
    .map(m => ({ id: m.id, displayName: m.displayName }))
  return {
    decideTogether: workspace.decideTogether,
    active,
    names: new Map(members.map(m => [m.id, m.displayName])),
    settings: {
      decideTogether: workspace.decideTogether,
      activeMemberIds: active.map(m => m.id),
    },
  }
}

/** Le titre d'un brouillon, lu dans sa fiche pré-remplie. */
export function draftTitleOf(input: unknown): string {
  const parsed = ListingInputSchema.safeParse(input)
  return parsed.success ? parsed.data.title : 'Annonce reçue'
}

/** La ligne de la base, telle que `domain` la lit. */
export function toDecisionRecord(row: DecisionRow): DecisionRecord {
  return {
    id: row.id,
    target: row.listingId ? 'listing' : 'draft',
    listingId: row.listingId,
    draftId: row.draftId,
    title:
      row.listing?.title ??
      (row.draft ? draftTitleOf(row.draft.input) : 'Annonce'),
    choice: row.choice,
    reason: row.reason,
    state: row.state,
    resolution: row.resolution,
    appliedChoice: row.appliedChoice,
    fromStatus: row.fromStatus,
    authorId: row.authorId,
    channel: row.channel,
    sessionId: row.sessionId,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    closedById: row.closedById,
    responses: row.responses.map(r => ({
      memberId: r.memberId,
      agrees: r.agrees,
      choice: r.choice,
      reason: r.reason,
      at: r.createdAt.toISOString(),
    })),
  }
}

/** Une proposition telle que ce membre la lit. */
export function decisionViewOf(
  row: DecisionRow,
  viewer: Pick<Member, 'id'>,
  context: DecisionNames
): DecisionProposal {
  return decisionProposalView(toDecisionRecord(row), viewer.id, context)
}

/**
 * Un fait appliqué directement (l'annonce est vendue, le brouillon reconnu
 * comme une annonce suivie) rend caduque la proposition ouverte : elle se
 * ferme, journalisée, sans rien appliquer.
 */
export async function closeOpenDecisionsAsStale(
  tx: Prisma.TransactionClient,
  activity: ActivityService,
  input: {
    workspaceId: string
    target: { listingId: string } | { draftId: string }
    actorMemberId: string | null
    channel: ActivityChannel
    why: string
  }
): Promise<number> {
  const open = await tx.decisionProposal.findMany({
    where: { ...input.target, state: { in: [...OPEN_STATES] } },
  })
  for (const row of open) {
    await tx.decisionProposal.update({
      where: { id: row.id },
      data: {
        state: 'stale',
        closedAt: new Date(),
        closedById: input.actorMemberId,
      },
    })
    await activity.record(
      {
        workspaceId: input.workspaceId,
        listingId: row.listingId,
        actorMemberId: input.actorMemberId,
        channel: input.channel,
        action: 'decision.stale',
        after: {
          proposalId: row.id,
          choiceLabel: choiceLabel(
            row.listingId ? 'listing' : 'draft',
            row.choice
          ),
          why: input.why,
        },
      },
      tx
    )
  }
  return open.length
}

/**
 * Un membre retiré ou parti : on ne l'attend plus (il n'est plus actif) et
 * ses propres propositions ouvertes sont retirées. Une proposition qui
 * n'attendait plus que lui reste ouverte : son auteur peut « Décider sans
 * attendre » ; rien n'est appliqué d'office.
 */
export async function withdrawDecisionsOf(
  tx: Prisma.TransactionClient,
  activity: ActivityService,
  input: {
    workspaceId: string
    memberId: string
    actorMemberId: string
    channel: ActivityChannel
  }
): Promise<number> {
  const open = await tx.decisionProposal.findMany({
    where: {
      workspaceId: input.workspaceId,
      authorId: input.memberId,
      state: { in: [...OPEN_STATES] },
    },
  })
  for (const row of open) {
    await tx.decisionProposal.update({
      where: { id: row.id },
      data: {
        state: 'withdrawn',
        closedAt: new Date(),
        closedById: input.actorMemberId,
      },
    })
    await activity.record(
      {
        workspaceId: input.workspaceId,
        listingId: row.listingId,
        actorMemberId: input.actorMemberId,
        channel: input.channel,
        action: 'decision.withdrawn',
        after: {
          proposalId: row.id,
          choiceLabel: choiceLabel(
            row.listingId ? 'listing' : 'draft',
            row.choice
          ),
          via: 'departure',
          notified: false,
        },
      },
      tx
    )
  }
  return open.length
}
