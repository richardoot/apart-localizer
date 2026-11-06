import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { ListingCheckInputRaw } from '@apart/contracts'
import { api } from '@/lib/api'
import { listingKeys } from './useListings'

export const checkKeys = {
  list: (listingId: string) => ['listings', 'checks', listingId] as const,
}

/**
 * Lot 15 : les vérifications d'une annonce sur le portail (chronologie
 * de l'Historique) et l'enregistrement d'une vérification depuis la fiche
 * (« Vue en ligne aujourd'hui », « Plus en ligne »). Une vérification change
 * la fiche, la liste (« à revérifier »), le brief et le journal.
 */
export function useListingChecks(listingId: MaybeRef<string>) {
  const client = useQueryClient()
  const key = computed(() => checkKeys.list(unref(listingId)))
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.listings.checks(unref(listingId)),
    enabled: computed(() => Boolean(unref(listingId))),
  })

  const apply = useMutation({
    mutationFn: (input: ListingCheckInputRaw) =>
      api.listings.applyCheck(unref(listingId), input),
    onSuccess: result => {
      const { criteriaChanges: _changes, ...item } = result.listing
      client.setQueryData(listingKeys.detail(item.listing.id), {
        ...item,
        criteriaChanges: null,
      })
      void client.invalidateQueries({ queryKey: key.value })
      void client.invalidateQueries({ queryKey: ['listings', 'list'] })
      void client.invalidateQueries({
        queryKey: listingKeys.targetPrice(item.listing.id),
      })
      void client.invalidateQueries({
        queryKey: ['listings', 'activity', item.listing.id],
      })
    },
  })

  return { ...query, apply }
}
