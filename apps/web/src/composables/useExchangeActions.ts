import { computed, ref, unref } from 'vue'
import type { MaybeRef } from 'vue'
import type {
  AgencyAnswerValueKey,
  ListingContactInputRaw,
} from '@apart/contracts'
import { errorMessage } from '@/lib/errors'
import { useFeedbackStore } from '@/stores/feedback'
import { useAgencySettings, useListingExchanges } from './useAgencyRequests'

/**
 * Lot 19 : les actions des échanges avec l'annonceur (lot 17), sorties de
 * l'ancien onglet « Échanges » pour servir l'onglet « À faire » : préparer
 * un message ou une relance, valider (seul ou par lot), corriger le texte,
 * annuler, noter un envoi fait à la main, « pas de réponse », appliquer une
 * valeur proposée, contact et signature. Lot 22 : une réussite part dans la
 * zone de messages commune ; l'erreur de l'API reste dans `failure`, que le
 * bloc où l'on a cliqué affiche. L'application n'envoie rien :
 * Claude envoie ce qu'un membre a validé, avec les outils de l'utilisateur.
 */
export function useExchangeActions(listingId: MaybeRef<string>) {
  const exchanges = useListingExchanges(computed(() => unref(listingId)))
  const settings = useAgencySettings()
  const view = computed(() => exchanges.data.value ?? null)
  const feedback = useFeedbackStore()
  const failure = ref<string | null>(null)

  const busy = computed(
    () =>
      exchanges.draft.isPending.value ||
      exchanges.approve.isPending.value ||
      exchanges.update.isPending.value ||
      exchanges.cancel.isPending.value ||
      exchanges.sent.isPending.value ||
      exchanges.noAnswer.isPending.value ||
      exchanges.apply.isPending.value ||
      exchanges.putContact.isPending.value ||
      exchanges.clearContact.isPending.value ||
      settings.save.isPending.value
  )

  /** Lance une écriture : le message en cas de succès, l'erreur sinon. */
  async function run(
    action: () => Promise<unknown>,
    done: string
  ): Promise<boolean> {
    failure.value = null
    try {
      await action()
      feedback.success(done)
      return true
    } catch (error) {
      failure.value = errorMessage(error, 'L’enregistrement a échoué.')
      return false
    }
  }

  const prepare = () =>
    run(
      () => exchanges.draft.mutateAsync({}),
      'Message préparé : relis-le, puis valide-le.'
    )
  const followUp = (requestId: string) =>
    run(
      () => exchanges.draft.mutateAsync({ followUpOf: requestId }),
      'Relance préparée : relis-la, puis valide-la.'
    )
  const approve = (ids: string[]) =>
    run(
      () => exchanges.approve.mutateAsync(ids),
      ids.length > 1
        ? `${ids.length} messages validés : demande à Claude de les envoyer (prompt « Questions aux agences »).`
        : 'Message validé : demande à Claude de l’envoyer (prompt « Questions aux agences »).'
    )
  const cancel = (requestId: string) =>
    run(() => exchanges.cancel.mutateAsync(requestId), 'Message annulé.')
  const save = (requestId: string, update: { subject: string; body: string }) =>
    run(
      () => exchanges.update.mutateAsync({ requestId, update }),
      'Texte enregistré.'
    )
  const markSent = (requestId: string) =>
    run(
      () => exchanges.sent.mutateAsync({ requestId }),
      'Envoi noté : les questions passent « demandées ».'
    )
  const noAnswer = (requestId: string) =>
    run(
      () => exchanges.noAnswer.mutateAsync(requestId),
      'Demande close sans réponse : ses questions peuvent se reposer.'
    )
  const apply = (requestId: string, keys: AgencyAnswerValueKey[]) =>
    run(
      () =>
        exchanges.apply.mutateAsync({
          requestId,
          input: {
            keys,
            expectedUpdatedAt: view.value?.expectedUpdatedAt ?? '',
          },
        }),
      'Valeur de l’annonceur appliquée à la fiche.'
    )

  /** Le contact : l'erreur est rendue (la carte l'affiche dans son formulaire). */
  async function saveContact(
    input: ListingContactInputRaw
  ): Promise<unknown | null> {
    try {
      await exchanges.putContact.mutateAsync(input)
      feedback.success('Contact enregistré.')
      failure.value = null
      return null
    } catch (error) {
      return error
    }
  }
  const clearContact = () =>
    run(() => exchanges.clearContact.mutateAsync(), 'Contact effacé.')
  /** La signature des messages de l'espace ; null revient à celle par défaut. */
  const saveSignature = (signature: string | null) =>
    run(
      () => settings.save.mutateAsync(signature),
      'Signature enregistrée pour les prochains messages.'
    )

  return {
    exchanges,
    settings,
    view,
    failure,
    busy,
    prepare,
    followUp,
    approve,
    cancel,
    save,
    markSent,
    noAnswer,
    apply,
    saveContact,
    clearContact,
    saveSignature,
  }
}

export type ExchangeActions = ReturnType<typeof useExchangeActions>
