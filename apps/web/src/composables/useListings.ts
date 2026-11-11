import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  EvaluatedListing,
  ListingCreateRaw,
  ListingFiltersInput,
  ListingPatch,
  ListingStatusChange,
  OfferInputRaw,
  OfferUpdate,
  OpinionInputRaw,
  PriceEventInput,
  SensitivityRequestInput,
  TaskUpdate,
} from '@apart/contracts'
import { api } from '@/lib/api'

/** Lot 23 : toutes les tâches ouvertes (accueil). */
export const openTasksKey = ['tasks', 'open'] as const

export const listingKeys = {
  all: ['listings'] as const,
  list: (filters: ListingFiltersInput) =>
    ['listings', 'list', filters] as const,
  detail: (id: string) => ['listings', 'detail', id] as const,
  targetPrice: (id: string) => ['listings', 'target-price', id] as const,
  sensitivity: (id: string, request: SensitivityRequestInput) =>
    ['listings', 'sensitivity', id, request] as const,
  compare: (ids: string[]) => ['listings', 'compare', ids] as const,
  areas: ['listings', 'areas'] as const,
  fitHistory: (id: string) => ['listings', 'fit-history', id] as const,
}

/** Lot 14 : l'historique de l'adéquation d'une annonce (rafraîchi avec les annonces). */
export function useCriteriaFitHistory(id: MaybeRef<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => listingKeys.fitHistory(unref(id) ?? '')),
    queryFn: () => api.listings.criteriaFitHistory(unref(id) as string),
    enabled: computed(() => Boolean(unref(id))),
  })
}

/**
 * Lot 12 : les contours des annonces placées au quartier, pour les cartes
 * (contour au survol ou à la sélection d'un repère au quartier).
 */
export function useListingAreas(enabled: MaybeRef<boolean> = true) {
  return useQuery({
    queryKey: listingKeys.areas,
    queryFn: () => api.listings.areas(),
    enabled: computed(() => unref(enabled)),
    staleTime: 60_000,
  })
}

/** « À partir de quel prix ? » : rapport de prix cible, rang et brief de négociation. */
export function useTargetPrice(id: MaybeRef<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => listingKeys.targetPrice(unref(id) ?? '')),
    queryFn: () => api.listings.targetPrice(unref(id) as string),
    enabled: computed(() => Boolean(unref(id))),
  })
}

/** Tableau de sensibilité, recalculé quand les axes ou les pas changent. */
export function useSensitivity(
  id: MaybeRef<string | null | undefined>,
  request: MaybeRef<SensitivityRequestInput>
) {
  return useQuery({
    queryKey: computed(() =>
      listingKeys.sensitivity(unref(id) ?? '', unref(request))
    ),
    queryFn: () =>
      api.listings.sensitivity(unref(id) as string, unref(request)),
    enabled: computed(() => Boolean(unref(id))),
    placeholderData: previous => previous,
  })
}

/** Comparaison côte à côte de 2 à 6 annonces. */
export function useCompare(ids: MaybeRef<string[]>) {
  return useQuery({
    queryKey: computed(() => listingKeys.compare(unref(ids))),
    queryFn: () => api.listings.compare(unref(ids)),
    enabled: computed(() => unref(ids).length >= 2),
  })
}

