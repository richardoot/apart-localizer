import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/lib/api'
import type { ActivityFilters } from '@/lib/api'

/** Le journal de l'espace, filtré et paginé. */
export function useActivity(filters: MaybeRef<ActivityFilters>) {
  return useQuery({
    queryKey: computed(() => ['activity', unref(filters)] as const),
    queryFn: () => api.activity.list(unref(filters)),
    placeholderData: previous => previous,
  })
}

/** Le journal d'une annonce. */
export function useListingActivity(
  listingId: MaybeRef<string>,
  page: MaybeRef<number> = 1
) {
  return useQuery({
    queryKey: computed(
      () => ['listings', 'activity', unref(listingId), unref(page)] as const
    ),
    queryFn: () =>
      api.activity.forListing(unref(listingId), {
        page: unref(page),
        limit: 30,
      }),
    enabled: computed(() => Boolean(unref(listingId))),
    placeholderData: previous => previous,
  })
}
