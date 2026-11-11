import { computed, ref, unref, watch } from 'vue'
import type { MaybeRef, Ref } from 'vue'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/vue-query'
import type {
  EvaluatedListing,
  ListingMergeInput,
  ListingSellerInputRaw,
} from '@apart/contracts'
import { api } from '@/lib/api'
import { listingKeys } from './useListings'

/** Ce qu'on compare aux annonces suivies : une annonce ou un brouillon. */
export interface SimilarTarget {
  listingId?: string | undefined
  draftId?: string | undefined
}

/** Le délai après la dernière frappe avant de chercher. */
export const SIMILAR_SEARCH_DELAY_MS = 250

/**
 * Lot 27 : les annonces suivies qui ressemblent à une annonce ou à un
 * brouillon, classées par l'API ; le texte cherché attend la fin de la
 * frappe, et la liste précédente reste affichée pendant la relecture.
 */
export function useSimilarListings(
  target: MaybeRef<SimilarTarget>,
  search: Ref<string>,
  options: { enabled?: MaybeRef<boolean>; limit?: number } = {}
) {
  const settled = ref(search.value.trim())
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(search, value => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      settled.value = value.trim()
    }, SIMILAR_SEARCH_DELAY_MS)
  })
  const params = computed(() => ({
    ...unref(target),
    q: settled.value || undefined,
    limit: options.limit,
  }))
  return useQuery({
    queryKey: computed(() => ['listings', 'similar', params.value] as const),
    queryFn: () => api.merges.similar(params.value),
    enabled: computed(() => {
      const { listingId, draftId, q } = params.value
      return (
        (unref(options.enabled) ?? true) && Boolean(listingId || draftId || q)
      )
    }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

/** Ce que ferait la fusion de `otherId` dans `keepId` ; lue quand les deux sont connues. */
export function useMergePreview(
  keepId: MaybeRef<string | null>,
  otherId: MaybeRef<string | null>
) {
  return useQuery({
    queryKey: computed(
      () =>
        ['listings', 'merge-preview', unref(keepId), unref(otherId)] as const
    ),
    queryFn: () =>
      api.merges.preview(unref(keepId) as string, unref(otherId) as string),
    enabled: computed(() => Boolean(unref(keepId) && unref(otherId))),
    staleTime: 0,
  })
}

/**
 * Lot 27 : fusionner deux fiches, annuler une fusion, ajouter ou retirer une
 * autre agence. Chaque écriture remplace la fiche gardée dans le cache et
 * rafraîchit les listes, les compteurs des étapes et les brouillons (une
 * fiche a pu disparaître des listes, ou y revenir).
 */
export function useListingMerge() {
  const client = useQueryClient()

  function settle(result: { listing: EvaluatedListing }): void {
    const { criteriaChanges: _changes, ...item } = result.listing
    client.setQueryData(listingKeys.detail(item.listing.id), {
      ...item,
      criteriaChanges: null,
    })
    void client.invalidateQueries({ queryKey: ['listings'] })
    void client.invalidateQueries({ queryKey: ['decisions'] })
    void client.invalidateQueries({ queryKey: ['listing-drafts'] })
    void client.invalidateQueries({ queryKey: ['tasks'] })
  }

  const merge = useMutation({
    mutationFn: ({
      keepId,
      input,
    }: {
      keepId: string
      input: ListingMergeInput
    }) => api.merges.merge(keepId, input),
    onSuccess: settle,
  })
  const undo = useMutation({
    mutationFn: (mergeId: string) => api.merges.undo(mergeId),
    onSuccess: settle,
  })
  const addSeller = useMutation({
    mutationFn: ({
      listingId,
      input,
    }: {
      listingId: string
      input: ListingSellerInputRaw
    }) => api.merges.addSeller(listingId, input),
    onSuccess: settle,
  })
  const removeSeller = useMutation({
    mutationFn: ({
      listingId,
      sellerId,
    }: {
      listingId: string
      sellerId: string
    }) => api.merges.removeSeller(listingId, sellerId),
    onSuccess: settle,
  })
  return { merge, undo, addSeller, removeSeller }
}
