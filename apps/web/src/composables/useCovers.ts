import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { LISTING_COVERS_MAX } from '@apart/contracts'
import type { ListingCover, ListingCovers } from '@apart/contracts'
import { api } from '@/lib/api'

/**
 * Lot 25 (ADR 0035) : la photo de couverture des annonces. Une seule lecture
 * pour toute une liste (les vignettes sont signées en un appel au stockage),
 * relue avant la fin de validité des URL signées (dix minutes par défaut).
 * Clé sous `['listings']` : une visite, une photo ou une annonce écrite la
 * relit. Aucune image n'est gardée sur l'appareil.
 */
export const coverKeys = {
  all: ['listings', 'covers'] as const,
  of: (ids: readonly string[]) =>
    ['listings', 'covers', [...ids].sort().join(',')] as const,
}

/** Une minute de marge avant la fin de validité ; au moins trente secondes. */
export function coverRefetchDelay(
  data: ListingCovers | undefined,
  now = Date.now()
): number | false {
  const ends = (data?.covers ?? [])
    .map(c => (c.urlExpiresAt ? Date.parse(c.urlExpiresAt) : Number.NaN))
    .filter(Number.isFinite)
  if (ends.length === 0) return false
  return Math.max(30_000, Math.min(...ends) - now - 60_000)
}

/** Les couvertures des annonces affichées, par identifiant d'annonce. */
export function useListingCovers(ids: MaybeRef<readonly string[]>) {
  // Au plus deux cents par lecture (au-delà, les premières affichées).
  const list = computed(() =>
    [...new Set(unref(ids))].slice(0, LISTING_COVERS_MAX)
  )
  const query = useQuery({
    queryKey: computed(() => coverKeys.of(list.value)),
    queryFn: () => api.covers.list(list.value),
    enabled: computed(() => list.value.length > 0),
    staleTime: 4 * 60_000,
    refetchInterval: q => coverRefetchDelay(q.state.data),
    placeholderData: previous => previous,
  })
  const byId = computed(
    () =>
      new Map<string, ListingCover>(
        (query.data.value?.covers ?? []).map(c => [c.listingId, c])
      )
  )
  /** Une vignette expirée ou illisible : on relit les couvertures. */
  function refresh(): void {
    void query.refetch()
  }
  return { query, byId, refresh }
}

/** La couverture d'une annonce (fiche). */
export function useListingCover(id: MaybeRef<string>) {
  const covers = useListingCovers(computed(() => [unref(id)]))
  return {
    cover: computed(() => covers.byId.value.get(unref(id)) ?? null),
    refresh: covers.refresh,
  }
}

/** Choisir la couverture d'une annonce, ou revenir à la première photo (null). */
export function useChooseCover(listingId: MaybeRef<string>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (photoId: string | null) =>
      api.covers.choose(unref(listingId), photoId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: coverKeys.all })
      void client.invalidateQueries({
        queryKey: ['listings', 'activity', unref(listingId)],
      })
    },
  })
}
