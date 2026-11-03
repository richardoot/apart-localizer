import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { createEmailSender, EMAIL_SENDER } from './email-sender'
import { NotificationDeliveryInterceptor } from './notification-delivery.interceptor'
import { NotificationDispatcher } from './notification-dispatcher.service'
import { NotificationQueueService } from './notification-queue.service'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { createPushSender, PUSH_SENDER, vapidConfig } from './push-sender'

/**
 * Les notifications (besoin S7) : la file posée avec le journal, l'envoi
 * (web push par `web-push`, e-mail facultatif), la cloche et les
 * préférences. Les envois sont injectés : les tests ne touchent jamais le
 * réseau.
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    {
      provide: PUSH_SENDER,
      useFactory: () => createPushSender(vapidConfig(process.env)),
    },
    { provide: EMAIL_SENDER, useFactory: () => createEmailSender(process.env) },
    NotificationQueueService,
    NotificationDispatcher,
    NotificationsService,
    { provide: APP_INTERCEPTOR, useClass: NotificationDeliveryInterceptor },
  ],
  exports: [
    NotificationQueueService,
    NotificationDispatcher,
    NotificationsService,
  ],
})
export class NotificationsModule {}
