<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { AGENCY_CHANNEL_LABELS } from '@apart/contracts'
  import type {
    AgencyAnswerValueKey,
    ListingContactInputRaw,
    Member,
    OpenQuestionState,
  } from '@apart/contracts'
  import {
    useAgencySettings,
    useListingExchanges,
  } from '@/composables/useAgencyRequests'
  import { ApiError } from '@/lib/api'
  import { formatShortParisDay } from '@apart/domain'
  import ContactCard from './ContactCard.vue'
  import DraftsBatch from './DraftsBatch.vue'
  import RequestsTimeline from './RequestsTimeline.vue'

  /**
   * Lot 17 : l'onglet « Échanges » de la fiche. Les questions ouvertes à
   * poser à l'annonceur, les messages à valider (texte modifiable, « Valider
   * l'envoi » par lot), les messages validés en attente d'envoi, le contact,
   * la chronologie des demandes et la signature. L'application n'envoie
   * rien : Claude envoie les messages validés avec les outils de
   * l'utilisateur (Gmail, messagerie du portail) et note l'envoi.
   */
  const props = defineProps<{ listingId: string; members: Member[] }>()

  const exchanges = useListingExchanges(computed(() => props.listingId))
  const settings = useAgencySettings()
  const view = computed(() => exchanges.data.value ?? null)

  const failure = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const contactCard = ref<InstanceType<typeof ContactCard> | null>(null)
  const editingSignature = ref(false)
  const signature = ref('')

  const drafts = computed(
    () => view.value?.requests.filter(r => r.status === 'draft') ?? []
  )
  const toSend = computed(
    () => view.value?.requests.filter(r => r.status === 'approved') ?? []
  )
  const history = computed(
    () =>
      view.value?.requests.filter(
        r => r.status !== 'draft' && r.status !== 'approved'
      ) ?? []
  )
  const toAsk = computed(
    () => view.value?.openQuestions.filter(q => q.state === 'open') ?? []
  )
  const inProgress = computed(
    () => view.value?.openQuestions.filter(q => q.state !== 'open') ?? []
  )

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
      exchanges.clearContact.isPending.value
  )

  const STATE_LABELS: Record<OpenQuestionState, string> = {
    open: 'à poser',
    draft: 'message à valider',
    approved: 'validée, à envoyer',
    requested: 'demandée',
  }

  function report(error: unknown): void {
    notice.value = null
    failure.value =
      error instanceof ApiError ? error.message : "L'enregistrement a échoué."
  }

  async function run(action: () => Promise<unknown>, done: string) {
    failure.value = null
    try {
      await action()
      notice.value = done
    } catch (error) {
      report(error)
    }
  }

  const prepare = () =>
    run(
      () => exchanges.draft.mutateAsync({}),
      'Message préparé : relisez-le, puis validez l’envoi.'
    )
  const followUp = (requestId: string) =>
    run(
      () => exchanges.draft.mutateAsync({ followUpOf: requestId }),
      'Relance préparée : relisez-la, puis validez l’envoi.'
    )
  const approve = (ids: string[]) =>
    run(
      () => exchanges.approve.mutateAsync(ids),
      ids.length > 1
        ? `${ids.length} messages validés : demandez à Claude de les envoyer (prompt « Questions aux agences »).`
        : 'Message validé : demandez à Claude de l’envoyer (prompt « Questions aux agences »).'
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

  async function saveContact(input: ListingContactInputRaw): Promise<void> {
    try {
      await exchanges.putContact.mutateAsync(input)
      contactCard.value?.done()
      notice.value = 'Contact enregistré.'
      failure.value = null
    } catch (error) {
      contactCard.value?.done(error)
    }
  }
  async function clearContact(): Promise<void> {
    try {
      await exchanges.clearContact.mutateAsync()
      contactCard.value?.done()
      notice.value = 'Contact effacé.'
      failure.value = null
    } catch (error) {
      report(error)
    }
  }

  function editSignature(): void {
    signature.value = settings.data.value?.signature ?? ''
    editingSignature.value = true
  }
  async function saveSignature(reset = false): Promise<void> {
    try {
      await settings.save.mutateAsync(
        reset ? null : signature.value.trim() || null
      )
      editingSignature.value = false
      notice.value = 'Signature enregistrée pour les prochains messages.'
    } catch (error) {
      report(error)
    }
  }

  const buttonClass =
    'inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-9'
</script>

<template>
  <div class="grid gap-5" data-testid="exchanges">
    <p v-if="exchanges.isPending.value" class="text-sm text-muted">
      Chargement des échanges…
    </p>
    <p
      v-else-if="exchanges.error.value"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ exchanges.error.value.message }}
    </p>
    <template v-else-if="view">
      <p
        v-if="failure"
        role="alert"
        class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {{ failure }}
      </p>
      <p v-else-if="notice" class="text-sm text-good" aria-live="polite">
        {{ notice }}
      </p>

      <section
        v-if="drafts.length"
        class="grid gap-3 rounded-xl border-2 border-accent p-4"
        aria-labelledby="drafts-title"
        data-testid="drafts-section"
      >
        <h3 id="drafts-title" class="font-display text-base font-semibold">
          Messages à valider
          <span
            class="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg"
            >{{ drafts.length }}</span
          >
        </h3>
        <DraftsBatch
          :requests="drafts"
          :members="members"
          editable
          :busy="busy"
          @approve="approve"
          @cancel="cancel"
          @save="save"
        />
      </section>

      <section
        class="grid gap-3 rounded-xl border border-line p-4"
        aria-labelledby="questions-title"
        data-testid="open-questions"
      >
        <header class="flex flex-wrap items-start justify-between gap-2">
          <div class="grid gap-0.5">
            <h3
              id="questions-title"
              class="font-display text-base font-semibold"
            >
              Questions à l’annonceur
            </h3>
            <p class="text-xs text-muted">
              Les tâches « Demander … » de l’onglet Suivi. Claude prépare le
              message, vous le validez, Claude l’envoie depuis votre Gmail ou la
              messagerie du portail ; la réponse remplit la fiche et coche les
              tâches.
            </p>
          </div>
          <button
            v-if="toAsk.length"
            type="button"
            class="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-60 sm:min-h-9 sm:w-auto"
            :disabled="busy"
            data-testid="prepare-message"
            @click="prepare"
          >
            Préparer un message ({{ toAsk.length }})
          </button>
        </header>
        <ul
          v-if="view.openQuestions.length"
          class="grid gap-1 text-sm"
          data-testid="open-questions-list"
        >
          <li
            v-for="q in [...toAsk, ...inProgress]"
            :key="q.taskId"
            class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 rounded-lg px-2 py-1 odd:bg-surface-2"
          >
            <span class="min-w-0 break-words">{{ q.label }}</span>
            <span
              class="text-xs"
              :class="
                q.state === 'open' ? 'text-muted' : 'font-medium text-accent'
              "
              :data-state="q.state"
              >{{ STATE_LABELS[q.state]
              }}<template v-if="q.state === 'requested' && q.requestedAt">
                le {{ formatShortParisDay(q.requestedAt) }}</template
              ></span
            >
          </li>
        </ul>
        <p v-else class="text-sm text-muted">
          Aucune question ouverte : toutes les tâches « Demander … » sont
          faites.
        </p>
      </section>

      <section
        v-if="toSend.length"
        class="grid gap-2 rounded-xl border border-line p-4"
        aria-labelledby="to-send-title"
        data-testid="to-send"
      >
        <h3 id="to-send-title" class="font-display text-base font-semibold">
          Validés, en attente d’envoi
        </h3>
        <p class="text-xs text-muted">
          Demandez à Claude de les envoyer (prompt « Questions aux agences »).
          Si vous l’avez envoyé vous-même, notez-le.
        </p>
        <article
          v-for="r in toSend"
          :key="r.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
        >
          <span class="min-w-0 break-words"
            >{{ r.subject }}
            <span class="text-xs text-muted"
              >· {{ AGENCY_CHANNEL_LABELS[r.channel] }}</span
            ></span
          >
          <span class="flex flex-wrap gap-2">
            <button
              type="button"
              :class="buttonClass"
              :disabled="busy"
              data-testid="mark-sent"
              @click="markSent(r.id)"
            >
              Je l’ai envoyé
            </button>
            <button
              type="button"
              :class="buttonClass"
              :disabled="busy"
              @click="cancel(r.id)"
            >
              Annuler
            </button>
          </span>
        </article>
      </section>

      <ContactCard
        ref="contactCard"
        :contact="view.contact"
        :busy="busy"
        @save="saveContact"
        @clear="clearContact"
      />

      <section
        class="grid gap-3 rounded-xl border border-line p-4"
        aria-labelledby="history-title"
      >
        <h3 id="history-title" class="font-display text-base font-semibold">
          Demandes et réponses
        </h3>
        <RequestsTimeline
          v-if="history.length"
          :requests="history"
          :members="members"
          :busy="busy"
          @no-answer="noAnswer"
          @follow-up="followUp"
          @apply="apply"
        />
        <p v-else class="text-sm text-muted" data-testid="history-empty">
          Aucune demande envoyée pour l’instant.
        </p>
      </section>

      <section
        class="flex flex-wrap items-center gap-2 text-xs text-muted"
        aria-label="Signature des messages"
        data-testid="signature"
      >
        <template v-if="!editingSignature">
          <span
            >Signature des messages :
            <strong class="font-medium text-fg">{{ view.signature }}</strong>
            (aucune adresse ni aucun téléphone ajouté)</span
          >
          <button
            type="button"
            class="text-accent underline"
            @click="editSignature"
          >
            Modifier
          </button>
        </template>
        <form
          v-else
          class="flex w-full flex-wrap items-center gap-2"
          @submit.prevent="saveSignature()"
        >
          <input
            v-model="signature"
            maxlength="300"
            class="min-h-11 flex-1 rounded-lg border border-line bg-bg px-3 text-sm text-fg sm:min-h-9"
            aria-label="Signature des messages"
          />
          <button type="submit" :class="buttonClass">Enregistrer</button>
          <button
            v-if="settings.data.value?.custom"
            type="button"
            :class="buttonClass"
            @click="saveSignature(true)"
          >
            Par défaut ({{ settings.data.value?.defaultSignature }})
          </button>
          <button
            type="button"
            :class="buttonClass"
            @click="editingSignature = false"
          >
            Annuler
          </button>
        </form>
      </section>
    </template>
  </div>
</template>
