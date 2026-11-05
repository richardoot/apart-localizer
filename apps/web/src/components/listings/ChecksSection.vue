<script setup lang="ts">
  import { computed, ref } from 'vue'
  import {
    LISTING_CHECK_DISPOSITION_LABELS,
    LISTING_CHECK_OUTCOME_LABELS,
  } from '@apart/contracts'
  import type {
    ListingCheck,
    ListingCheckOutcome,
    ListingCheckSuggestion,
    ListingStatus,
    Member,
  } from '@apart/contracts'
  import { activityActorName, checkFreshness } from '@apart/domain'
  import { useListingChecks } from '@/composables/useListingChecks'
  import { ApiError } from '@/lib/api'
  import { formatDate } from '@/lib/format'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'

  /**
   * Lot 15 : la section « Mises à jour » de l'onglet Suivi. La chronologie
   * des vérifications de l'annonce sur son portail (par Claude, au MCP, ou
   * par un membre) : date, qui, résultat, changements avant → après,
   * extrait de la page dépliable, annonce rattachée par une republication.
   * Deux constats à la main : « Vue en ligne aujourd'hui » et « Plus en
   * ligne » ; le second propose « Vendu ou retiré », appliqué seulement si
   * le membre le confirme.
   */
  const props = defineProps<{
    listingId: string
    status: ListingStatus
    updatedAt: string
    createdAt: string
    lastCheckedAt: string | null
    lastSeenOnlineAt: string | null
    url: string | null
    members: Member[]
  }>()
  const emit = defineEmits<{ 'set-status': [status: ListingStatus] }>()

  const checks = useListingChecks(computed(() => props.listingId))
  const failure = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const confirmingOffline = ref(false)
  const evidence = ref('')
  const suggestion = ref<ListingCheckSuggestion | null>(null)
  const showAll = ref(false)

  /** Les cinq plus récentes, puis tout sur demande. */
  const SHOWN = 5
  const items = computed(() => checks.data.value ?? [])
  const shown = computed(() =>
    showAll.value ? items.value : items.value.slice(0, SHOWN)
  )

  const freshness = computed(() =>
    checkFreshness(
      {
        status: props.status,
        lastCheckedAt: props.lastCheckedAt,
        createdAt: props.createdAt,
      },
      new Date(),
      undefined,
      items.value[0]?.outcome ?? null
    )
  )

  const names = computed(
    () =>
      new Map(props.members.map(m => [m.id, { displayName: m.displayName }]))
  )
  function who(check: ListingCheck): string {
    return activityActorName(
      { channel: check.channel, actorMemberId: check.authorId },
      names.value
    )
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const OUTCOME_TONES: Record<ListingCheckOutcome, string> = {
    unchanged: 'bg-good-soft text-good',
    changed: 'bg-accent-soft text-accent',
    offline: 'bg-bad-soft text-bad',
    republished: 'bg-warn-soft text-warn',
    inaccessible: 'border border-dashed border-muted text-muted',
  }
  const DISPOSITION_TONES: Record<string, string> = {
    applied: 'text-good',
    proposed: 'text-warn',
    noted: 'text-muted',
  }

  function report(error: unknown): void {
    failure.value =
      error instanceof ApiError ? error.message : "L'enregistrement a échoué."
  }

  async function seenOnline(): Promise<void> {
    failure.value = null
    try {
      await checks.apply.mutateAsync({
        observed: { online: true },
        outcome: 'unchanged',
        expectedUpdatedAt: props.updatedAt,
        ...(props.url ? { checkedUrl: props.url } : {}),
      })
      suggestion.value = null
      notice.value = 'Annonce notée en ligne aujourd’hui.'
    } catch (error) {
      report(error)
    }
  }

  async function markOffline(): Promise<void> {
    failure.value = null
    try {
      const result = await checks.apply.mutateAsync({
        observed: { online: false },
        outcome: 'offline',
        expectedUpdatedAt: props.updatedAt,
        ...(evidence.value.trim() ? { evidence: evidence.value.trim() } : {}),
        ...(props.url ? { checkedUrl: props.url } : {}),
      })
      confirmingOffline.value = false
      evidence.value = ''
      suggestion.value = result.suggestion
      notice.value = 'Annonce notée « plus en ligne ».'
    } catch (error) {
      report(error)
    }
  }

  function applySuggestion(): void {
    if (!suggestion.value) return
    emit('set-status', suggestion.value.status)
    suggestion.value = null
    notice.value = null
  }

  const buttonClass =
    'inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-9'
</script>

<template>
  <section
    class="grid gap-3 rounded-xl border border-line p-4"
    aria-labelledby="checks-title"
    data-testid="checks"
  >
    <header class="flex flex-wrap items-start justify-between gap-2">
      <div class="grid gap-0.5">
        <h3 id="checks-title" class="font-display text-base font-semibold">
          Mises à jour
        </h3>
        <p class="text-xs text-muted" data-testid="checks-freshness">
          <span
            :class="freshness.stale ? 'font-medium text-warn' : ''"
            :title="freshness.title"
            >{{
              freshness.label ??
              (lastCheckedAt ? 'Vérifiée' : 'Jamais revérifiée')
            }}</span
          >
          <template v-if="lastSeenOnlineAt">
            · vue en ligne le {{ formatDate(lastSeenOnlineAt) }}</template
          >
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          :class="buttonClass"
          :disabled="checks.apply.isPending.value"
          data-testid="check-online"
          @click="seenOnline"
        >
          Vue en ligne aujourd’hui
        </button>
        <button
          v-if="!confirmingOffline"
          type="button"
          :class="buttonClass"
          :disabled="checks.apply.isPending.value"
          data-testid="check-offline"
          @click="confirmingOffline = true"
        >
          Plus en ligne
        </button>
      </div>
    </header>

    <p class="text-xs text-muted">
      Claude revérifie les annonces depuis votre navigateur (prompt « Tournée de
      mise à jour ») : les faits lus sur le portail s’appliquent à la fiche, un
      changement de statut n’est jamais appliqué sans votre accord.
    </p>

    <form
      v-if="confirmingOffline"
      class="grid gap-2 rounded-lg border border-line bg-surface-2 p-3"
      data-testid="check-offline-form"
      @submit.prevent="markOffline"
    >
      <p class="text-sm">
        Noter que l’annonce n’est plus en ligne ? Le statut ne change pas encore
        : « {{ LISTING_STATUS_LABELS.sold_or_withdrawn }} » vous sera proposé.
      </p>
      <label class="grid gap-1 text-xs font-medium text-muted">
        Ce que la page affiche (facultatif)
        <input
          v-model="evidence"
          type="text"
          maxlength="500"
          placeholder="« Cette annonce a expiré », page introuvable…"
          class="rounded-lg border border-line bg-bg px-3 py-1.5 text-sm"
          data-testid="check-offline-evidence"
        />
      </label>
      <div class="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          :class="buttonClass"
          @click="confirmingOffline = false"
        >
          Annuler
        </button>
        <button
          type="submit"
          class="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-60 sm:min-h-9"
          :disabled="checks.apply.isPending.value"
          data-testid="check-offline-confirm"
        >
          Noter « plus en ligne »
        </button>
      </div>
    </form>

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
      v-if="suggestion"
      class="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm"
      data-testid="check-suggestion"
    >
      <span
        >{{ suggestion.reason }} Passer l’annonce à «
        {{ LISTING_STATUS_LABELS[suggestion.status] }} » ?</span
      >
      <button
        type="button"
        class="inline-flex min-h-9 items-center rounded-lg bg-accent px-3 text-xs font-medium text-accent-fg"
        data-testid="check-suggestion-apply"
        @click="applySuggestion"
      >
        Passer en « {{ LISTING_STATUS_LABELS[suggestion.status] }} »
      </button>
      <button
        type="button"
        class="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-xs"
        @click="suggestion = null"
      >
        Garder « {{ LISTING_STATUS_LABELS[suggestion.currentStatus] }} »
      </button>
    </div>

    <p v-if="checks.isPending.value" class="text-sm text-muted">
      Chargement des vérifications…
    </p>
    <p
      v-else-if="items.length === 0"
      class="text-sm text-muted"
      data-testid="checks-empty"
    >
      Aucune vérification enregistrée pour l’instant.
    </p>
    <ol v-else class="grid gap-3" data-testid="checks-list">
      <li
        v-for="check in shown"
        :key="check.id"
        class="grid gap-1.5 border-l-2 border-line pl-3"
        :data-outcome="check.outcome"
      >
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span
            class="rounded-full px-2 py-px font-medium"
            :class="OUTCOME_TONES[check.outcome]"
            >{{ LISTING_CHECK_OUTCOME_LABELS[check.outcome] }}</span
          >
          <span class="text-muted"
            ><time :datetime="check.checkedAt">{{ when(check.checkedAt) }}</time
            >, par {{ who(check) }}</span
          >
        </div>
        <ul v-if="check.changes.length" class="grid gap-0.5 text-sm">
          <li
            v-for="(change, i) in check.changes"
            :key="i"
            class="flex flex-wrap items-baseline gap-x-2"
          >
            <span class="break-words">{{ change.text }}</span>
            <span
              class="text-[11px] tracking-wide uppercase"
              :class="DISPOSITION_TONES[change.disposition]"
              >{{ LISTING_CHECK_DISPOSITION_LABELS[change.disposition] }}</span
            >
          </li>
        </ul>
        <p v-else class="text-sm">{{ check.summary }}</p>
        <p v-if="check.linkedListing" class="text-sm">
          <RouterLink
            :to="{
              name: 'listing',
              params: { id: check.linkedListing.id },
              query: { onglet: 'suivi' },
            }"
            class="text-accent underline"
            data-testid="check-linked"
            >{{
              check.outcome === 'republished'
                ? 'Annonce rattachée : '
                : 'Voir : '
            }}« {{ check.linkedListing.title }} »</RouterLink
          >
          <span class="text-xs text-muted">
            ({{ LISTING_STATUS_LABELS[check.linkedListing.status] }})</span
          >
        </p>
        <details v-if="check.evidence" class="text-sm">
          <summary class="cursor-pointer text-xs text-accent">
            Extrait de la page
          </summary>
          <blockquote
            class="mt-1 border-l-2 border-accent-soft pl-2 break-words text-muted"
          >
            {{ check.evidence }}
          </blockquote>
        </details>
        <a
          v-if="check.checkedUrl"
          :href="check.checkedUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="w-fit text-xs break-all text-muted underline hover:text-fg"
          >page consultée</a
        >
      </li>
    </ol>
    <button
      v-if="items.length > SHOWN"
      type="button"
      class="w-fit text-xs text-accent underline"
      data-testid="checks-toggle"
      @click="showAll = !showAll"
    >
      {{
        showAll
          ? 'Voir les plus récentes seulement'
          : `Voir les ${items.length - SHOWN} plus anciennes`
      }}
    </button>
  </section>
</template>
