<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { ListingDraft } from '@apart/contracts'
  import FitBadge from '@/components/listings/FitBadge.vue'
  import {
    draftFitReason,
    draftPlace,
    draftReadLabel,
    draftSourceLabel,
    draftWhen,
    duplicateWhy,
    pendingDuplicate,
  } from '@/lib/drafts'
  import { formatEuros, formatSurface } from '@/lib/format'

  /**
   * Lot 16 : une annonce à valider (reçue par e-mail ou trouvée par Claude
   * sur un portail). Rien n'est ajouté sans le membre : « Ajouter à la
   * liste » (fiche pré-remplie), « Modifier avant d'ajouter » (formulaire),
   * « Écarter » (raison facultative, jamais reproposée, Annuler), « Ouvrir
   * sur le portail » ; un doublon probable se tranche : « C'est la même :
   * mettre à jour la fiche » ou « C'en est une autre ». Lisible sans la
   * couleur, boutons de 44 px.
   */
  const props = withDefaults(
    defineProps<{
      draft: ListingDraft
      busy?: boolean
      error?: string | null
    }>(),
    { busy: false, error: null }
  )
  const emit = defineEmits<{
    accept: []
    edit: []
    dismiss: [reason: string | null]
    undo: []
    same: [listingId: string]
    other: []
  }>()

  const dismissing = ref(false)
  const reason = ref('')

  const d = computed(() => props.draft)
  const duplicate = computed(() => pendingDuplicate(d.value))
  const fitReason = computed(() => draftFitReason(d.value))
  const portalLabel = computed(() => draftSourceLabel(d.value))
  const rooms = computed(() =>
    d.value.listing.rooms === null
      ? 'pièces ?'
      : `${d.value.listing.rooms} pièce${d.value.listing.rooms > 1 ? 's' : ''}`
  )

  function confirmDismiss(): void {
    emit('dismiss', reason.value.trim() || null)
    dismissing.value = false
    reason.value = ''
  }
</script>