/** La liste filtrée ; une page de 200 suffit à deux personnes et quelques dizaines d'annonces. */
export function useListingList(
  filters: MaybeRef<ListingFiltersInput>,
  enabled: MaybeRef<boolean> = true
) {
  return useQuery({
    queryKey: computed(() => listingKeys.list(unref(filters))),
    queryFn: () => api.listings.list(unref(filters)),
    placeholderData: previous => previous,
    enabled: computed(() => unref(enabled)),
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
    // Lot 21 : les compteurs des étapes et « Ce qui t'attend ».
    void client.invalidateQueries({ queryKey: ['decisions'] })
    // Le prix, le statut et l'historique nourrissent le rang et le brief.
    void client.invalidateQueries({
      queryKey: listingKeys.targetPrice(item.listing.id),
    })
    void client.invalidateQueries({
      queryKey: ['listings', 'sensitivity', item.listing.id],
    })
    // La checklist et le loyer de marché lisent la fiche (DPE, loyer visé, plafond).
    void client.invalidateQueries({
      queryKey: ['listings', 'compliance', item.listing.id],
    })
    void client.invalidateQueries({
      queryKey: ['listings', 'rent-comparables', item.listing.id],
    })
    // Lot 12 : le repère a pu bouger (adresse, quartier) : contexte et contours.
    void client.invalidateQueries({
      queryKey: ['listings', 'context', item.listing.id],
    })
    void client.invalidateQueries({ queryKey: listingKeys.areas })
  }

  function refresh(listingId: string): void {
    void client.invalidateQueries({ queryKey: listingKeys.detail(listingId) })
    void client.invalidateQueries({ queryKey: ['listings', 'list'] })
    void client.invalidateQueries({
      queryKey: listingKeys.targetPrice(listingId),
    })
  }
  /** Lot 23 : une tâche change aussi « Toutes les tâches » et les retards de l'accueil. */
  function refreshTasks(listingId: string): void {
    refresh(listingId)
    void client.invalidateQueries({ queryKey: openTasksKey })
    void client.invalidateQueries({ queryKey: ['decisions', 'overview'] })
  }

  const create = useMutation({
    mutationFn: (input: ListingCreateRaw) => api.listings.create(input),
    onSuccess: result => {
      // La fiche en cache ne porte ni doublons ni tâches créées : ce sont des
      // informations du moment de la création.
      const {
        duplicates: _duplicates,
        createdTasks: _createdTasks,
        ...item
      } = result
      settle(item)
    },
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
  /** Lot 20 : un avis change la fiche, la liste et le journal (filtre « Avis »). */
  function refreshOpinions(listingId: string): void {
    refresh(listingId)
    void client.invalidateQueries({
      queryKey: ['listings', 'activity', listingId],
    })
    void client.invalidateQueries({ queryKey: ['listings', 'compare'] })
  }

  const upsertOpinion = useMutation({
    mutationFn: ({ id, input }: { id: string; input: OpinionInputRaw }) =>
      api.opinions.upsertMine(id, input),
    onSuccess: (_opinion, { id }) => refreshOpinions(id),
  })
  /** Lot 20 : « Voir quand même ». */
  const revealOpinions = useMutation({
    mutationFn: (id: string) => api.opinions.reveal(id),
    onSuccess: (_reveal, id) => refreshOpinions(id),
  })
  const addTask = useMutation({
    mutationFn: ({
      id,
      label,
      details,
      origin,
    }: {
      id: string
      label: string
      /** Lot 20 : le contexte d'une tâche proposée depuis « Nos avis ». */
      details?: string | null
      origin?: 'manual' | 'opinion'
    }) =>
      api.tasks.create(id, {
        label,
        ...(details ? { details } : {}),
        ...(origin ? { origin } : {}),
      }),
    onSuccess: (_task, { id }) => refreshTasks(id),
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
    onSuccess: (_task, { id }) => refreshTasks(id),
  })
  const removeTask = useMutation({
    mutationFn: ({ id, taskId }: { id: string; taskId: string }) =>
      api.tasks.remove(id, taskId),
    onSuccess: (_void, { id }) => refreshTasks(id),
  })
  const addOffer = useMutation({
    mutationFn: ({ id, input }: { id: string; input: OfferInputRaw }) =>
      api.offers.create(id, input),
    onSuccess: (_result, { id }) => refresh(id),
  })
  const updateOffer = useMutation({
    mutationFn: ({
      id,
      offerId,
      update,
    }: {
      id: string
      offerId: string
      update: OfferUpdate
    }) => api.offers.update(id, offerId, update),
    onSuccess: (_result, { id }) => refresh(id),
  })

  return {
    create,
    update,
    setStatus,
    markSeen,
    recordPriceChange,
    upsertOpinion,
    revealOpinions,
    addTask,
    updateTask,
    removeTask,
    addOffer,
    updateOffer,
  }
}
