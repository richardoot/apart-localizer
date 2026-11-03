/**
 * Le web push côté navigateur : la clé VAPID publique en octets, et la
 * détection de ce que l'appareil sait faire. L'abonnement passe par le
 * service worker de la PWA (installée, ou ouverte depuis le build) ; en
 * développement, le service worker n'est pas actif.
 */

/** La clé publique VAPID (base64url) en `Uint8Array`, pour `applicationServerKey`. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export type PushSupport = 'supported' | 'unsupported' | 'denied'

export function pushSupport(
  scope: {
    navigator?: Navigator
    PushManager?: unknown
    Notification?: { permission: NotificationPermission }
  } = globalThis as never
): PushSupport {
  if (
    !scope.navigator ||
    !('serviceWorker' in scope.navigator) ||
    !scope.PushManager ||
    !scope.Notification
  ) {
    return 'unsupported'
  }
  return scope.Notification.permission === 'denied' ? 'denied' : 'supported'
}
