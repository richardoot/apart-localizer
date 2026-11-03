import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  EvaluatedListing,
  ListingFiltersInput,
  ListingInputRaw,
  ListingPatch,
  ListingStatusChange,
  OpinionInput,
  PriceEventInput,
  TaskUpdate,
} from '@apart/contracts'
import { api } from '@/lib/api'

export const listingKeys = {
  all: ['listings'] as const,
  list: (filters: ListingFiltersInput) =>
    ['listings', 'list', filters] as const,
  detail: (id: string) => ['listings', 'detail', id] as const,
}

/** La liste filtrée ; une page de 200 suffit à deux personnes et quelques dizaines d'annonces. */
export function useListingList(filters: MaybeRef<ListingFiltersInput>) {
  return useQuery({
    queryKey: computed(() => listingKeys.list(unref(filters))),
    queryFn: () => api.listings.list(unref(filters)),
    placeholderData: previous => previous,
  })
}

export function useListing(id: MaybeRef<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => listingKeys.detail(unref(id) ?? '')),
    queryFn: () => api.listings.get(unref(id) as string),
    enabled: computed(() => Boolean(unref(id))),
  })
}

/**
 * Les écritures. Chacune remplace la fiche dans le cache et invalide les
 * listes : la ligne du tableau et le marqueur de la carte se mettent à jour
 * sans rechargement.
 */
export function useListingMutations() {
  const client = useQueryClient()

  function settle(item: EvaluatedListing): void {
    client.setQueryData(listingKeys.detail(item.listing.id), item)
    void client.invalidateQueries({ queryKey: ['listings', 'list'] })
  }

  function refresh(listingId: string): void {
    void client.invalidateQueries({ queryKey: listingKeys.detail(listingId) })
    void client.invalidateQueries({ queryKey: ['listings', 'list'] })
  }

  const create = useMutation({
    mutationFn: (input: ListingInputRaw) => api.listings.create(input),
    onSuccess: settle,
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ListingPatch }) =>
      api.listings.update(id, patch),
    onSuccess: settle,
  })
  const setStatus = useMutation({
    mutationFn: ({ id, change }: { id: string; change: ListingStatusChange }) =>
      api.listings.setStatus(id, change),
    onSuccess: settle,
  })
  const markSeen = useMutation({
    mutationFn: (id: string) => api.listings.markSeen(id),
    onSuccess: settle,
  })
  const recordPriceChange = useMutation({
    mutationFn: ({ id, input }: { id: string; input: PriceEventInput }) =>
      api.listings.recordPriceChange(id, input),
    onSuccess: settle,
  })
  const upsertOpinion = useMutation({
    mutationFn: ({ id, input }: { id: string; input: OpinionInput }) =>
      api.opinions.upsertMine(id, input),
    onSuccess: (_opinion, { id }) => refresh(id),
  })
  const addTask = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      api.tasks.create(id, { label }),
    onSuccess: (_task, { id }) => refresh(id),
  })
  const updateTask = useMutation({
    mutationFn: ({
      id,
      taskId,
      update,
    }: {
      id: string
      taskId: string
      update: TaskUpdate
    }) => api.tasks.update(id, taskId, update),
    onSuccess: (_task, { id }) => refresh(id),
  })
  const removeTask = useMutation({
    mutationFn: ({ id, taskId }: { id: string; taskId: string }) =>
      api.tasks.remove(id, taskId),
    onSuccess: (_void, { id }) => refresh(id),
  })

  return {
    create,
    update,
    setStatus,
    markSeen,
    recordPriceChange,
    upsertOpinion,
    addTask,
    updateTask,
    removeTask,
  }
}
