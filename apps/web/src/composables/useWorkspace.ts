import { computed } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { AssumptionsUpdate } from '@apart/contracts'
import { api } from '@/lib/api'

export const workspaceKey = ['workspace'] as const
export const assumptionsKey = ['assumptions'] as const

/** L'espace et le membre connecté, lus une fois et gardés. */
export function useWorkspace() {
  const query = useQuery({
    queryKey: workspaceKey,
    queryFn: api.workspace,
    staleTime: 5 * 60_000,
  })
  const me = computed(() => query.data.value?.me ?? null)
  const members = computed(() => query.data.value?.workspace.members ?? [])
  const memberName = (id: string | null | undefined): string =>
    members.value.find(m => m.id === id)?.displayName ?? 'Membre'
  return { ...query, me, members, memberName }
}

/** Les hypothèses en vigueur, et leur mise à jour (nouvelle version). */
export function useAssumptions() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: assumptionsKey,
    queryFn: api.assumptions.current,
    staleTime: 5 * 60_000,
  })
  const values = computed(() => query.data.value?.values ?? null)
  const update = useMutation({
    mutationFn: (input: AssumptionsUpdate) => api.assumptions.update(input),
    onSuccess: result => {
      // La version en cache ne porte pas l'impact : c'est une information du moment.
      const { impact: _impact, ...version } = result
      client.setQueryData(assumptionsKey, version)
      // Les indicateurs de chaque annonce dépendent des hypothèses.
      void client.invalidateQueries({ queryKey: ['listings'] })
    },
  })
  return { ...query, values, update }
}
