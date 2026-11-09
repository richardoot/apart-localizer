import { Injectable, NotFoundException } from '@nestjs/common'
import { ACTIVITY_KIND_RULES } from '@apart/contracts'
import type {
  ActivityActor,
  ActivityKind,
  ActivityPage,
  ActivityQuery,
} from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import type { Member, Prisma } from '../generated/prisma'
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
