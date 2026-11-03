import { computed, ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { NotificationPreferencesUpdate } from '@apart/contracts'
import { ApiError, api } from '@/lib/api'
import { pushSupport, urlBase64ToUint8Array } from '@/lib/push'

export const notificationKeys = {
  list: (unreadOnly: boolean, limit: number) =>
    ['notifications', 'list', unreadOnly, limit] as const,
  settings: ['notifications', 'settings'] as const,
}

/** La cloche : les notifications du membre, relues chaque minute. */
export function useNotifications(unreadOnly = false, limit = 20) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: notificationKeys.list(unreadOnly, limit),
    queryFn: () => api.notifications.list({ unreadOnly, limit }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const unreadCount = computed(() => query.data.value?.unreadCount ?? 0)
  const invalidate = () =>
    void client.invalidateQueries({ queryKey: ['notifications', 'list'] })
  const markRead = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      api.notifications.markRead(id, read),
    onSuccess: invalidate,
  })
  const markAllRead = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: invalidate,
  })
  return { ...query, unreadCount, markRead, markAllRead }
}

/** Les réglages : préférences par type et canal, web push, e-mail. */
export function useNotificationSettings() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: notificationKeys.settings,
    queryFn: () => api.notifications.settings(),
  })
  const save = (
    settings: Awaited<ReturnType<typeof api.notifications.settings>>
  ) => client.setQueryData(notificationKeys.settings, settings)
  const updatePreferences = useMutation({
    mutationFn: (update: NotificationPreferencesUpdate) =>
      api.notifications.updatePreferences(update),
    onSuccess: save,
  })

  const pushError = ref<string | null>(null)
  const pushBusy = ref(false)
  const support = pushSupport()

  /** Abonne cet appareil : permission, abonnement du service worker, enregistrement côté API. */
  async function subscribePush(): Promise<boolean> {
    pushError.value = null
    const publicKey = query.data.value?.push.publicKey
    if (!publicKey) {
      pushError.value =
        "Le serveur n'a pas de clés VAPID : le push est désactivé."
      return false
    }
    if (support !== 'supported') {
      pushError.value =
        support === 'denied'
          ? 'Les notifications sont bloquées pour ce site dans le navigateur.'
          : "Cet appareil ne sait pas recevoir de notifications push (installez l'application sur l'écran d'accueil)."
      return false
    }
    pushBusy.value = true
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        pushError.value = 'Permission refusée.'
        return false
      }
      const registration = await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }))
      const json = subscription.toJSON()
      save(
        await api.notifications.subscribe({
          endpoint: json.endpoint ?? subscription.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? '',
            auth: json.keys?.auth ?? '',
          },
          userAgent: navigator.userAgent.slice(0, 300),
        })
      )
      return true
    } catch (error) {
      pushError.value =
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "L'abonnement a échoué."
      return false
    } finally {
      pushBusy.value = false
    }
  }

  async function unsubscribePush(): Promise<void> {
    pushError.value = null
    pushBusy.value = true
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        save(await api.notifications.unsubscribe(subscription.endpoint))
        await subscription.unsubscribe()
      }
    } catch (error) {
      pushError.value =
        error instanceof Error ? error.message : 'Le désabonnement a échoué.'
    } finally {
      pushBusy.value = false
    }
  }

  return {
    ...query,
    updatePreferences,
    support,
    pushError,
    pushBusy,
    subscribePush,
    unsubscribePush,
  }
}
