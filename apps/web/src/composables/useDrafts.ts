import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  ListingDraftBatchAccept,
  ListingDraftDecision,
  ListingDraftMerge,
} from '@apart/contracts'
import { api } from '@/lib/api'

export const draftsKey = ['listing-drafts', 'pending'] as const

/**
 * Les annonces qui attendent une validation : reçues par e-mail (lot 6) ou
 * trouvées par Claude en explorant les portails (lot 16), avec leur
 * adéquation aux critères calculée à la lecture. Chaque décision rafraîchit
 * la liste des brouillons, les annonces (une annonce ajoutée ou mise à
 * jour) et les explorations.
 */
export function useDrafts() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: draftsKey,
    queryFn: () => api.drafts.list('pending'),
    staleTime: 60_000,
  })
  function settle(): void {
    void client.invalidateQueries({ queryKey: draftsKey })
    void client.invalidateQueries({ queryKey: ['listings'] })
    void client.invalidateQueries({ queryKey: ['explorations'] })
  }
  const decide = useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: string
      decision: ListingDraftDecision
    }) => api.drafts.decide(id, decision),
    onSuccess: settle,
  })
  const accept = useMutation({
    mutationFn: (id: string) => api.drafts.accept(id),
    onSuccess: settle,
  })
  const acceptInCriteria = useMutation({
    mutationFn: (request: ListingDraftBatchAccept) =>
      api.drafts.acceptInCriteria(request),
    onSuccess: settle,
  })
  const merge = useMutation({
    mutationFn: ({ id, request }: { id: string; request: ListingDraftMerge }) =>
      api.drafts.merge(id, request),
    onSuccess: settle,
  })
  const distinct = useMutation({
    mutationFn: (id: string) => api.drafts.distinct(id),
    onSuccess: settle,
  })
  return { ...query, decide, accept, acceptInCriteria, merge, distinct }
}
