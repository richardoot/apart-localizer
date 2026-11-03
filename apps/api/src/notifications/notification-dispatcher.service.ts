import { Inject, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EMAIL_SENDER } from './email-sender'
import type { EmailSender } from './email-sender'
import { PUSH_SENDER, PushDeliveryError } from './push-sender'
import type { PushSender } from './push-sender'

/** Au-delà, une notification en attente n'est plus envoyée (elle reste dans la cloche). */
const MAX_AGE_MS = 24 * 3600 * 1000
/** Échecs consécutifs avant qu'un abonnement soit retiré. */
const MAX_FAILURES = 5
const BATCH = 50

export interface DeliveryReport {
  push: { sent: number; failed: number; skipped: number; removed: number }
  email: { sent: number; failed: number; skipped: number }
}

/**
 * L'envoi des notifications en attente : web push vers chaque appareil
 * abonné du destinataire (un abonnement expiré, 404 ou 410, est retiré ;
 * cinq échecs de suite aussi), e-mail si un envoi est configuré. Appelé à la
 * fin de chaque requête d'écriture (`NotificationDeliveryInterceptor`) et du
 * MCP ; ce qui échoue par panne passe « failed » et n'est pas réessayé.
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name)
  private running: Promise<DeliveryReport> | null = null

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_SENDER) private readonly push: PushSender | null,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender
  ) {}

  get pushEnabled(): boolean {
    return this.push !== null
  }

  get pushPublicKey(): string | null {
    return this.push?.publicKey ?? null
  }

  get emailEnabled(): boolean {
    return this.email.enabled
  }

  /** Une seule tournée à la fois dans ce processus ; les appels concurrents l'attendent. */
  deliverPending(now = new Date()): Promise<DeliveryReport> {
    this.running ??= this.run(now).finally(() => {
      this.running = null
    })
    return this.running
  }

  private async run(now: Date): Promise<DeliveryReport> {
    const report: DeliveryReport = {
      push: { sent: 0, failed: 0, skipped: 0, removed: 0 },
      email: { sent: 0, failed: 0, skipped: 0 },
    }
    const oldest = new Date(now.getTime() - MAX_AGE_MS)
    await this.prisma.notification.updateMany({
      where: { pushStatus: 'pending', createdAt: { lt: oldest } },
      data: { pushStatus: 'skipped' },
    })
    await this.prisma.notification.updateMany({
      where: { emailStatus: 'pending', createdAt: { lt: oldest } },
      data: { emailStatus: 'skipped' },
    })
    await this.deliverPush(report)
    await this.deliverEmail(report)
    return report
  }

  private async deliverPush(report: DeliveryReport): Promise<void> {
    const pending = await this.prisma.notification.findMany({
      where: { pushStatus: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
      include: { recipient: { include: { pushSubscriptions: true } } },
    })
    for (const notification of pending) {
      // Une autre tournée (autre processus) l'a peut-être prise : on la réserve.
      const { count } = await this.prisma.notification.updateMany({
        where: { id: notification.id, pushStatus: 'pending' },
        data: { pushStatus: this.push ? 'sent' : 'skipped' },
      })
      if (count === 0) continue
      const subscriptions = notification.recipient.pushSubscriptions
      if (!this.push || subscriptions.length === 0) {
        if (this.push) {
          await this.prisma.notification.update({
            where: { id: notification.id },
            data: { pushStatus: 'skipped' },
          })
        }
        report.push.skipped += 1
        continue
      }
      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        url: notification.url ?? '/',
        tag: notification.listingId ?? notification.id,
        notificationId: notification.id,
      })
      let delivered = 0
      for (const subscription of subscriptions) {
        try {
          await this.push.send(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload
          )
          delivered += 1
          await this.prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { lastSuccessAt: new Date(), failureCount: 0 },
          })
        } catch (error) {
          const expired = error instanceof PushDeliveryError && error.expired
          const failures = subscription.failureCount + 1
          if (expired || failures >= MAX_FAILURES) {
            await this.prisma.pushSubscription.deleteMany({
              where: { id: subscription.id },
            })
            report.push.removed += 1
          } else {
            await this.prisma.pushSubscription.update({
              where: { id: subscription.id },
              data: { failureCount: failures, lastFailureAt: new Date() },
            })
          }
          if (!expired) {
            this.logger.warn(
              `Envoi push en échec (${error instanceof PushDeliveryError ? error.statusCode : 'réseau'})`
            )
          }
        }
      }
      if (delivered > 0) {
        report.push.sent += 1
      } else {
        report.push.failed += 1
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { pushStatus: 'failed' },
        })
      }
    }
  }

  private async deliverEmail(report: DeliveryReport): Promise<void> {
    const pending = await this.prisma.notification.findMany({
      where: { emailStatus: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
      include: { recipient: { select: { email: true } } },
    })
    for (const notification of pending) {
      const { count } = await this.prisma.notification.updateMany({
        where: { id: notification.id, emailStatus: 'pending' },
        data: {
          emailStatus:
            this.email.enabled && notification.recipient.email
              ? 'sent'
              : 'skipped',
        },
      })
      if (count === 0) continue
      const to = notification.recipient.email
      if (!this.email.enabled || !to) {
        report.email.skipped += 1
        continue
      }
      try {
        await this.email.send({
          to,
          subject: `[apart-localizer] ${notification.title}`,
          text: `${notification.body}\n\n${linkOf(notification.url)}\n\nRéglez vos notifications dans l'application : ${linkOf('/notifications')}`,
        })
        report.email.sent += 1
      } catch (error) {
        report.email.failed += 1
        this.logger.warn(
          `Envoi d'e-mail en échec : ${error instanceof Error ? error.message : 'inconnu'}`
        )
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { emailStatus: 'failed' },
        })
      }
    }
  }
}

/** Le lien absolu vers l'application (première origine de FRONTEND_URL). */
function linkOf(path: string | null): string {
  const origin = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')[0]
    ?.trim()
    .replace(/\/$/, '')
  return `${origin}${path ?? '/'}`
}
