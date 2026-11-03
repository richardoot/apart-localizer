import { Injectable } from '@nestjs/common'
import type { ActivityChannel } from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationQueueService } from '../notifications/notification-queue.service'
import type { Prisma } from '../generated/prisma'

export interface ActivityEntry {
  workspaceId: string
  listingId?: string | null
  actorMemberId?: string | null
  channel: ActivityChannel
  action: string
  before?: unknown
  after?: unknown
}

/** Any Prisma client, the service's own or a transaction's. */
export type ActivityWriter = Prisma.TransactionClient

/**
 * Le journal d'activité : qui a changé quoi, quand, par quel canal. Une
 * écriture par action, dans la même transaction que l'action quand il y en
 * a une, pour qu'aucune modification n'échappe au journal. Les
 * notifications qu'elle fait naître sont posées dans la même transaction
 * (lot 6) ; leur envoi suit la requête.
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationQueueService
  ) {}

  async record(entry: ActivityEntry, tx?: ActivityWriter): Promise<void> {
    if (tx) {
      await this.write(entry, tx)
      return
    }
    await this.prisma.$transaction(client => this.write(entry, client))
  }

  private async write(
    entry: ActivityEntry,
    client: Prisma.TransactionClient
  ): Promise<void> {
    const row = await client.activityLog.create({
      data: {
        workspaceId: entry.workspaceId,
        listingId: entry.listingId ?? null,
        actorMemberId: entry.actorMemberId ?? null,
        channel: entry.channel,
        action: entry.action,
        before: toJson(entry.before),
        after: toJson(entry.after),
      },
    })
    await this.notifications.enqueue(
      {
        id: row.id,
        workspaceId: row.workspaceId,
        listingId: row.listingId,
        actorMemberId: row.actorMemberId,
        channel: row.channel,
        action: row.action,
        before: entry.before ?? null,
        after: entry.after ?? null,
      },
      client
    )
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
