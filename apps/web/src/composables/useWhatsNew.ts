import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { api } from '@/lib/api'
import { criteriaKeys } from './useSearchCriteria'

export const whatsNewKey = ['whats-new'] as const

/** « Ce qui a changé depuis ma dernière visite » et « tout marquer comme vu ». */
export function useWhatsNew() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: whatsNewKey,
    queryFn: () => api.whatsNew.report(),
    staleTime: 60_000,
  })
  const markSeen = useMutation({
    mutationFn: () => api.whatsNew.markSeen(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: whatsNewKey })
      void client.invalidateQueries({ queryKey: ['listings'] })
      void client.invalidateQueries({ queryKey: criteriaKeys.all })
    },
  })
  return { ...query, markSeen }
}

/** Trop rapproché, un signal de visite n'apprend rien au serveur. */
const HEARTBEAT_MIN_MS = 5 * 60_000
let lastHeartbeat = 0

/**
 * Signale une visite de l'application (au chargement, puis au retour sur
 * l'onglet) : le serveur avance le point de départ des nouveautés après
 * trente minutes d'absence. Rend la promesse de l'appel, ou null s'il est
 * trop tôt.
 */
export function sendVisitHeartbeat(
  now = Date.now(),
  send: () => Promise<unknown> = () => api.whatsNew.visit()
): Promise<unknown> | null {
  if (now - lastHeartbeat < HEARTBEAT_MIN_MS) return null
  lastHeartbeat = now
  return send().catch(() => {
    // Une visite non signalée n'empêche rien : la suivante le fera.
    lastHeartbeat = 0
  })
}

/** Pour les tests : oublie le dernier signal. */
export function resetVisitHeartbeat(): void {
  lastHeartbeat = 0
}
