<script setup lang="ts">
  import { computed, nextTick, ref } from 'vue'
  import type { ListingStatus, Member, Visit } from '@apart/contracts'
  import { VISIT_STATUS_LABELS } from '@apart/contracts'
  import { VISIT_EDIT_REFUSAL, canEditVisit } from '@apart/domain'
  import QueryState from '@/components/ui/QueryState.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiIcon from '@/components/ui/UiIcon.vue'
  import { useAction } from '@/composables/useAction'
  import { useVisits } from '@/composables/useVisits'
  import { plural } from '@/lib/format'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'
  import { buttonClasses, cardClasses } from '@/lib/ui'
  import { useFeedbackStore } from '@/stores/feedback'
  import {
    emptyVisitForm,
    visitEditForm,
    visitEditPayload,
    visitFormToInput,
  } from './visit-form'
  import type { VisitEditForm } from './visit-form'

  /**
   * Les visites d'une annonce (lot 6) : planifier ou noter une visite, la
   * marquer faite, ses photos (privées). Lot 22 : lecture par `QueryState`,
   * l'erreur dans le bloc où l'on a cliqué (formulaire ou carte de la
   * visite), la réussite dans la zone de messages ; une date illisible est
   * refusée au champ.
   */
  const props = defineProps<{
    listingId: string
    members: Member[]
    meId: string | null
  }>()
  const emit = defineEmits<{ 'set-status': [status: ListingStatus] }>()

  const visits = useVisits(computed(() => props.listingId))
  const feedback = useFeedbackStore()
  const form = ref(emptyVisitForm(new Date(), props.meId))
  const adding = ref(false)
  const formAction = useAction('L’enregistrement a échoué.')
  const cardAction = useAction('L’enregistrement a échoué.')
  /** La visite dont la carte montre la dernière erreur. */
  const errorVisit = ref<string | null>(null)
  const dateError = ref<string | null>(null)
  const suggested = ref<ListingStatus | null>(null)

  const nameOf = (id: string | null): string =>
    props.members.find(m => m.id === id)?.displayName ?? 'Un membre'
  // Une nouvelle visite ne compte que des membres actifs (pas les anciens).
  const activeMembers = computed(() =>
    props.members.filter(m => m.status === 'active')
  )
  const list = computed(() => visits.data.value ?? [])

  async function submit(): Promise<void> {
    const input = visitFormToInput(form.value)
    if (!input) {
      dateError.value = 'Date de visite illisible : choisis le jour et l’heure.'
      await nextTick()
      document.getElementById('visit-date')?.focus()
      return
    }
    dateError.value = null
    const result = await formAction.run(
      () => visits.create.mutateAsync(input),
      {
        success: done =>
          done.createdTask
            ? 'Visite planifiée ; la tâche « Préparer la visite » est dans la liste.'
            : 'Visite enregistrée.',
      }
    )
    if (!result) return
    suggested.value = result.suggestedStatus
    form.value = emptyVisitForm(new Date(), props.meId)
    adding.value = false
  }

  async function onVisit<T>(visitId: string, action: () => Promise<T>) {
    errorVisit.value = visitId
    return cardAction.run(action)
  }

  /**
   * Lot 24 : une visite enregistrée se corrige (compte rendu, points forts et
   * faibles, note, participants, date) par son auteur ou un participant
   * (`canEditVisit` de `domain`, la même règle que le serveur) ; « Marquer
   * faite » ouvre la même saisie et porte le compte rendu.
   */
  const editing = ref<{ visitId: string; markDone: boolean } | null>(null)
  const editForm = ref<VisitEditForm | null>(null)
  const editDateError = ref<string | null>(null)
  const canEdit = (visit: Visit): boolean =>
    props.meId !== null && canEditVisit(visit, props.meId)

  function startEdit(visit: Visit, markDone = false): void {
    editing.value = { visitId: visit.id, markDone }
    editForm.value = visitEditForm(visit)
    editDateError.value = null
    cardAction.clear()
    void nextTick(() =>
      document.getElementById(`visit-edit-report-${visit.id}`)?.focus()
    )
  }
  function stopEdit(): void {
    editing.value = null
    editForm.value = null
  }

  async function saveEdit(visit: Visit): Promise<void> {
    if (!editForm.value || !editing.value) return
    const payload = visitEditPayload(
      editForm.value,
      visit,
      editing.value.markDone
    )
    if (!payload) {
      editDateError.value =
        'Date de visite illisible : choisis le jour et l’heure.'
      return
    }
    editDateError.value = null
    if (!payload.changed) {
      stopEdit()
      return
    }
    const result = await onVisit(visit.id, () =>
      visits.update.mutateAsync({ visitId: visit.id, update: payload.update })
    )
    if (!result) return
    suggested.value = result.suggestedStatus
    feedback.success(
      editing.value.markDone ? 'Visite marquée faite.' : 'Visite corrigée.'
    )
    stopEdit()
  }

  /**
   * Lot 19 : une suppression se confirme dans la carte de la visite, jamais
   * par `window.confirm`.
   */
  const confirmingPhoto = ref<{ visitId: string; photoId: string } | null>(null)

  async function removeVisit(visit: Visit): Promise<void> {
    await onVisit(visit.id, () => visits.remove.mutateAsync(visit.id))
    if (!cardAction.error.value) feedback.success('Visite supprimée.')
  }

  async function removePhoto(visitId: string, photoId: string): Promise<void> {
    confirmingPhoto.value = null
    await onVisit(visitId, () =>
      visits.removePhoto.mutateAsync({ visitId, photoId })
    )
    if (!cardAction.error.value) feedback.success('Photo supprimée.')
  }

  async function onFiles(visitId: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const files = [...(input.files ?? [])]
    input.value = ''
    if (files.length === 0) return
    const sent = await visits.uploadPhotos(visitId, files)
    feedback.success(`${plural(sent, 'photo envoyée', 'photos envoyées')}.`)
  }

  function applySuggested(): void {
    if (!suggested.value) return
    emit('set-status', suggested.value)
    suggested.value = null
  }

  const STATUS_OPTIONS = [
    { value: 'done', label: 'Faite' },
    { value: 'planned', label: 'Planifiée' },
  ]
  const RATING_OPTIONS = [
    { value: 0, label: 'Sans note' },
    ...[1, 2, 3, 4, 5].map(n => ({ value: n, label: `${n}/5` })),
  ]
  const fileButton = buttonClasses({ size: 'sm' })
  const when = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
