import { ACTIVITY_CHANNEL_LABELS } from '@apart/contracts'
import type { ActivityActor, ActivityEntry } from '@apart/contracts'
import { describeActivity } from '@apart/domain'
import type { ActivityLog } from '../generated/prisma'

export type ActivityRow = ActivityLog & {
  listing: { id: string; title: string } | null
}

/** Une ligne brute du journal devient une ligne lisible (phrase et détail par `domain`). */
export function toActivityEntry(
  row: ActivityRow,
  members: ReadonlyMap<string, ActivityActor>
): ActivityEntry {
  const description = describeActivity(
    {
      action: row.action,
      channel: row.channel,
      actorMemberId: row.actorMemberId,
      before: row.before,
      after: row.after,
    },
    members
  )
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    kind: description.kind,
    channel: row.channel,
    channelLabel: ACTIVITY_CHANNEL_LABELS[row.channel],
    actor: row.actorMemberId ? (members.get(row.actorMemberId) ?? null) : null,
    listing: row.listing
      ? { id: row.listing.id, title: row.listing.title }
      : null,
    summary: description.summary,
    changes: description.changes,
  }
}
