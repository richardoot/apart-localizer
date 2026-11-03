import { Injectable } from '@nestjs/common'
import type { ActivityChannel } from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
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
export type ActivityWriter = Pick<Prisma.TransactionClient, 'activityLog'>

/**
 * Le journal d'activité : qui a changé quoi, quand, par quel canal. Une
 * écriture par action, dans la même transaction que l'action quand il y en
 * a une, pour qu'aucune modification n'échappe au journal.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: ActivityEntry, tx?: ActivityWriter): Promise<void> {
    const client = tx ?? this.prisma
    await client.activityLog.create({
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
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
