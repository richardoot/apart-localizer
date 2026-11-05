import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  AgencyApplyProposed,
  AgencyRequestDraftInput,
  AgencyRequestSent,
  AgencyRequestUpdate,
  EvaluatedListing,
  ListingContactInputRaw,
} from '@apart/contracts'
import { api } from '@/lib/api'
import { listingKeys } from './useListings'

export const agencyKeys = {
  all: ['agency'] as const,
  exchanges: (listingId: string) => ['listings', 'agency', listingId] as const,
  pending: ['agency', 'pending'] as const,
  settings: ['agency', 'settings'] as const,
}

/**
 * Lot 17 : les échanges avec l'annonceur d'une annonce (onglet « Échanges »)
 * et leurs écritures : contact, brouillons, validation par lot, annulation,
 * envoi noté par un membre, « pas de réponse », valeur proposée appliquée.
 * Le serveur n'envoie jamais de message : Claude envoie ce qu'un membre a
 * validé, avec les outils de l'utilisateur.
 */
export function useListingExchanges(listingId: MaybeRef<string | null>) {
  const client = useQueryClient()
  const id = () => unref(listingId) ?? ''
  const query = useQuery({
    queryKey: computed(() => agencyKeys.exchanges(id())),
    queryFn: () => api.agency.exchanges(id()),
    enabled: computed(() => Boolean(unref(listingId))),
  })

  /** Après une écriture : les échanges, la Synthèse, la fiche (tâches) et son journal. */
  function refresh(listing?: EvaluatedListing): void {
    void client.invalidateQueries({ queryKey: agencyKeys.exchanges(id()) })
    void client.invalidateQueries({ queryKey: agencyKeys.pending })
    void client.invalidateQueries({
      queryKey: ['listings', 'activity', id()],
    })
    if (listing) {
      client.setQueryData(listingKeys.detail(listing.listing.id), {
        ...listing,
        criteriaChanges: null,
      })
      void client.invalidateQueries({ queryKey: ['listings', 'list'] })
      void client.invalidateQueries({
        queryKey: listingKeys.targetPrice(listing.listing.id),
      })
    } else {
      void client.invalidateQueries({ queryKey: listingKeys.detail(id()) })
    }
  }

  const putContact = useMutation({
    mutationFn: (input: ListingContactInputRaw) =>
      api.agency.putContact(id(), input),
    onSuccess: () => refresh(),
  })
  const clearContact = useMutation({
    mutationFn: () => api.agency.clearContact(id()),
    onSuccess: () => refresh(),
  })
  const draft = useMutation({
    mutationFn: (input: AgencyRequestDraftInput = {}) =>
      api.agency.draft(id(), input),
    onSuccess: () => refresh(),
  })
  const update = useMutation({
    mutationFn: (args: { requestId: string; update: AgencyRequestUpdate }) =>
      api.agency.update(args.requestId, args.update),
    onSuccess: () => refresh(),
  })
  const approve = useMutation({
    mutationFn: (requestIds: string[]) => api.agency.approve(requestIds),
    onSuccess: () => refresh(),
  })
  const cancel = useMutation({
    mutationFn: (requestId: string) => api.agency.cancel(requestId),
    onSuccess: () => refresh(),
  })
  const sent = useMutation({
    mutationFn: (args: { requestId: string; input?: AgencyRequestSent }) =>
      api.agency.sent(args.requestId, args.input),
    onSuccess: () => refresh(),
  })
  const noAnswer = useMutation({
    mutationFn: (requestId: string) => api.agency.noAnswer(requestId),
    onSuccess: () => refresh(),
  })
  const apply = useMutation({
    mutationFn: (args: { requestId: string; input: AgencyApplyProposed }) =>
      api.agency.apply(args.requestId, args.input),
    onSuccess: result => refresh(result.listing),
  })

  return {
    ...query,
    putContact,
    clearContact,
    draft,
    update,
    approve,
    cancel,
    sent,
    noAnswer,
    apply,
  }
}

/** Lot 17 : ce qui attend un membre, toutes annonces confondues (bloc de la Synthèse). */
export function usePendingAgencyRequests() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: agencyKeys.pending,
    queryFn: () => api.agency.pending(),
  })
  const approve = useMutation({
    mutationFn: (requestIds: string[]) => api.agency.approve(requestIds),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: agencyKeys.pending })
      void client.invalidateQueries({ queryKey: ['listings', 'agency'] })
    },
  })
  return { ...query, approve }
}

/** Lot 17 : la signature des messages de l'espace. */
export function useAgencySettings() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: agencyKeys.settings,
    queryFn: () => api.agency.settings(),
  })
  const save = useMutation({
    mutationFn: (signature: string | null) =>
      api.agency.updateSettings(signature),
    onSuccess: settings => {
      client.setQueryData(agencyKeys.settings, settings)
      void client.invalidateQueries({ queryKey: ['listings', 'agency'] })
    },
  })
  return { ...query, save }
}
