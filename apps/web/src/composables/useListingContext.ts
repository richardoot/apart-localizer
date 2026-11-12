import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { api } from '@/lib/api'
import { invalidateListingReads } from './useListings'

export const contextKeys = {
  detail: (id: string) => ['listings', 'context', id] as const,
}

/** Le bloc « Contexte » d'une fiche, calculé par le serveur à la lecture. */
export function useListingContext(id: MaybeRef<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => contextKeys.detail(unref(id) ?? '')),
    queryFn: () => api.listings.context(unref(id) as string),
    enabled: computed(() => Boolean(unref(id))),
  })
}

/** Recherche et validation du DPE, relance du géocodage. */
export function useContextMutations() {
  const client = useQueryClient()
  // Le géocodage relancé déplace le repère, un DPE retenu change la fiche :
  // toutes les lectures qui en dépendent sont relues.
  const settle = (id: string): void =>
    invalidateListingReads(client, id, { detail: true })
  const searchDpe = useMutation({
    mutationFn: (id: string) => api.listings.searchDpe(id),
    onSuccess: (_context, id) => settle(id),
  })
  const verifyDpe = useMutation({
    mutationFn: ({
      id,
      number,
      expectedUpdatedAt,
    }: {
      id: string
      number: string
      expectedUpdatedAt?: string
    }) =>
      api.listings.verifyDpe(id, {
        number,
        ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
      }),
    onSuccess: (_item, { id }) => settle(id),
  })
  const regeocode = useMutation({
    mutationFn: (id: string) => api.listings.regeocode(id),
    onSuccess: (_item, id) => settle(id),
  })
  return { searchDpe, verifyDpe, regeocode }
}
