import { Injectable, NotFoundException } from '@nestjs/common'
import { ACTIVITY_KIND_RULES, ClaudeStatusSchema } from '@apart/contracts'
import type {
  ActivityActor,
  ClaudeStatus,
  ActivityKind,
  ActivityPage,
  ActivityQuery,
} from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import type { Member, Prisma } from '../generated/prisma'
import { claudeUsage } from '@apart/domain'
import { toActivityEntry } from './activity.mapper'
import { redactOpinionRows } from '../opinions/opinion-context'

/** La condition SQL d'une sorte d'événement, d'après la table de `contracts`. */
export function kindWhere(kind: ActivityKind): Prisma.ActivityLogWhereInput {
  const clauses = (rule: {
    actions?: readonly string[]
    prefixes?: readonly string[]
  }): Prisma.ActivityLogWhereInput[] => [
    ...(rule.actions?.length ? [{ action: { in: [...rule.actions] } }] : []),
    ...(rule.prefixes ?? []).map(prefix => ({
      action: { startsWith: `${prefix}.` },
    })),
  ]
  if (kind === 'other') {
    return {
      NOT: Object.values(ACTIVITY_KIND_RULES).flatMap(rule => clauses(rule)),
    }
  }
  const rule = ACTIVITY_KIND_RULES[kind]
  const own = clauses(rule)
  // Les actions exactes des autres sortes (statut, prix) sortent des préfixes.
  const claimed = Object.entries(ACTIVITY_KIND_RULES)
    .filter(([other]) => other !== kind)
    .flatMap(([, r]) => r.actions ?? [])
  return {
    OR: own,
    ...(rule.prefixes?.length && claimed.length
      ? { NOT: { action: { in: claimed } } }
      : {}),
  }
}

/**
 * La lecture du journal (besoin S6) : par espace ou par annonce, filtré par
 * membre, canal et sorte, paginé, chaque ligne mise en français par `domain`.
 * Lot 20 : les avis masqués à l'aveugle restent masqués dans le journal.
 */
@Injectable()
export class ActivityQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lot 26 (ADR 0036) : ce que le journal dit du connecteur, pour la page
   * « Claude » : par membre actif, ses écritures par Claude (canal `mcp`) et
   * la dernière ; la phrase vient de `domain` (`claudeUsage`). Une lecture
   * par Claude ne laisse aucune trace : rien de plus n'est détectable.
   */
  async claude(member: Member, now = new Date()): Promise<ClaudeStatus> {
    const [groups, members] = await Promise.all([
      this.prisma.activityLog.groupBy({
        by: ['actorMemberId'],
        where: { workspaceId: member.workspaceId, channel: 'mcp' },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.member.findMany({
        where: { workspaceId: member.workspaceId, status: 'active' },
        select: { id: true, displayName: true },
      }),
    ])
    const names = new Map(members.map(m => [m.id, m.displayName]))
    const usage = groups
      .flatMap(group => {
        const name = group.actorMemberId
          ? names.get(group.actorMemberId)
          : undefined
        const last = group._max.createdAt
        return group.actorMemberId && name !== undefined && last
          ? [
              {
                memberId: group.actorMemberId,
                displayName: name,
                writes: group._count._all,
                lastWriteAt: last.toISOString(),
              },
            ]
          : []
      })
      .sort((a, b) => Date.parse(b.lastWriteAt) - Date.parse(a.lastWriteAt))
    return ClaudeStatusSchema.parse({
      usage: claudeUsage({ viewerId: member.id, members: usage }, now),
      members: usage,
    })
  }

  async list(
    member: Member,
    query: ActivityQuery,
    listingId?: string
  ): Promise<ActivityPage> {
    const scopedListing = listingId ?? query.listingId
    if (scopedListing) {
      const listing = await this.prisma.listing.findFirst({
        where: { id: scopedListing, workspaceId: member.workspaceId },
        select: { id: true },
      })
      if (!listing) throw new NotFoundException('Annonce introuvable')
    }
    const where: Prisma.ActivityLogWhereInput = {
      workspaceId: member.workspaceId,
      ...(scopedListing ? { listingId: scopedListing } : {}),
      ...(query.memberId ? { actorMemberId: query.memberId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.kind ? kindWhere(query.kind) : {}),
    }
    const [rows, total, members] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { listing: { select: { id: true, title: true } } },
      }),
      this.prisma.activityLog.count({ where }),
      this.membersOf(member.workspaceId),
    ])
    // Lot 20 : l'avis d'un autre, sur une annonce où le membre n'a pas
    // encore noté (avis à l'aveugle), se lit sans ses notes.
    const readable = await redactOpinionRows(this.prisma, member, rows)
    return {
      items: readable.map(row => toActivityEntry(row, members)),
      total,
      page: query.page,
      limit: query.limit,
      pageCount: Math.ceil(total / query.limit),
    }
  }

  async membersOf(workspaceId: string): Promise<Map<string, ActivityActor>> {
    const rows = await this.prisma.member.findMany({
      where: { workspaceId },
      select: { id: true, handle: true, displayName: true },
    })
    return new Map(rows.map(row => [row.id, row]))
  }
}
