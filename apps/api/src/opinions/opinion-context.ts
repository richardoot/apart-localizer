import { OpinionSchema } from '@apart/contracts'
import type {
  Opinion as OpinionDto,
  OpinionCriterion,
  OpinionSummary,
} from '@apart/contracts'
import {
  confrontOpinions,
  effectiveOpinionCriteria,
  isOpinionWrite,
  opinionAfterVisit,
  opinionHasRating,
  redactOpinionActivity,
  splitOpinionsForViewer,
  visibleCriterionKeys,
} from '@apart/domain'
import type { OpinionVisitLike } from '@apart/domain'
import type {
  Member,
  Opinion,
  OpinionReveal,
  OpinionScore,
  Prisma,
} from '../generated/prisma'
import { MEMBER_ORDER } from '../workspace/member-order'

/**
 * Lot 20 (ADR 0030) : ce que les avis d'un espace demandent pour être lus,
 * et la règle de l'avis à l'aveugle appliquée côté serveur. Des fonctions
 * sur un client Prisma (pas de service) : le journal, « ce qui a changé »,
 * les annonces, l'export et le MCP les appellent sans dépendre du module des
 * avis. La décision est dans `domain` (`splitOpinionsForViewer`,
 * `confrontOpinions`) ; un avis masqué ne sort jamais d'ici vers ce membre.
 */

type Db = Prisma.TransactionClient

/** Les critères, la règle et les membres d'un espace. */
export interface OpinionWorkspaceContext {
  /** Tous les critères (masqués compris), dans l'ordre. */
  criteria: OpinionCriterion[]
  /** Les clés des critères affichés. */
  visibleKeys: Set<string>
  blind: boolean
  /** Les membres actifs, dans l'ordre de l'espace. */
  members: { id: string; displayName: string }[]
  /** Les prénoms de tous les membres, anciens compris. */
  names: Map<string, string>
}

export async function loadOpinionContext(
  db: Db,
  workspaceId: string
): Promise<OpinionWorkspaceContext> {
  const [workspace, rows, members] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { opinionsBlind: true },
    }),
    db.opinionCriterion.findMany({ where: { workspaceId } }),
    db.member.findMany({
      where: { workspaceId, status: { in: ['active', 'removed'] } },
      select: { id: true, displayName: true, status: true },
      orderBy: MEMBER_ORDER,
    }),
  ])
  const criteria = effectiveOpinionCriteria(rows)
  return {
    criteria,
    visibleKeys: visibleCriterionKeys(criteria),
    blind: workspace.opinionsBlind,
    members: members
      .filter(m => m.status === 'active')
      .map(m => ({ id: m.id, displayName: m.displayName })),
    names: new Map(members.map(m => [m.id, m.displayName])),
  }
}

export type OpinionRow = Opinion & { scores: OpinionScore[] }

export interface OpinionDtoOptions {
  /** Les critères affichés ; null = toutes les notes (export). */
  visibleKeys: ReadonlySet<string> | null
  /** Les visites de l'annonce (« après visite »). */
  visits?: readonly OpinionVisitLike[]
}

/** Un avis lu : ses notes (des critères affichés), sa première note, après visite. */
export function toOpinionDto(
  row: OpinionRow,
  options: OpinionDtoOptions
): OpinionDto {
  const scores = [...row.scores]
    .filter(
      s =>
        options.visibleKeys === null || options.visibleKeys.has(s.criterionKey)
    )
    .map(s => ({
      key: s.criterionKey,
      score: s.score,
      word: s.word,
      updatedAt: s.updatedAt.toISOString(),
    }))
  // Avant le lot 20, la première note se lit par la note sur 5 et la création.
  const ratedAt = row.ratedAt ?? (row.rating > 0 ? row.createdAt : null) ?? null
  return OpinionSchema.parse({
    id: row.id,
    listingId: row.listingId,
    memberId: row.memberId,
    rating: row.rating,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    scores,
    ratedAt: ratedAt?.toISOString() ?? null,
    afterVisit: options.visits
      ? opinionAfterVisit(options.visits, row.memberId, row.updatedAt)
      : null,
    seenBefore: row.seenMemberIds ?? [],
  })
}

