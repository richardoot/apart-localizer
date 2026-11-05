import { z } from 'zod'

/**
 * Notifications (besoin S7) : dans l'application (cloche, lu / non lu), par
 * web push (PWA) et, en option, par e-mail. Elles naissent des écritures
 * journalisées (`domain/notificationsForActivity`) ; chaque membre choisit
 * par type et par canal.
 */

export const NotificationTypeSchema = z
  .enum([
    'listing_created',
    'status_changed',
    'task_assigned',
    'criteria_matched',
    'offer_response',
    'drafts_received',
    'member_joined',
    'listing_checked',
  ])
  .describe(
    "Type : nouvelle annonce (par l'autre membre ou par le MCP), changement de statut, tâche assignée, annonce entrée dans un critère, réponse à une offre, annonces reçues par e-mail, arrivée d'un membre invité (pour les propriétaires), mise à jour trouvée en vérifiant une annonce sur le portail (prix, charges, plus en ligne, republiée ; lot 15)"
  )
export type NotificationType = z.infer<typeof NotificationTypeSchema>

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  listing_created: 'Nouvelle annonce',
  status_changed: 'Changement de statut',
  task_assigned: 'Tâche assignée',
  criteria_matched: 'Annonce entrée dans un critère',
  offer_response: 'Réponse à une offre',
  drafts_received: 'Annonces reçues par e-mail',
  member_joined: "Arrivée d'un membre dans l'espace",
  listing_checked: "Mise à jour d'une annonce (vérification sur le portail)",
}

export const NotificationChannelSchema = z
  .enum(['in_app', 'push', 'email'])
  .describe("Canal : dans l'application, notification push, e-mail")
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> =
  {
    in_app: "Dans l'application",
    push: 'Notification push',
    email: 'E-mail',
  }

export const NotificationChannelPreferenceSchema = z.object({
  in_app: z.boolean(),
  push: z.boolean(),
  email: z.boolean(),
})
export type NotificationChannelPreference = z.infer<
  typeof NotificationChannelPreferenceSchema
>

/** Par défaut : tout dans l'application et en push, rien par e-mail. */
export const DEFAULT_NOTIFICATION_PREFERENCES: Record<
  NotificationType,
  NotificationChannelPreference
> = {
  listing_created: { in_app: true, push: true, email: false },
  status_changed: { in_app: true, push: true, email: false },
  task_assigned: { in_app: true, push: true, email: false },
  criteria_matched: { in_app: true, push: true, email: false },
  offer_response: { in_app: true, push: true, email: false },
  drafts_received: { in_app: true, push: true, email: false },
  member_joined: { in_app: true, push: true, email: false },
  listing_checked: { in_app: true, push: true, email: false },
}

export const NotificationPreferencesSchema = z.object(
  Object.fromEntries(
    NotificationTypeSchema.options.map(type => [
      type,
      NotificationChannelPreferenceSchema.default(
        DEFAULT_NOTIFICATION_PREFERENCES[type]
      ),
    ])
  ) as Record<
    NotificationType,
    z.ZodDefault<typeof NotificationChannelPreferenceSchema>
  >
)
export type NotificationPreferences = z.infer<
  typeof NotificationPreferencesSchema
>

/** Modification des préférences : seuls les types et canaux donnés changent. */
export const NotificationPreferencesUpdateSchema = z.object(
  Object.fromEntries(
    NotificationTypeSchema.options.map(type => [
      type,
      NotificationChannelPreferenceSchema.partial().optional(),
    ])
  ) as Record<
    NotificationType,
    z.ZodOptional<
      z.ZodObject<{
        in_app: z.ZodOptional<z.ZodBoolean>
        push: z.ZodOptional<z.ZodBoolean>
        email: z.ZodOptional<z.ZodBoolean>
      }>
    >
  >
)
export type NotificationPreferencesUpdate = z.infer<
  typeof NotificationPreferencesUpdateSchema
>

/**
 * Les préférences enregistrées d'un membre, complétées des valeurs par
 * défaut ; un JSON illisible vaut les défauts.
 */
export function resolveNotificationPreferences(
  stored: unknown
): NotificationPreferences {
  const base =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {}
  const result = {} as NotificationPreferences
  for (const type of NotificationTypeSchema.options) {
    const parsed = NotificationChannelPreferenceSchema.partial().safeParse(
      base[type] ?? {}
    )
    result[type] = {
      ...DEFAULT_NOTIFICATION_PREFERENCES[type],
      ...(parsed.success
        ? Object.fromEntries(
            Object.entries(parsed.data).filter(([, v]) => v !== undefined)
          )
        : {}),
    }
  }
  return result
}

/** Applique une modification partielle des préférences. */
export function mergeNotificationPreferences(
  current: NotificationPreferences,
  update: NotificationPreferencesUpdate
): NotificationPreferences {
  const result = { ...current }
  for (const type of NotificationTypeSchema.options) {
    const patch = update[type]
    if (!patch) continue
    result[type] = {
      ...current[type],
      ...Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined)
      ),
    }
  }
  return result
}

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  url: z
    .string()
    .nullable()
    .describe("Chemin de l'application à ouvrir (« /annonces/… »)"),
  listingId: z.string().uuid().nullable(),
  actorName: z
    .string()
    .nullable()
    .describe('Qui a déclenché la notification (« Chloé », « Claude (MCP) »)'),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})
export type Notification = z.infer<typeof NotificationSchema>

export const NotificationQuerySchema = z.object({
  unreadOnly: z.preprocess(
    value => value === true || value === 'true' || value === '1',
    z.boolean()
  ),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})
export type NotificationQuery = z.infer<typeof NotificationQuerySchema>

export const NotificationPageSchema = z.object({
  items: z.array(NotificationSchema),
  total: z.number().int().min(0),
  unreadCount: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  pageCount: z.number().int().min(0),
})
export type NotificationPage = z.infer<typeof NotificationPageSchema>

/** Un abonnement Web Push tel que `PushSubscription.toJSON()` le donne. */
export const PushSubscriptionInputSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2000)
    .refine(value => value.startsWith('https://'), {
      message: 'Le point de terminaison push doit être en https',
    }),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
  userAgent: z.string().max(300).nullable().default(null),
})
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInputSchema>

export const PushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
})
export type PushUnsubscribe = z.infer<typeof PushUnsubscribeSchema>

/** Réglages de notification du membre connecté. */
export const NotificationSettingsSchema = z.object({
  preferences: NotificationPreferencesSchema,
  push: z.object({
    enabled: z
      .boolean()
      .describe('Vrai si le serveur a des clés VAPID (web push possible)'),
    publicKey: z
      .string()
      .nullable()
      .describe('Clé publique VAPID (applicationServerKey)'),
    subscriptions: z
      .number()
      .int()
      .min(0)
      .describe('Appareils abonnés pour ce membre'),
  }),
  email: z.object({
    enabled: z
      .boolean()
      .describe("Vrai si un envoi d'e-mails est configuré sur le serveur"),
    address: z.string().nullable().describe('Adresse du membre'),
  }),
  inbound: z.object({
    enabled: z
      .boolean()
      .describe("Vrai si le webhook d'alertes e-mail entrantes est configuré"),
    path: z
      .string()
      .describe('Chemin du webhook pour cet espace (POST, signé)'),
  }),
})
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>
