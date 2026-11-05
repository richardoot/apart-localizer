import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/lib/api'

export const explorationKeys = {
  all: ['explorations'] as const,
  list: (limit: number, criteriaId: string | null) =>
    ['explorations', 'list', limit, criteriaId] as const,
  detail: (id: string) => ['explorations', 'detail', id] as const,
  brief: (criteriaId: string) => ['explorations', 'brief', criteriaId] as const,
}

/** Lot 16 : les dernières explorations des portails par Claude. */
export function useExplorationList(
  limit: MaybeRef<number> = 5,
  criteriaId: MaybeRef<string | null> = null
) {
  return useQuery({
    queryKey: computed(() =>
      explorationKeys.list(unref(limit), unref(criteriaId))
    ),
    queryFn: () =>
      api.explorations.list(unref(limit), unref(criteriaId) ?? undefined),
    staleTime: 60_000,
  })
}

/** Le compte rendu d'une exploration. */
export function useExploration(id: MaybeRef<string>) {
  return useQuery({
    queryKey: computed(() => explorationKeys.detail(unref(id))),
    queryFn: () => api.explorations.get(unref(id)),
  })
}

/** Ce que Claude cherche pour un critère : seuils, zones, portails, liens. */
export function useCriteriaBrief(criteriaId: MaybeRef<string>) {
  return useQuery({
    queryKey: computed(() => explorationKeys.brief(unref(criteriaId))),
    queryFn: () => api.explorations.brief(unref(criteriaId)),
  })
}
