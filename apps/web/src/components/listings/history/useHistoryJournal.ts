import { computed, ref, unref, watch } from 'vue'
import type { MaybeRef } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import type { ActivityEntry } from '@apart/contracts'
import { api } from '@/lib/api'

/** Lignes du journal lues par page (le maximum de l'API). */
export const HISTORY_PAGE_SIZE = 200

/**
 * Lot 19 : le journal de l'annonce pour l'Historique, lu par pages de 200 et
 * accumulé (« Plus anciens » ajoute la page suivante). La clé reste sous
 * `['listings', 'activity', id]` : toute écriture qui rafraîchit le journal
 * de la fiche le rafraîchit aussi.
 */
export function useHistoryJournal(listingId: MaybeRef<string>) {
  const page = ref(1)
  const pages = ref<Record<number, ActivityEntry[]>>({})
  const query = useQuery({
    queryKey: computed(
      () =>
        [
          'listings',
          'activity',
          unref(listingId),
          'history',
          page.value,
        ] as const
    ),
    queryFn: () =>
      api.activity.forListing(unref(listingId), {
        page: page.value,
        limit: HISTORY_PAGE_SIZE,
      }),
    enabled: computed(() => Boolean(unref(listingId))),
  })
  watch(
    () => query.data.value,
    data => {
      if (data) pages.value = { ...pages.value, [data.page]: data.items }
    },
    { immediate: true }
  )
  watch(
    () => unref(listingId),
    () => {
      page.value = 1
      pages.value = {}
    }
  )

  const entries = computed(() =>
    Object.keys(pages.value)
      .map(Number)
      .sort((a, b) => a - b)
      .flatMap(p => pages.value[p] ?? [])
  )
  const hasMore = computed(() => {
    const data = query.data.value
    return data ? page.value < data.pageCount : false
  })
  function loadMore(): void {
    if (hasMore.value) page.value += 1
  }

  return {
    entries,
    hasMore,
    loadMore,
    isPending: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    /** Lot 22 : pour `QueryState` (« Réessayer »). */
    isError: query.isError,
    refetch: query.refetch,
  }
}
