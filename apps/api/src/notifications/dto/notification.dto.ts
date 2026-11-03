import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  NotificationPageSchema,
  NotificationPreferencesUpdateSchema,
  NotificationQuerySchema,
  NotificationSchema,
  NotificationSettingsSchema,
  PushSubscriptionInputSchema,
  PushUnsubscribeSchema,
} from '@apart/contracts'

export class NotificationDto extends createZodDto(NotificationSchema) {}
export class NotificationPageDto extends createZodDto(NotificationPageSchema) {}
export class NotificationQueryDto extends createZodDto(
  NotificationQuerySchema
) {}
export class NotificationSettingsDto extends createZodDto(
  NotificationSettingsSchema
) {}
export class NotificationPreferencesUpdateDto extends createZodDto(
  NotificationPreferencesUpdateSchema
) {}
export class PushSubscriptionInputDto extends createZodDto(
  PushSubscriptionInputSchema
) {}
export class PushUnsubscribeDto extends createZodDto(PushUnsubscribeSchema) {}
export class NotificationReadDto extends createZodDto(
  z.object({ read: z.boolean().default(true) })
) {}
export class MarkAllReadResultDto extends createZodDto(
  z.object({ updated: z.number().int().min(0) })
) {}