</script>

<template>
  <section class="grid gap-4" aria-labelledby="visits-title">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="visits-title" class="font-display text-base font-bold">
        Visites
      </h3>
      <UiButton
        v-if="!adding"
        variant="primary"
        size="sm"
        icon="plus"
        data-testid="visit-add"
        @click="adding = true"
      >
        Visite
      </UiButton>
    </header>

    <div
      v-if="suggested"
      class="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm"
      data-testid="visit-suggested-status"
    >
      Passer l’annonce à « {{ LISTING_STATUS_LABELS[suggested] }} » ?
      <UiButton variant="primary" size="sm" @click="applySuggested">
        Oui
      </UiButton>
      <UiButton size="sm" @click="suggested = null">Non</UiButton>
    </div>

    <form
      v-if="adding"
      class="grid gap-3"
      :class="cardClasses('default', 'sm')"
      data-testid="visit-form"
      novalidate
      @submit.prevent="submit"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <UiField
          id="visit-date"
          v-model="form.visitedAt"
          label="Date et heure"
          quiet
          type="datetime-local"
          align="left"
          :error="dateError"
          required
        />
        <UiField
          id="visit-status"
          v-model="form.status"
          as="select"
          label="État"
          quiet
          :options="STATUS_OPTIONS"
        />
      </div>
      <fieldset class="flex flex-wrap gap-x-4 text-sm">
        <legend class="mb-1 text-sm font-medium">Participants</legend>
        <UiCheckbox
          v-for="member in activeMembers"
          :key="member.id"
          v-model="form.participantIds"
          :value="member.id"
          :label="member.displayName"
        />
      </fieldset>
      <UiCheckbox
        v-if="form.status === 'planned'"
        v-model="form.createPrepTask"
        label="Ajouter la tâche « Préparer la visite »"
      />
      <template v-else>
        <UiField
          id="visit-rating"
          v-model="form.rating"
          as="select"
          label="Note"
          quiet
          :options="RATING_OPTIONS"
        />
        <UiField
          id="visit-report"
          v-model="form.report"
          as="textarea"
          label="Compte rendu"
          quiet
          :rows="3"
        />
        <div class="grid gap-3 sm:grid-cols-2">
          <UiField
            id="visit-pros"
            v-model="form.pros"
            as="textarea"
            label="Points positifs"
            quiet
            :rows="2"
          />
          <UiField
            id="visit-cons"
            v-model="form.cons"
            as="textarea"
            label="Points négatifs"
            quiet
            :rows="2"
          />
        </div>
      </template>
      <UiAlert v-if="formAction.error.value">{{
        formAction.error.value
      }}</UiAlert>
      <div class="flex justify-end gap-2">
        <UiButton @click="adding = false">Annuler</UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :loading="visits.create.isPending.value"
          loading-label="Enregistrement…"
        >
          Enregistrer la visite
        </UiButton>
      </div>
    </form>

    <QueryState
      :query="visits"
      :empty="list.length === 0 && !adding"
      empty-text="Aucune visite pour l’instant : « Visite » en planifie une ou note celle que tu viens de faire."
      skeleton="rows"
      :skeleton-count="1"
      loading-label="les visites"
    >
      <ul class="grid gap-3">
        <li
          v-for="visit in list"
          :id="`visit-${visit.id}`"
          :key="visit.id"
          tabindex="-1"
          class="grid scroll-mt-16 gap-2 focus-visible:outline-2 focus-visible:outline-accent"
          :class="cardClasses('default', 'sm')"
          data-testid="visit"
        >
          <div class="flex flex-wrap items-baseline gap-2">
            <UiBadge :tone="visit.status === 'planned' ? 'accent' : 'good'">{{
              VISIT_STATUS_LABELS[visit.status]
            }}</UiBadge>
            <strong class="text-sm">{{ when(visit.visitedAt) }}</strong>
            <span v-if="visit.rating" class="text-sm"
              >{{ visit.rating }}/5</span
            >
            <span v-if="visit.participantIds.length" class="text-sm text-muted">
              avec {{ visit.participantIds.map(nameOf).join(', ') }}
            </span>
          </div>
          <form
            v-if="editing?.visitId === visit.id && editForm"
            class="grid gap-3"
            novalidate
            data-testid="visit-edit-form"
            @submit.prevent="saveEdit(visit)"
          >
            <UiField
              :id="`visit-edit-date-${visit.id}`"
              v-model="editForm.visitedAt"
              label="Date et heure"
              quiet
              type="datetime-local"
              align="left"
              :error="editDateError"
            />
            <fieldset class="flex flex-wrap gap-x-4 text-sm">
              <legend class="mb-1 text-sm font-medium">Participants</legend>
              <UiCheckbox
                v-for="member in members.filter(
                  m =>
                    m.status === 'active' || visit.participantIds.includes(m.id)
                )"
                :key="member.id"
                v-model="editForm.participantIds"
                :value="member.id"
                :label="member.displayName"
              />
            </fieldset>
            <UiField
              :id="`visit-edit-rating-${visit.id}`"
              v-model="editForm.rating"
              as="select"
              label="Note"
              quiet
              :options="RATING_OPTIONS"
            />
            <UiField
              :id="`visit-edit-report-${visit.id}`"
              v-model="editForm.report"
              as="textarea"
              label="Compte rendu"
              quiet
              :rows="4"
              data-testid="visit-edit-report"
            />
            <div class="grid gap-3 sm:grid-cols-2">
              <UiField
                :id="`visit-edit-pros-${visit.id}`"
                v-model="editForm.pros"
                as="textarea"
                label="Points positifs"
                quiet
                :rows="2"
              />
              <UiField
                :id="`visit-edit-cons-${visit.id}`"
                v-model="editForm.cons"
                as="textarea"
                label="Points négatifs"
                quiet
                :rows="2"
              />
            </div>
            <div class="flex flex-wrap justify-end gap-2">
              <UiButton @click="stopEdit">Annuler</UiButton>
              <UiButton
                type="submit"
                variant="primary"
                :loading="visits.update.isPending.value"
                loading-label="Enregistrement…"
                data-testid="visit-edit-save"
              >
                {{
                  editing.markDone
                    ? 'Enregistrer comme faite'
                    : 'Enregistrer la visite'
                }}
              </UiButton>
            </div>
          </form>
          <template v-else>
            <p v-if="visit.report" class="text-sm whitespace-pre-line">
              {{ visit.report }}
            </p>
            <p v-if="visit.pros" class="text-sm text-good">
              + {{ visit.pros }}
            </p>
            <p v-if="visit.cons" class="text-sm text-bad">− {{ visit.cons }}</p>
          </template>
          <ul
            v-if="visit.photos.length"
            class="grid grid-cols-3 gap-2 sm:grid-cols-4"
          >
            <li v-for="photo in visit.photos" :key="photo.id" class="relative">
              <a
                v-if="photo.url"
                :href="photo.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  :src="photo.thumbnailUrl ?? photo.url"
                  :alt="photo.caption ?? 'Photo de visite'"
                  class="aspect-square w-full rounded-lg object-cover"
                  loading="lazy"
                />
              </a>
              <span
                v-else
                class="grid aspect-square place-items-center rounded-lg bg-surface-2 text-xs text-muted"
                >indisponible</span
              >
              <UiButton
                v-if="photo.uploadedById === meId"
                size="icon"
                class="absolute top-1 right-1 rounded-full shadow"
                aria-label="Supprimer la photo"
                @click="
                  confirmingPhoto = { visitId: visit.id, photoId: photo.id }
                "
              >
                <UiIcon name="close" />
              </UiButton>
            </li>
          </ul>
          <div
            v-if="confirmingPhoto?.visitId === visit.id"
            class="flex flex-wrap items-center gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm"
            role="group"
            aria-label="Supprimer cette photo ?"
            data-testid="photo-remove-confirm"
          >
            <span class="flex-1">Supprimer cette photo ?</span>
            <UiButton size="sm" @click="confirmingPhoto = null"
              >Garder</UiButton
            >
            <UiButton
              variant="danger"
              size="sm"
              data-testid="photo-remove-yes"
              @click="removePhoto(visit.id, confirmingPhoto.photoId)"
            >
              Supprimer la photo
            </UiButton>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <label :class="fileButton" class="cursor-pointer">
              Ajouter des photos
              <!-- Lot 22 : le sélecteur de fichiers du système, caché derrière le bouton. -->
              <input
                type="file"
                accept="image/*"
                multiple
                class="sr-only"
                :data-testid="`visit-photos-${visit.id}`"
                @change="onFiles(visit.id, $event)"
              />
            </label>
            <UiButton
              v-if="visit.status === 'planned' && editing?.visitId !== visit.id"
              size="sm"
              data-testid="visit-mark-done"
              @click="startEdit(visit, true)"
            >
              Marquer faite
            </UiButton>
            <UiButton
              v-if="
                visit.status === 'done' &&
                canEdit(visit) &&
                editing?.visitId !== visit.id
              "
              size="sm"
              icon="edit"
              data-testid="visit-edit"
              @click="startEdit(visit)"
            >
              Modifier
            </UiButton>
            <UiButton
              size="sm"
              icon="camera"
              :to="{
                name: 'visit-mode',
                params: { id: listingId },
                query: { visite: visit.id },
              }"
              data-testid="visit-mode-link"
            >
              Mode visite
            </UiButton>
            <span
              v-if="visit.status === 'done' && !canEdit(visit)"
              class="text-sm text-muted"
              data-testid="visit-edit-refused"
              >{{ VISIT_EDIT_REFUSAL }}</span
            >
            <span
              v-if="visit.createdById === meId"
              class="ml-auto inline-flex flex-wrap items-center gap-2"
              data-testid="visit-remove-confirm"
            >
              <UiConfirm
                label="Supprimer la visite"
                question="Supprimer cette visite et tes photos ?"
                cancel-label="Garder"
                variant="ghost"
                :busy="visits.remove.isPending.value"
                :confirm-attrs="{ 'data-testid': 'visit-remove-yes' }"
                data-testid="visit-remove"
                @confirm="removeVisit(visit)"
              />
            </span>
          </div>
          <UiAlert v-if="errorVisit === visit.id && cardAction.error.value">{{
            cardAction.error.value
          }}</UiAlert>
        </li>
      </ul>
    </QueryState>

    <ul v-if="visits.uploads.value.length" class="grid gap-1 text-sm">
      <li
        v-for="(upload, index) in visits.uploads.value"
        :key="index"
        :class="upload.step === 'failed' ? 'text-bad' : 'text-muted'"
      >
        {{ upload.name }} :
        {{
          upload.step === 'preparing'
            ? 'réduction…'
            : upload.step === 'uploading'
              ? 'envoi…'
              : upload.step === 'done'
                ? 'envoyée'
                : upload.error
        }}
      </li>
    </ul>
    <p class="text-xs text-muted">
      Les photos sont réduites sur l’appareil (métadonnées et position GPS
      retirées), rangées dans un stockage privé et ne s’ouvrent que par des
      liens temporaires ; seul le membre qui les a ajoutées peut les supprimer.
    </p>
  </section>
</template>
