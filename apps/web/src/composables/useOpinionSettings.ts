import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  OpinionCriterionCreate,
  OpinionCriterionUpdate,
  OpinionSettings,
} from '@apart/contracts'
import { api } from '@/lib/api'

export const opinionSettingsKey = ['opinion-settings'] as const

/**
 * Lot 20 (ADR 0030) : les critères des avis de l'espace et l'avis à
 * l'aveugle. Seul un propriétaire les change (le serveur refuse sinon) ;
 * chaque changement entre au journal. Les fiches et la liste relisent les
 * critères : toute écriture rafraîchit aussi les annonces.
 */
export function useOpinionSettings() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: opinionSettingsKey,
    queryFn: api.opinionSettings.get,
    staleTime: 60_000,
  })
  function settle(settings: OpinionSettings): void {
    client.setQueryData(opinionSettingsKey, settings)
    void client.invalidateQueries({ queryKey: ['listings'] })
  }
  const setBlind = useMutation({
    mutationFn: (blind: boolean) => api.opinionSettings.update({ blind }),
    onSuccess: settle,
  })
  const add = useMutation({
    mutationFn: (input: OpinionCriterionCreate) =>
      api.opinionSettings.addCriterion(input),
    onSuccess: settle,
  })
  const update = useMutation({
    mutationFn: ({
      key,
      update: patch,
    }: {
      key: string
      update: OpinionCriterionUpdate
    }) => api.opinionSettings.updateCriterion(key, patch),
    onSuccess: settle,
  })
  const reorder = useMutation({
    mutationFn: (keys: string[]) => api.opinionSettings.reorder({ keys }),
    onSuccess: settle,
  })
  const remove = useMutation({
    mutationFn: (key: string) => api.opinionSettings.removeCriterion(key),
    onSuccess: settle,
  })
  return { ...query, setBlind, add, update, reorder, remove }
}
