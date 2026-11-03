import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { ListingDraftDecision } from '@apart/contracts'
import { api } from '@/lib/api'

export const draftsKey = ['listing-drafts', 'pending'] as const

/** Les annonces reçues par e-mail qui attendent une validation. */
export function useDrafts() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: draftsKey,
    queryFn: () => api.drafts.list('pending'),
    staleTime: 60_000,
  })
  const decide = useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: string
      decision: ListingDraftDecision
    }) => api.drafts.decide(id, decision),
    onSuccess: () => void client.invalidateQueries({ queryKey: draftsKey }),
  })
  return { ...query, decide }
}
