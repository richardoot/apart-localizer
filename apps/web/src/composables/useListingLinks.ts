import { unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type {
  ListingLinkInputRaw,
  ListingLinkPatch,
  ListingLinkWriteResult,
  PriceEventInput,
} from '@apart/contracts'
import { api } from '@/lib/api'
import { checkKeys } from './useListingChecks'
import { listingKeys } from './useListings'

/**
 * Lot 18 : les écritures sur les liens d'une annonce (« Où la trouver ») :
 * ajouter un lien collé, relever le prix ou l'état d'un lien, le retirer
 * (jamais le dernier), et « Prendre ce prix » quand le prix de la fiche,
 * saisi à la main, n'est pas le plus bas en ligne. Chaque écriture remplace
 * la fiche dans le cache et rafraîchit la liste (pastilles des portails),
 * les vérifications (« Lien ajouté »), le brief et le journal.
 */
export function useListingLinks(listingId: MaybeRef<string>) {
  const client = useQueryClient()

  function refresh(id: string): void {
    void client.invalidateQueries({ queryKey: ['listings', 'list'] })
    void client.invalidateQueries({ queryKey: checkKeys.list(id) })
    void client.invalidateQueries({ queryKey: listingKeys.targetPrice(id) })
    void client.invalidateQueries({ queryKey: ['listings', 'activity', id] })
  }

  function settle(result: ListingLinkWriteResult): void {
    const { criteriaChanges: _changes, ...item } = result.listing
    client.setQueryData(listingKeys.detail(item.listing.id), {
      ...item,
      criteriaChanges: null,
    })
    refresh(item.listing.id)
  }

  const add = useMutation({
    mutationFn: (input: ListingLinkInputRaw) =>
      api.links.add(unref(listingId), input),
    onSuccess: settle,
  })
  const update = useMutation({
    mutationFn: ({
      linkId,
      patch,
    }: {
      linkId: string
      patch: ListingLinkPatch
    }) => api.links.update(unref(listingId), linkId, patch),
    onSuccess: settle,
  })
  const remove = useMutation({
    mutationFn: (linkId: string) => api.links.remove(unref(listingId), linkId),
    onSuccess: settle,
  })
  /** « Prendre ce prix » : un changement de prix ordinaire, lu sur le portail. */
  const takePrice = useMutation({
    mutationFn: (input: PriceEventInput) =>
      api.listings.recordPriceChange(unref(listingId), input),
    onSuccess: item => {
      client.setQueryData(listingKeys.detail(item.listing.id), item)
      refresh(item.listing.id)
    },
  })

  return { add, update, remove, takePrice }
}

/**
 * Lot 18 : « C'est la même : ajouter ce lien » depuis la création d'une
 * annonce (lien collé ou partagé depuis le téléphone) : le lien rejoint la
 * fiche de l'annonce déjà suivie, rien n'est créé.
 */
export function useAttachLink() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      listingId,
      input,
    }: {
      listingId: string
      input: ListingLinkInputRaw
    }) => api.links.add(listingId, input),
    onSuccess: result => {
      const { criteriaChanges: _changes, ...item } = result.listing
      client.setQueryData(listingKeys.detail(item.listing.id), {
        ...item,
        criteriaChanges: null,
      })
      void client.invalidateQueries({ queryKey: ['listings', 'list'] })
      void client.invalidateQueries({
        queryKey: checkKeys.list(item.listing.id),
      })
    },
  })
}
