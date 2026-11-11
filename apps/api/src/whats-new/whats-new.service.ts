import { Injectable, NotFoundException } from '@nestjs/common'
import { WhatsNewSinceSourceSchema } from '@apart/contracts'
import type {
  ListingChanges,
  WhatsNewMarkSeen,
  WhatsNewQuery,
  WhatsNewReport,
  WhatsNewSinceSource,
  WhatsNewVisit,
} from '@apart/contracts'
import {
  computeWhatsNew,
  currentWhatsNewSince,
  listingChangedFields,
  nextVisitWindow,
} from '@apart/domain'
import type { VisitState, WhatsNewEvent } from '@apart/domain'
import { ActivityQueryService } from '../activity/activity-query.service'
import { toActivityEntry } from '../activity/activity.mapper'
import { PrismaService } from '../prisma/prisma.service'
import { redactOpinionRows } from '../opinions/opinion-context'
import type { ActivityLog, Member } from '../generated/prisma'

/** Actions lues par « ce qui a changé » (le reste du journal n'en est pas). */
const WHATS_NEW_ACTIONS = [
  'listing.created',
  'listing.price_changed',
  'listing.updated',
  'listing.status_changed',
  'opinion.created',
  'opinion.updated',
  'task.created',
  'task.completed',
  'criteria.matched',
  // Lot 15 : une vérification sur le portail qui a trouvé quelque chose.
  'listing.checked',
  'criteria.unmatched',
  // Lot 17 : une réponse de l'annonceur enregistrée.
  'agency_request.answered',
  // Lot 18 : un lien ajouté, retiré ou détaché (prix de la fiche compris).
  'listing_link.added',
  'listing_link.removed',
  'listing_link.detached',
  // Lot 27 : un doublon fusionné dans une fiche (ses liens, son prix).
  'listing.merged',
]

function toEvent(row: ActivityLog): WhatsNewEvent {
  return {
    id: row.id,
    action: row.action,
    channel: row.channel,
    actorMemberId: row.actorMemberId,
    listingId: row.listingId,
    before: row.before,
    after: row.after,
    createdAt: row.createdAt.toISOString(),
  }
}

function sourceOf(value: string | null): WhatsNewSinceSource | null {
  const parsed = WhatsNewSinceSourceSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * « Ce qui a changé » (besoin K4), même calcul pour le web et l'outil MCP
 * `whats_new` : `domain` décide ; ce service lit le journal, les « vu par »
 * du membre et son horodatage de visite.
 */
@Injectable()
export class WhatsNewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityQueryService
  ) {}

  private async state(member: Member): Promise<VisitState> {
    const row = await this.prisma.member.findUniqueOrThrow({
      where: { id: member.id },
      select: {
        lastVisitAt: true,
        whatsNewSince: true,
        whatsNewSource: true,
        createdAt: true,
      },
    })
    return {
      lastVisitAt: row.lastVisitAt?.toISOString() ?? null,
      whatsNewSince: row.whatsNewSince?.toISOString() ?? null,
      whatsNewSource: sourceOf(row.whatsNewSource),
      memberCreatedAt: row.createdAt.toISOString(),
    }
  }

  async report(member: Member, query: WhatsNewQuery): Promise<WhatsNewReport> {
    const current = currentWhatsNewSince(await this.state(member))
    const since = query.since ?? current.since
    const sinceSource: WhatsNewSinceSource = query.since
      ? 'explicit'
      : current.sinceSource
    const [rows, listings, members] = await Promise.all([
      this.prisma.activityLog.findMany({
        where: {
          workspaceId: member.workspaceId,
          createdAt: { gt: new Date(since) },
          action: { in: WHATS_NEW_ACTIONS },
          listingId: { not: null },
        },
        orderBy: { createdAt: 'asc' },
        take: 2000,
      }),
      this.prisma.listing.findMany({
        where: { workspaceId: member.workspaceId },
        select: {
          id: true,
          title: true,
          views: { where: { memberId: member.id }, select: { seenAt: true } },
        },
      }),
      this.activity.membersOf(member.workspaceId),
    ])
    // Lot 20 : un avis masqué à l'aveugle reste masqué ici aussi.
    const readable = await redactOpinionRows(this.prisma, member, rows)
    return computeWhatsNew({
      memberId: member.id,
      since,
      sinceSource,
      now: new Date().toISOString(),
      events: readable.map(toEvent),
      listings: new Map(
        listings.map(l => [
          l.id,
          { title: l.title, seenAt: l.views[0]?.seenAt.toISOString() ?? null },
        ])
      ),
      members,
      limit: query.limit,
    })
  }

  /** Une visite de l'application : l'horodatage avance, le point de départ suit la règle de `domain`. */
  async visit(member: Member, now = new Date()): Promise<WhatsNewVisit> {
    const window = nextVisitWindow(await this.state(member), now.toISOString())
    await this.prisma.member.update({
      where: { id: member.id },
      data: {
        lastVisitAt: new Date(window.lastVisitAt),
        ...(window.sinceSource === 'member_created'
          ? {}
          : {
              whatsNewSince: new Date(window.since),
              whatsNewSource: window.sinceSource,
            }),
      },
    })
    return window
  }

  /**
   * « Tout marquer comme vu » : le point de départ passe à maintenant et
   * chaque annonce est vue (le badge « nouvelle » s'éteint) ; les
   * notifications gardent leur propre « tout marquer comme lu ».
   */
  async markAllSeen(
    member: Member,
    now = new Date()
  ): Promise<WhatsNewMarkSeen> {
    const listings = await this.prisma.listing.findMany({
      where: { workspaceId: member.workspaceId },
      select: { id: true },
    })
    const ids = listings.map(l => l.id)
    await this.prisma.$transaction([
      this.prisma.listingView.createMany({
        data: ids.map(listingId => ({
          listingId,
          memberId: member.id,
          seenAt: now,
        })),
        skipDuplicates: true,
      }),
      this.prisma.listingView.updateMany({
        where: { memberId: member.id, listingId: { in: ids } },
        data: { seenAt: now },
      }),
      this.prisma.member.update({
        where: { id: member.id },
        data: {
          whatsNewSince: now,
          whatsNewSource: 'marked_seen',
          lastVisitAt: now,
        },
      }),
    ])
    return { since: now.toISOString(), markedListings: ids.length }
  }

  /** Ce qui a changé sur une fiche depuis sa dernière ouverture par le membre (avant de la marquer vue). */
  async listingChanges(
    member: Member,
    listingId: string
  ): Promise<ListingChanges> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, workspaceId: member.workspaceId },
      select: {
        id: true,
        title: true,
        views: { where: { memberId: member.id }, select: { seenAt: true } },
      },
    })
    if (!listing) throw new NotFoundException('Annonce introuvable')
    const seenAt = listing.views[0]?.seenAt ?? null
    if (!seenAt) {
      return { listingId, since: null, changedFields: [], entries: [] }
    }
    const [rows, members] = await Promise.all([
      this.prisma.activityLog.findMany({
        where: { listingId, createdAt: { gt: seenAt } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.activity.membersOf(member.workspaceId),
    ])
    const readable = await redactOpinionRows(this.prisma, member, rows)
    const events = readable.map(toEvent)
    const others = readable.filter(
      row => !(row.actorMemberId === member.id && row.channel === 'web')
    )
    return {
      listingId,
      since: seenAt.toISOString(),
      changedFields: listingChangedFields(
        events,
        member.id,
        seenAt.toISOString()
      ),
      entries: others.map(row =>
        toActivityEntry(
          { ...row, listing: { id: listing.id, title: listing.title } },
          members
        )
      ),
    }
  }
}
