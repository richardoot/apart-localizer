import { QueryClient } from '@tanstack/vue-query'
import { ApiError } from './api'

/**
 * Server state lives in TanStack Query. A 401 or 404 is an answer, not a
 * transient failure: no retry. Everything else gets one.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status < 500) return false
          return failureCount < 1
        },
      },
    },
  })
}