/** Les visites d'une annonce telles que la mention « après visite » les lit. */
export function visitRefs(
  visits: readonly {
    id: string
    visitedAt: Date
    status: 'planned' | 'done'
    participantIds: string[]
  }[]
): OpinionVisitLike[] {
  return visits.map(v => ({
    id: v.id,
    visitedAt: v.visitedAt.toISOString(),
    status: v.status,
    participantIds: v.participantIds,
  }))
}

/** Ce que la lecture d'une annonce montre des avis à ce membre. */
export interface OpinionView {
  opinions: OpinionDto[]
  summary: OpinionSummary
}

/**
 * Les avis d'une annonce vus par un membre : le sien, ceux des autres s'il
 * peut les voir (sinon seulement comptés), et la confrontation des avis
 * visibles.
 */
export function opinionViewOf(
  row: {
    opinions: readonly OpinionRow[]
    opinionReveals: readonly Pick<OpinionReveal, 'memberId'>[]
    visits: readonly {
      id: string
      visitedAt: Date
      status: 'planned' | 'done'
      participantIds: string[]
    }[]
  },
  viewer: Pick<Member, 'id'>,
  ctx: OpinionWorkspaceContext
): OpinionView {
  const visits = visitRefs(row.visits)
  const dtos = row.opinions.map(o =>
    toOpinionDto(o, { visibleKeys: ctx.visibleKeys, visits })
  )
  const revealed = row.opinionReveals.some(r => r.memberId === viewer.id)
  const split = splitOpinionsForViewer(dtos, {
    viewerId: viewer.id,
    blind: ctx.blind,
    revealed,
    visibleKeys: ctx.visibleKeys,
  })
  return {
    opinions: split.visible,
    summary: confrontOpinions({
      criteria: ctx.criteria,
      members: ctx.members,
      visible: split.visible,
      masked: split.masked,
      blind: ctx.blind,
      revealed,
      viewerRated: split.viewerRated,
      names: ctx.names,
    }),
  }
}

/**
 * Les annonces (parmi celles données) où ce membre voit l'avis des autres :
 * toutes si l'espace ne masque pas ; sinon celles qu'il a notées ou où il a
 * choisi « Voir quand même ».
 */
export async function listingsWithOpinionsVisible(
  db: Db,
  member: Pick<Member, 'id' | 'workspaceId'>,
  listingIds: readonly string[]
): Promise<Set<string>> {
  const ids = [...new Set(listingIds)]
  if (ids.length === 0) return new Set()
  const ctx = await loadOpinionContext(db, member.workspaceId)
  if (!ctx.blind) return new Set(ids)
  const [own, reveals] = await Promise.all([
    db.opinion.findMany({
      where: { memberId: member.id, listingId: { in: ids } },
      include: { scores: true },
    }),
    db.opinionReveal.findMany({
      where: { memberId: member.id, listingId: { in: ids } },
      select: { listingId: true },
    }),
  ])
  const visible = new Set(reveals.map(r => r.listingId))
  for (const o of own) {
    const dto = {
      rating: o.rating,
      scores: o.scores.map(s => ({
        key: s.criterionKey,
        score: s.score,
        word: s.word,
      })),
    }
    if (opinionHasRating(dto, ctx.visibleKeys)) visible.add(o.listingId)
  }
  return visible
}

/**
 * Les lignes du journal qu'un membre lit, avis masqués retirés : l'écriture
 * d'avis d'un autre sur une annonce où il ne voit pas encore les avis ne
 * garde que qui, combien de critères et « après la visite ».
 */
export async function redactOpinionRows<
  T extends {
    action: string
    actorMemberId: string | null
    listingId: string | null
    before: unknown
    after: unknown
  },
>(db: Db, member: Pick<Member, 'id' | 'workspaceId'>, rows: T[]): Promise<T[]> {
  const concerned = rows.filter(
    r =>
      isOpinionWrite(r.action) &&
      r.actorMemberId !== member.id &&
      r.listingId !== null
  )
  if (concerned.length === 0) return rows
  const visible = await listingsWithOpinionsVisible(
    db,
    member,
    concerned.map(r => r.listingId as string)
  )
  return rows.map(row => {
    if (
      !isOpinionWrite(row.action) ||
      row.actorMemberId === member.id ||
      row.listingId === null ||
      visible.has(row.listingId)
    ) {
      return row
    }
    const redacted = redactOpinionActivity(row.action, row.before, row.after)
    return { ...row, before: redacted.before, after: redacted.after } as T
  })
}
