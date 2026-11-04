import { Injectable } from '@nestjs/common'
import { resolveNotificationPreferences } from '@apart/contracts'
import type { ActivityChannel } from '@apart/contracts'
import {
  activityActorName,
  notificationTypeOf,
  notificationsForActivity,
} from '@apart/domain'
import type { Prisma } from '../generated/prisma'
import { MEMBER_ORDER } from '../workspace/member-order'

/** Une ligne du journal, telle qu'elle vient d'être écrite. */
export interface LoggedActivity {
  id: string
  workspaceId: string
  listingId: string | null
  actorMemberId: string | null
  channel: ActivityChannel
  action: string
  before: unknown
  after: unknown
}

/**
 * Les notifications d'une écriture, posées dans la même transaction que le
 * journal : `domain` dit qui prévenir et en quels termes, les préférences du
 * destinataire disent par quels canaux. L'envoi (push, e-mail) se fait après
 * la requête, par `NotificationDispatcher`.
 */
@Injectable()
export class NotificationQueueService {
  async enqueue(
    entry: LoggedActivity,
    tx: Prisma.TransactionClient
  ): Promise<number> {
    if (!notificationTypeOf(entry)) return 0
    // Seuls les membres actifs sont prévenus : ni les invitations en
    // attente, ni les anciens membres (lot 8).
    const members = await tx.member.findMany({
      where: { workspaceId: entry.workspaceId, status: 'active' },
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
        notificationPreferences: true,
      },
      orderBy: MEMBER_ORDER,
    })
    const listing = entry.listingId
      ? await tx.listing.findUnique({
          where: { id: entry.listingId },
          select: { title: true },
        })
      : null
    const drafts = notificationsForActivity(entry, {
      members,
      listingTitle: listing?.title ?? null,
    })
    const byId = new Map(members.map(m => [m.id, m]))
    // L'auteur peut ne plus être actif (refus d'une invitation) : son nom
    // vient de toutes les lignes de l'espace.
    const actor =
      entry.actorMemberId && !byId.has(entry.actorMemberId)
        ? await tx.member.findUnique({
            where: { id: entry.actorMemberId },
            select: { id: true, displayName: true },
          })
        : null
    const actorName = activityActorName(
      entry,
      actor ? new Map([...byId, [actor.id, actor]]) : byId
    )
    const rows: Prisma.NotificationCreateManyInput[] = []
    for (const draft of drafts) {
      const recipient = byId.get(draft.recipientId)
      if (!recipient) continue
      const prefs = resolveNotificationPreferences(
        recipient.notificationPreferences
      )[draft.type]
      const email = prefs.email && Boolean(recipient.email)
      if (!prefs.in_app && !prefs.push && !email) continue
      rows.push({
        workspaceId: entry.workspaceId,
        recipientId: draft.recipientId,
        type: draft.type,
        title: draft.title,
        body: draft.body,
        url: draft.url,
        listingId: draft.listingId,
        activityId: entry.id,
        actorName,
        inApp: prefs.in_app,
        pushStatus: prefs.push ? 'pending' : 'skipped',
        emailStatus: email ? 'pending' : 'skipped',
      })
    }
    if (rows.length > 0) await tx.notification.createMany({ data: rows })
    return rows.length
  }
}
