import { Injectable, NotFoundException } from '@nestjs/common'
import {
  NotificationPreferencesSchema,
  mergeNotificationPreferences,
  resolveNotificationPreferences,
} from '@apart/contracts'
import type {
  Notification as NotificationDto,
  NotificationPage,
  NotificationPreferences,
  NotificationPreferencesUpdate,
  NotificationQuery,
  NotificationSettings,
  PushSubscriptionInput,
} from '@apart/contracts'
import { PrismaService } from '../prisma/prisma.service'
import type { Member, Notification, Prisma } from '../generated/prisma'
import { NotificationDispatcher } from './notification-dispatcher.service'

export function toNotificationDto(row: Notification): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    url: row.url,
    listingId: row.listingId,
    actorName: row.actorName,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Le chemin du webhook d'alertes e-mail d'un espace. */
export function inboundEmailPath(workspaceId: string): string {
  return `/inbound/email/${workspaceId}`
}

/**
 * Les notifications du membre connecté : la liste (lu / non lu), ses
 * préférences par type et par canal, ses abonnements Web Push. Ce sont des
 * réglages personnels : ils ne passent pas par le journal d'activité de
 * l'espace.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcher
  ) {}

  async list(
    member: Member,
    query: NotificationQuery
  ): Promise<NotificationPage> {
    const where: Prisma.NotificationWhereInput = {
      recipientId: member.id,
      inApp: true,
      ...(query.unreadOnly ? { readAt: null } : {}),
    }
    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { recipientId: member.id, inApp: true, readAt: null },
      }),
    ])
    return {
      items: rows.map(toNotificationDto),
      total,
      unreadCount,
      page: query.page,
      limit: query.limit,
      pageCount: Math.ceil(total / query.limit),
    }
  }

  async markRead(
    member: Member,
    id: string,
    read = true
  ): Promise<NotificationDto> {
    const row = await this.prisma.notification.findFirst({
      where: { id, recipientId: member.id },
    })
    if (!row) throw new NotFoundException('Notification introuvable')
    const saved = await this.prisma.notification.update({
      where: { id },
      data: { readAt: read ? (row.readAt ?? new Date()) : null },
    })
    return toNotificationDto(saved)
  }

  async markAllRead(member: Member): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { recipientId: member.id, readAt: null },
      data: { readAt: new Date() },
    })
    return { updated: count }
  }

  /** Les notifications non lues d'une annonce passent lues quand le membre ouvre sa fiche. */
  async markListingRead(member: Member, listingId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { recipientId: member.id, listingId, readAt: null },
      data: { readAt: new Date() },
    })
    return count
  }

  async settings(member: Member): Promise<NotificationSettings> {
    const [row, subscriptions] = await Promise.all([
      this.prisma.member.findUniqueOrThrow({
        where: { id: member.id },
        select: { notificationPreferences: true, email: true },
      }),
      this.prisma.pushSubscription.count({ where: { memberId: member.id } }),
    ])
    return {
      preferences: resolveNotificationPreferences(row.notificationPreferences),
      push: {
        enabled: this.dispatcher.pushEnabled,
        publicKey: this.dispatcher.pushPublicKey,
        subscriptions,
      },
      email: { enabled: this.dispatcher.emailEnabled, address: row.email },
      inbound: {
        enabled: Boolean(process.env.INBOUND_EMAIL_SECRET?.trim()),
        path: inboundEmailPath(member.workspaceId),
      },
    }
  }

  async updatePreferences(
    member: Member,
    update: NotificationPreferencesUpdate
  ): Promise<NotificationSettings> {
    const row = await this.prisma.member.findUniqueOrThrow({
      where: { id: member.id },
      select: { notificationPreferences: true },
    })
    const next: NotificationPreferences = NotificationPreferencesSchema.parse(
      mergeNotificationPreferences(
        resolveNotificationPreferences(row.notificationPreferences),
        update
      )
    )
    await this.prisma.member.update({
      where: { id: member.id },
      data: { notificationPreferences: next as Prisma.InputJsonValue },
    })
    return this.settings(member)
  }

  /** Abonne l'appareil ; un point de terminaison déjà connu change de membre et de clés. */
  async subscribe(
    member: Member,
    input: PushSubscriptionInput
  ): Promise<NotificationSettings> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        memberId: member.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent,
      },
      update: {
        memberId: member.id,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent,
        failureCount: 0,
      },
    })
    return this.settings(member)
  }

  async unsubscribe(
    member: Member,
    endpoint: string
  ): Promise<NotificationSettings> {
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, memberId: member.id },
    })
    return this.settings(member)
  }
}
