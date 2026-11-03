<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { ListingStatus, Member, Visit } from '@apart/contracts'
  import { VISIT_STATUS_LABELS } from '@apart/contracts'
  import { useVisits } from '@/composables/useVisits'
  import { ApiError } from '@/lib/api'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'
  import { emptyVisitForm, visitFormToInput } from './visit-form'

  const props = defineProps<{
    listingId: string
    members: Member[]
    meId: string | null
  }>()
  const emit = defineEmits<{ 'set-status': [status: ListingStatus] }>()

  const visits = useVisits(computed(() => props.listingId))
  const form = ref(emptyVisitForm(new Date(), props.meId))
  const adding = ref(false)
  const failure = ref<string | null>(null)
  const suggested = ref<ListingStatus | null>(null)
  const notice = ref<string | null>(null)

  const nameOf = (id: string | null): string =>
    props.members.find(m => m.id === id)?.displayName ?? 'Un membre'

  function report(error: unknown): void {
    failure.value =
      error instanceof ApiError ? error.message : "L'enregistrement a échoué."
  }

  async function submit(): Promise<void> {
    const input = visitFormToInput(form.value)
    if (!input) {
      failure.value = 'Date de visite illisible.'
      return
    }
    failure.value = null
    try {
      const result = await visits.create.mutateAsync(input)
      suggested.value = result.suggestedStatus
      notice.value = result.createdTask
        ? 'Visite planifiée ; la tâche « Préparer la visite » est dans la checklist.'
        : 'Visite enregistrée.'
      form.value = emptyVisitForm(new Date(), props.meId)
      adding.value = false
    } catch (error) {
      report(error)
    }
  }

  async function markDone(visit: Visit): Promise<void> {
    failure.value = null
    try {
      const result = await visits.update.mutateAsync({
        visitId: visit.id,
        update: { status: 'done', expectedUpdatedAt: visit.updatedAt },
      })
      suggested.value = result.suggestedStatus
    } catch (error) {
      report(error)
    }
  }

  async function removeVisit(visit: Visit): Promise<void> {
    if (!window.confirm('Supprimer cette visite et vos photos ?')) return
    failure.value = null
    try {
      await visits.remove.mutateAsync(visit.id)
    } catch (error) {
      report(error)
    }
  }

  async function removePhoto(visitId: string, photoId: string): Promise<void> {
    if (!window.confirm('Supprimer cette photo ?')) return
    failure.value = null
    try {
      await visits.removePhoto.mutateAsync({ visitId, photoId })
    } catch (error) {
      report(error)
    }
  }

  async function onFiles(visitId: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const files = [...(input.files ?? [])]
    input.value = ''
    if (files.length === 0) return
    const sent = await visits.uploadPhotos(visitId, files)
    notice.value = `${sent} photo(s) envoyée(s).`
  }

  function applySuggested(): void {
    if (!suggested.value) return
    emit('set-status', suggested.value)
    suggested.value = null
  }

  const inputClass =
    'rounded-lg border border-line bg-bg px-3 py-1.5 text-sm w-full'
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
      <h3 id="visits-title" class="font-display text-base font-semibold">
        Visites
      </h3>
      <button
        v-if="!adding"
        type="button"
        class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg"
        data-testid="visit-add"
        @click="adding = true"
      >
        + Visite
      </button>
    </header>

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
    <div
      v-if="suggested"
      class="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm"
      data-testid="visit-suggested-status"
    >
      Passer l'annonce à « {{ LISTING_STATUS_LABELS[suggested] }} » ?
      <button
        type="button"
        class="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg"
        @click="applySuggested"
      >
        Oui
      </button>
      <button
        type="button"
        class="rounded-lg border border-line px-3 py-1 text-xs"
        @click="suggested = null"
      >
        Non
      </button>
    </div>

    <form
      v-if="adding"
      class="grid gap-3 rounded-xl border border-line px-3 py-3"
      data-testid="visit-form"
      @submit.prevent="submit"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="grid gap-1 text-xs font-medium text-muted">
          Date et heure
          <input
            v-model="form.visitedAt"
            type="datetime-local"
            :class="inputClass"
            required
          />
        </label>
        <label class="grid gap-1 text-xs font-medium text-muted">
          État
          <select v-model="form.status" :class="inputClass">
            <option value="done">Faite</option>
            <option value="planned">Planifiée</option>
          </select>
        </label>
      </div>
      <fieldset class="flex flex-wrap gap-3 text-sm">
        <legend class="mb-1 text-xs font-medium text-muted">
          Participants
        </legend>
        <label
          v-for="member in members"
          :key="member.id"
          class="flex items-center gap-1.5"
        >
          <input
            v-model="form.participantIds"
            type="checkbox"
            class="accent-accent"
            :value="member.id"
          />
          {{ member.displayName }}
        </label>
      </fieldset>
      <label
        v-if="form.status === 'planned'"
        class="flex items-center gap-2 text-sm"
      >
        <input
          v-model="form.createPrepTask"
          type="checkbox"
          class="accent-accent"
        />
        Ajouter la tâche « Préparer la visite »
      </label>
      <template v-else>
        <label class="grid gap-1 text-xs font-medium text-muted">
          Note
          <select v-model.number="form.rating" :class="inputClass">
            <option :value="0">Sans note</option>
            <option v-for="n in 5" :key="n" :value="n">{{ n }}/5</option>
          </select>
        </label>
        <label class="grid gap-1 text-xs font-medium text-muted">
          Compte rendu
          <textarea v-model="form.report" rows="3" :class="inputClass" />
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="grid gap-1 text-xs font-medium text-muted">
            Points positifs
            <textarea v-model="form.pros" rows="2" :class="inputClass" />
          </label>
          <label class="grid gap-1 text-xs font-medium text-muted">
            Points négatifs
            <textarea v-model="form.cons" rows="2" :class="inputClass" />
          </label>
        </div>
      </template>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-line px-3 py-1.5 text-sm"
          @click="adding = false"
        >
          Annuler
        </button>
        <button
          type="submit"
          class="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
          :disabled="visits.create.isPending.value"
        >
          Enregistrer la visite
        </button>
      </div>
    </form>

    <p v-if="visits.isPending.value" class="text-sm text-muted">
      Chargement des visites…
    </p>
    <p
      v-else-if="(visits.data.value ?? []).length === 0 && !adding"
      class="text-sm text-muted"
    >
      Aucune visite pour l'instant.
    </p>
    <ul v-else class="grid gap-3">
      <li
        v-for="visit in visits.data.value ?? []"
        :key="visit.id"
        class="grid gap-2 rounded-xl border border-line px-3 py-3"
        data-testid="visit"
      >
        <div class="flex flex-wrap items-baseline gap-2">
          <span
            class="rounded-full px-2 py-0.5 text-xs"
            :class="
              visit.status === 'planned'
                ? 'bg-accent-soft text-fg'
                : 'bg-good-soft text-good'
            "
            >{{ VISIT_STATUS_LABELS[visit.status] }}</span
          >
          <strong class="text-sm">{{ when(visit.visitedAt) }}</strong>
          <span v-if="visit.rating" class="text-sm">{{ visit.rating }}/5</span>
          <span v-if="visit.participantIds.length" class="text-xs text-muted">
            avec {{ visit.participantIds.map(nameOf).join(', ') }}
          </span>
        </div>
        <p v-if="visit.report" class="text-sm whitespace-pre-line">
          {{ visit.report }}
        </p>
        <p v-if="visit.pros" class="text-sm text-good">+ {{ visit.pros }}</p>
        <p v-if="visit.cons" class="text-sm text-bad">− {{ visit.cons }}</p>
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
            <button
              v-if="photo.uploadedById === meId"
              type="button"
              class="absolute top-1 right-1 rounded-full bg-surface px-1.5 text-xs text-muted shadow hover:text-bad"
              aria-label="Supprimer la photo"
              @click="removePhoto(visit.id, photo.id)"
            >
              ✕
            </button>
          </li>
        </ul>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <label
            class="cursor-pointer rounded-lg border border-line px-3 py-1 hover:bg-surface-2"
          >
            Ajouter des photos
            <input
              type="file"
              accept="image/*"
              multiple
              class="sr-only"
              :data-testid="`visit-photos-${visit.id}`"
              @change="onFiles(visit.id, $event)"
            />
          </label>
          <button
            v-if="visit.status === 'planned'"
            type="button"
            class="rounded-lg border border-line px-3 py-1 hover:bg-surface-2"
            @click="markDone(visit)"
          >
            Marquer faite
          </button>
          <button
            v-if="visit.createdById === meId"
            type="button"
            class="ml-auto text-xs text-muted hover:text-bad"
            @click="removeVisit(visit)"
          >
            Supprimer la visite
          </button>
        </div>
      </li>
    </ul>

    <ul v-if="visits.uploads.value.length" class="grid gap-1 text-xs">
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
      Les photos sont réduites sur l'appareil (métadonnées et position GPS
      retirées), rangées dans un stockage privé et ne s'ouvrent que par des
      liens temporaires ; seul le membre qui les a ajoutées peut les supprimer.
    </p>
  </section>
</template>
