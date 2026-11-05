import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  SearchCriteriaInputRaw,
  SearchCriteriaPreviewRequestInput,
  SearchCriteriaUpdate,
} from '@apart/contracts'
import { api } from '@/lib/api'

export const criteriaKeys = {
  all: ['search-criteria'] as const,
  list: (includeArchived: boolean) =>
    ['search-criteria', 'list', includeArchived] as const,
  preview: (request: SearchCriteriaPreviewRequestInput) =>
    ['search-criteria', 'preview', request] as const,
}

/** Les critères de l'espace, avec leurs compteurs (annonces gardées, nouveautés, lot 14 : par niveau d'adéquation). */
export function useSearchCriteriaList(
  includeArchived: MaybeRef<boolean> = false
) {
  return useQuery({
    queryKey: computed(() => criteriaKeys.list(unref(includeArchived))),
    queryFn: () => api.searchCriteria.list(unref(includeArchived)),
  })
}

/** Aperçu d'un critère en cours de saisie : nombre d'annonces, périmètre résolu. */
export function useCriteriaPreview(
  request: MaybeRef<SearchCriteriaPreviewRequestInput | null>
) {
  return useQuery({
    queryKey: computed(() =>
      criteriaKeys.preview(unref(request) ?? { perimeter: null })
    ),
    queryFn: () =>
      api.searchCriteria.preview(
        unref(request) as SearchCriteriaPreviewRequestInput
      ),
    enabled: computed(() => unref(request) !== null),
    placeholderData: previous => previous,
    retry: false,
  })
}

/** Les écritures : chaque critère modifié rafraîchit les listes et les annonces (badges). */
export function useCriteriaMutations() {
  const client = useQueryClient()
  function settle(): void {
    void client.invalidateQueries({ queryKey: criteriaKeys.all })
    void client.invalidateQueries({ queryKey: ['listings'] })
  }
  const create = useMutation({
    mutationFn: (input: SearchCriteriaInputRaw) =>
      api.searchCriteria.create(input),
    onSuccess: settle,
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SearchCriteriaUpdate }) =>
      api.searchCriteria.update(id, patch),
    onSuccess: settle,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.searchCriteria.remove(id),
    onSuccess: settle,
  })
  return { create, update, remove }
}
