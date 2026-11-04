import { computed } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  AssumptionsUpdate,
  InvitationInput,
  MemberRole,
  WorkspaceMe,
} from '@apart/contracts'
import { api } from '@/lib/api'

export const workspaceKey = ['workspace'] as const
export const assumptionsKey = ['assumptions'] as const
export const receivedInvitationsKey = [
  'workspace-invitations-received',
] as const

/**
 * L'espace et le membre connecté, lus une fois et gardés. `members` porte
 * aussi les anciens membres (leur nom reste sur l'historique) ;
 * `activeMembers` sert aux choix (participants, assignation).
 */
export function useWorkspace() {
  const query = useQuery({
    queryKey: workspaceKey,
    queryFn: api.workspace,
    staleTime: 5 * 60_000,
  })
  const me = computed(() => query.data.value?.me ?? null)
  const members = computed(() => query.data.value?.workspace.members ?? [])
  const activeMembers = computed(() =>
    members.value.filter(m => m.status === 'active')
  )
  const isOwner = computed(() => me.value?.role === 'owner')
  const memberName = (id: string | null | undefined): string =>
    members.value.find(m => m.id === id)?.displayName ?? 'Membre'
  return { ...query, me, members, activeMembers, isOwner, memberName }
}

/**
 * Les écritures sur l'espace et ses membres (lot 8) : renommer, inviter,
 * annuler, changer un rôle, retirer, partir. Partir change d'espace : tout
 * le cache est relu.
 */
export function useMembers() {
  const client = useQueryClient()
  const refresh = () => client.invalidateQueries({ queryKey: workspaceKey })
  const rename = useMutation({
    mutationFn: (name: string) => api.members.rename({ name }),
    onSuccess: (me: WorkspaceMe) => client.setQueryData(workspaceKey, me),
  })
  const invite = useMutation({
    mutationFn: (input: InvitationInput) => api.members.invite(input),
    onSuccess: refresh,
  })
  const cancel = useMutation({
    mutationFn: (invitationId: string) => api.members.cancel(invitationId),
    onSuccess: refresh,
  })
  const changeRole = useMutation({
    mutationFn: (input: { memberId: string; role: MemberRole }) =>
      api.members.changeRole(input.memberId, input.role),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (memberId: string) => api.members.remove(memberId),
    onSuccess: refresh,
  })
  const leave = useMutation({
    mutationFn: () => api.members.leave(),
    onSuccess: () => client.resetQueries(),
  })
  return { rename, invite, cancel, changeRole, remove, leave }
}

/**
 * Les invitations reçues vers d'autres espaces (bandeau) : rejoindre change
 * d'espace (tout le cache est relu), refuser les retire de la liste.
 */
export function useReceivedInvitations() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: receivedInvitationsKey,
    queryFn: api.members.received,
    staleTime: 60_000,
  })
  const accept = useMutation({
    mutationFn: (invitationId: string) => api.members.accept(invitationId),
    onSuccess: async (me: WorkspaceMe) => {
      await client.resetQueries()
      client.setQueryData(workspaceKey, me)
    },
  })
  const decline = useMutation({
    mutationFn: (invitationId: string) => api.members.decline(invitationId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: receivedInvitationsKey }),
  })
  return { ...query, accept, decline }
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
