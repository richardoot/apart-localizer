import { QueryClient } from '@tanstack/vue-query'
import { ApiError } from './api'

/**
 * ADR 0048 : chaque relecture réveille une fonction Vercel, comptée en temps
 * CPU. Une donnée se relit quand une page qui l'affiche s'ouvre après
 * `QUERY_STALE_MS`, ou quand une écriture l'invalide ; le retour sur l'onglet
 * ne relit que ce qui dit ce qu'un autre membre a fait (cloche, étapes).
 */
export const QUERY_STALE_MS = 60_000

/** Ce qui ne change que par une écriture qui l'invalide : critères, hypothèses, espace. */
export const STABLE_STALE_MS = 5 * 60_000

/** La cloche : relue toutes les cinq minutes, au retour sur l'onglet, et par le web push. */
export const NOTIFICATIONS_POLL_MS = 5 * 60_000

/**
 * Server state lives in TanStack Query. A 401 or 404 is an answer, not a
 * transient failure: no retry. Everything else gets one.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_MS,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status < 500) return false
          return failureCount < 1
        },
      },
    },
  })
}
