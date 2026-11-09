import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  DecisionInput,
  DecisionRespond,
  DecisionSettle,
} from '@apart/contracts'
import { api } from '@/lib/api'
import { workspaceKey } from '@/composables/useWorkspace'

export const decisionKeys = {
  all: ['decisions'] as const,
  overview: ['decisions', 'overview'] as const,
  cards: (kind: 'confirm' | 'settle') => ['decisions', 'cards', kind] as const,
}

/**
 * Lot 21 (ADR 0031) : les compteurs des étapes, « Ce qui t'attend » et les
 * propositions en cours. Léger et relu après chaque décision, sans recharger
 * la liste des annonces.
 */
export function useWorkflowOverview(enabled: MaybeRef<boolean> = true) {
  return useQuery({
    queryKey: decisionKeys.overview,
    queryFn: api.decisions.overview,
    staleTime: 15_000,
    enabled: computed(() => unref(enabled)),
  })
}

/** Les propositions à confirmer par le membre, ou à trancher, avec ce qu'elles visent. */
export function useDecisionCards(
  kind: MaybeRef<'confirm' | 'settle'>,
  enabled: MaybeRef<boolean> = true
) {
  return useQuery({
    queryKey: computed(() => decisionKeys.cards(unref(kind))),
    queryFn: () => api.decisions.cards(unref(kind)),
    enabled: computed(() => unref(enabled)),
  })
}

/**
 * Les écritures d'une décision. Pendant une session de tri
 * (`{ inSession: true }`), seuls les compteurs sont relus : la liste ne se
 * recharge pas à chaque clic ; la fin de la session relit tout.
 */
export function useDecisionActions(
  options: { inSession?: boolean; listingId?: MaybeRef<string | null> } = {}
) {
  const client = useQueryClient()

  function refreshAll(): void {
    void client.invalidateQueries({ queryKey: decisionKeys.all })
    void client.invalidateQueries({ queryKey: ['listings'] })
    void client.invalidateQueries({ queryKey: ['listing-drafts'] })
  }

  function settle(): void {
    if (options.inSession) {
      void client.invalidateQueries({ queryKey: decisionKeys.overview })
      return
    }
    refreshAll()
  }

  const decide = useMutation({
    mutationFn: (input: DecisionInput) => api.decisions.decide(input),
    onSuccess: settle,
  })
  const respond = useMutation({
    mutationFn: ({ id, input }: { id: string; input: DecisionRespond }) =>
      api.decisions.respond(id, input),
    onSuccess: settle,
  })
  const resolve = useMutation({
    mutationFn: ({ id, input }: { id: string; input: DecisionSettle }) =>
      api.decisions.settle(id, input),
    onSuccess: settle,
  })
  const decideNow = useMutation({
    mutationFn: (id: string) => api.decisions.decideNow(id),
    onSuccess: settle,
  })
  const withdraw = useMutation({
    mutationFn: (id: string) => api.decisions.withdraw(id),
    onSuccess: settle,
  })
  const undo = useMutation({
    mutationFn: (id: string) => api.decisions.undo(id),
    onSuccess: settle,
  })
  const finishSession = useMutation({
    mutationFn: (sessionId: string) => api.decisions.finishSession(sessionId),
    onSuccess: refreshAll,
  })
  const decideSessionNow = useMutation({
    mutationFn: (sessionId: string) =>
      api.decisions.decideSessionNow(sessionId),
    onSuccess: refreshAll,
  })
  return {
    decide,
    respond,
    resolve,
    decideNow,
    withdraw,
    undo,
    finishSession,
    decideSessionNow,
    refreshAll,
  }
}

/** Lot 21 : le réglage d'espace « Décider à plusieurs ». */
export function useDecisionSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (decideTogether: boolean) =>
      api.decisions.updateSettings({ decideTogether }),
    onSuccess: me => {
      client.setQueryData(workspaceKey, me)
      void client.invalidateQueries({ queryKey: decisionKeys.all })
    },
  })
}
