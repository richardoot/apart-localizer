import webpush from 'web-push'

/**
 * L'envoi Web Push, derrière un jeton d'injection : la bibliothèque
 * `web-push` en vrai (clés VAPID lues dans l'environnement, jamais dans le
 * dépôt), un faux dans les tests, `null` sans clés (push désactivé).
 */
export const PUSH_SENDER = Symbol('PUSH_SENDER')

export interface PushTarget {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface PushSender {
  /** La clé publique VAPID, que le navigateur donne à `pushManager.subscribe`. */
  readonly publicKey: string
  /** Envoie ; rejette avec une `PushDeliveryError` portant le code HTTP du service push. */
  send(target: PushTarget, payload: string): Promise<void>
}

/** Un refus du service push ; 404 et 410 disent que l'abonnement n'existe plus. */
export class PushDeliveryError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'PushDeliveryError'
  }

  get expired(): boolean {
    return this.statusCode === 404 || this.statusCode === 410
  }
}

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

/** Les clés VAPID de l'environnement, ou null s'il en manque une. */
export function vapidConfig(env: NodeJS.ProcessEnv): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = env.VAPID_PRIVATE_KEY?.trim()
  const subject = env.VAPID_SUBJECT?.trim()
  if (!publicKey || !privateKey || !subject) return null
  return { publicKey, privateKey, subject }
}

type SendNotification = typeof webpush.sendNotification

/** L'envoi par `web-push`, avec les détails VAPID passés à chaque appel (aucun état global). */
export function createPushSender(
  config: VapidConfig | null,
  sendNotification: SendNotification = webpush.sendNotification.bind(webpush)
): PushSender | null {
  if (!config) return null
  return {
    publicKey: config.publicKey,
    async send(target, payload) {
      try {
        await sendNotification(target, payload, {
          vapidDetails: config,
          TTL: 24 * 3600,
          urgency: 'normal',
        })
      } catch (error) {
        const statusCode =
          typeof error === 'object' &&
          error !== null &&
          'statusCode' in error &&
          typeof (error as { statusCode: unknown }).statusCode === 'number'
            ? (error as { statusCode: number }).statusCode
            : 0
        throw new PushDeliveryError(
          statusCode,
          error instanceof Error ? error.message : 'Envoi push impossible'
        )
      }
    },
  }
}