<template>
  <article
    class="flex flex-wrap items-start gap-x-6 gap-y-3.5 rounded-2xl border border-line bg-surface p-4 sm:px-5"
    :data-draft="d.id"
    :data-status="d.status"
    data-testid="draft-card"
  >
    <div class="grid min-w-0 flex-[999_1_32rem] gap-2">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h3 class="text-base font-semibold">{{ d.listing.title }}</h3>
        <span
          class="rounded-md border border-line px-1.5 py-px text-xs text-muted"
          data-testid="draft-portal"
          >{{ portalLabel }}</span
        >
        <span class="text-xs text-muted">{{ draftWhen(d) }}</span>
      </div>
      <div
        class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted tabular-nums"
      >
        <strong class="text-fg">{{
          d.listing.price ? formatEuros(d.listing.price) : 'prix ?'
        }}</strong>
        <span>{{ formatSurface(d.listing.surface) }}</span>
        <span>{{ rooms }}</span>
        <span>DPE {{ d.listing.dpeClass ?? '?' }}</span>
        <span>{{ draftPlace(d) }}</span>
      </div>
      <div
        v-if="d.fit && d.fit.activeCriteria > 0"
        class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5"
      >
        <FitBadge :level="d.fit.level" />
        <span
          v-if="fitReason"
          class="text-sm text-muted"
          data-testid="draft-fit-reason"
          >{{ fitReason }}</span
        >
      </div>
      <div
        v-if="duplicate"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-warn-soft px-3 py-2.5"
        data-testid="draft-duplicate"
      >
        <span class="min-w-0 flex-[1_1_20rem] text-sm leading-normal text-warn">
          Peut-être
          <RouterLink
            :to="{ name: 'listing', params: { id: duplicate.listingId } }"
            class="font-semibold underline underline-offset-2"
            >{{ duplicate.title }}</RouterLink
          >, déjà suivie : {{ duplicateWhy(duplicate) }}
        </span>
        <button
          type="button"
          class="min-h-10 rounded-lg border border-warn bg-surface px-3 text-sm font-semibold text-warn disabled:opacity-60"
          :disabled="busy"
          data-action="same"
          @click="emit('same', duplicate.listingId)"
        >
          C’est la même : mettre à jour la fiche
        </button>
        <button
          type="button"
          class="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm disabled:opacity-60"
          :disabled="busy"
          data-action="other"
          @click="emit('other')"
        >
          C’en est une autre
        </button>
      </div>
      <ul
        v-if="d.status === 'pending' && d.warnings.length"
        class="flex flex-wrap gap-x-3 text-xs text-muted"
      >
        <li v-for="warning in d.warnings" :key="warning">{{ warning }}</li>
      </ul>
      <details
        v-if="d.excerpt || d.emailSubject"
        class="text-sm text-muted"
        data-testid="draft-excerpt"
      >
        <summary class="min-h-7 cursor-pointer text-accent">
          {{ draftReadLabel(d) }}
        </summary>
        <p class="mt-1.5 max-w-prose leading-normal">
          {{ d.excerpt ?? `« ${d.emailSubject} »` }}
        </p>
      </details>
      <p v-if="error" role="alert" class="text-sm text-bad">{{ error }}</p>
    </div>

    <div class="grid flex-[1_1_14rem] gap-2" data-testid="draft-actions">
      <template v-if="d.status === 'pending' && !dismissing">
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-1">
          <button
            type="button"
            class="order-2 min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-60 sm:order-1"
            :disabled="busy"
            data-action="accept"
            @click="emit('accept')"
          >
            Ajouter à la liste
          </button>
          <button
            type="button"
            class="order-1 min-h-11 rounded-xl border border-line bg-surface px-4 text-sm disabled:opacity-60 sm:order-2"
            :disabled="busy"
            data-action="dismiss"
            @click="dismissing = true"
          >
            Écarter
          </button>
        </div>
        <div class="grid grid-cols-2 gap-x-2 sm:grid-cols-1">
          <button
            type="button"
            class="min-h-11 text-sm text-accent underline-offset-2 hover:underline sm:min-h-9"
            data-action="edit"
            @click="emit('edit')"
          >
            Modifier avant d’ajouter
          </button>
          <a
            v-if="d.url"
            :href="d.url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-11 items-center justify-center text-sm text-accent underline-offset-2 hover:underline sm:min-h-9"
            data-action="open"
            >{{
              d.portal ? `Ouvrir sur ${portalLabel}` : 'Ouvrir l’annonce'
            }}</a
          >
        </div>
      </template>
      <form
        v-else-if="d.status === 'pending'"
        class="grid gap-2"
        data-testid="dismiss-form"
        @submit.prevent="confirmDismiss"
      >
        <label class="grid gap-1 text-sm">
          Pourquoi l’écarter ?
          <span class="text-xs text-muted">(facultatif)</span>
          <input
            v-model="reason"
            type="text"
            maxlength="500"
            class="min-h-11 rounded-lg border border-line bg-bg px-3"
            placeholder="rez-de-chaussée sur rue"
          />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="min-h-11 rounded-xl border border-line px-3 text-sm"
            @click="dismissing = false"
          >
            Annuler
          </button>
          <button
            type="submit"
            class="min-h-11 rounded-xl bg-fg px-3 text-sm font-semibold text-bg disabled:opacity-60"
            :disabled="busy"
            data-action="confirm-dismiss"
          >
            Écarter
          </button>
        </div>
      </form>
      <p
        v-else-if="d.status === 'accepted'"
        class="rounded-xl bg-accent-soft p-3 text-sm font-semibold text-accent"
        data-testid="draft-added"
      >
        {{
          d.fit && d.fit.activeCriteria > 0 && d.fit.level !== 'out'
            ? 'Ajoutée à « Dans les critères ».'
            : 'Ajoutée à la liste.'
        }}
        <RouterLink
          v-if="d.listingId"
          :to="{ name: 'listing', params: { id: d.listingId } }"
          class="underline underline-offset-2"
          >Ouvrir la fiche</RouterLink
        >
      </p>
      <p
        v-else-if="d.status === 'dismissed'"
        class="rounded-xl bg-surface-2 p-3 text-sm leading-normal"
        data-testid="draft-dismissed"
      >
        Écartée : Claude ne la proposera plus<template v-if="d.dismissReason">
          (« {{ d.dismissReason }} »)</template
        >.
        <button
          type="button"
          class="text-accent underline underline-offset-2"
          data-action="undo"
          @click="emit('undo')"
        >
          Annuler
        </button>
      </p>
      <p
        v-else-if="d.status === 'merged'"
        class="rounded-xl bg-accent-soft p-3 text-sm leading-normal text-accent"
        data-testid="draft-merged"
      >
        <strong>Fiche mise à jour</strong> :
        {{ d.merge?.summary ?? 'faits appliqués' }}, noté dans « Mises à jour ».
        <RouterLink
          v-if="d.listingId"
          :to="{
            name: 'listing',
            params: { id: d.listingId },
            query: { onglet: 'suivi' },
          }"
          class="underline underline-offset-2"
          >Voir la fiche</RouterLink
        >
      </p>
    </div>
  </article>
</template>
