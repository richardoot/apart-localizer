<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { LISTING_PORTAL_LABELS } from '@apart/contracts'
  import type {
    ListingCheckSuggestion,
    ListingLink,
    ListingStatus,
  } from '@apart/contracts'
  import { checkFreshness, orderLinks } from '@apart/domain'
  import { useListingChecks } from '@/composables/useListingChecks'
  import { ApiError } from '@/lib/api'
  import { formatDate } from '@/lib/format'
  import { LISTING_STATUS_LABELS } from '@/lib/labels'

  /**
   * Lot 19 : « Vérifier sur les portails » (onglet Historique), les constats
   * à la main du lot 15 sortis de l'ancienne section « Mises à jour ». La
   * fraîcheur de la dernière vérification, la tournée de Claude depuis le
   * navigateur de l'utilisateur, le lien vérifié (lot 18, plusieurs
   * portails), « Vue en ligne aujourd'hui » et « Plus en ligne » ; ce
   * dernier propose « Vendu ou retiré », appliqué seulement si le membre le
   * confirme. Aucun appel aux portails : le serveur ne lit aucune page.
   */
  const props = withDefaults(
    defineProps<{
      listingId: string
      status: ListingStatus
      updatedAt: string
      createdAt: string
      lastCheckedAt: string | null
      lastSeenOnlineAt: string | null
      url: string | null
      links?: ListingLink[]
    }>(),
    { links: () => [] }
  )
  const emit = defineEmits<{ 'set-status': [status: ListingStatus] }>()

  const checks = useListingChecks(computed(() => props.listingId))
  const failure = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const confirmingOffline = ref(false)
  const evidence = ref('')
  const suggestion = ref<ListingCheckSuggestion | null>(null)

  const orderedLinks = computed(() => orderLinks(props.links))
  const multiLink = computed(() => props.links.length > 1)
  const chosenLinkId = ref<string | null>(null)
  const chosenLink = computed(
    () =>
      orderedLinks.value.find(l => l.id === chosenLinkId.value) ??
      orderedLinks.value[0] ??
      null
  )
  /** Ce que la vérification désigne : le lien choisi, sinon l'URL de la fiche. */
  const target = computed(() =>
    multiLink.value && chosenLink.value
      ? { linkId: chosenLink.value.id, checkedUrl: chosenLink.value.url }
      : props.url
        ? { checkedUrl: props.url }
        : {}
  )
  const linkOption = (link: ListingLink): string =>
    `${LISTING_PORTAL_LABELS[link.portal]}${link.primary ? ' (lien principal)' : ''}${link.online ? '' : ' (plus en ligne)'}`
  const portalName = computed(
    () => LISTING_PORTAL_LABELS[chosenLink.value?.portal ?? 'autre']
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
      checks.data.value?.[0]?.outcome ?? null
    )
  )

  function report(error: unknown): void {
    notice.value = null
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
        ...target.value,
      })
      suggestion.value = null
      notice.value = multiLink.value
        ? `Lien ${portalName.value} noté en ligne aujourd’hui.`
        : 'Annonce notée en ligne aujourd’hui.'
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
        ...target.value,
      })
      confirmingOffline.value = false
      evidence.value = ''
      suggestion.value = result.suggestion
      notice.value = multiLink.value
        ? `Lien ${portalName.value} noté « plus en ligne ».`
        : 'Annonce notée « plus en ligne ».'
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
    'inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-10'
</script>

<template>
  <section
    class="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:px-5"
    aria-labelledby="check-actions-title"
    data-testid="check-actions"
  >
    <header class="grid gap-0.5">
      <h2 id="check-actions-title" class="text-base font-semibold">
        Vérifier sur les portails
      </h2>
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
    </header>
    <p class="text-sm text-muted">
      Claude revérifie les annonces depuis votre navigateur (prompt « Tournée de
      mise à jour ») : les faits lus sur le portail s’appliquent à la fiche, un
      changement de statut n’est jamais appliqué sans votre accord. Vous pouvez
      aussi noter ce que vous avez constaté :
    </p>

    <label
      v-if="multiLink"
      class="grid gap-1 text-xs font-medium text-muted sm:max-w-sm"
    >
      Lien vérifié
      <select
        :value="chosenLink?.id"
        class="min-h-11 rounded-lg border border-line bg-bg px-3 text-sm text-fg sm:min-h-10"
        data-testid="check-link"
        @change="chosenLinkId = ($event.target as HTMLSelectElement).value"
      >
        <option v-for="link in orderedLinks" :key="link.id" :value="link.id">
          {{ linkOption(link) }}
        </option>
      </select>
    </label>

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

    <form
      v-if="confirmingOffline"
      class="grid gap-2 rounded-xl bg-surface-2 p-3"
      data-testid="check-offline-form"
      @submit.prevent="markOffline"
    >
      <p v-if="multiLink" class="text-sm">
        Noter que le lien {{ portalName }} n’est plus en ligne ? Le statut ne
        change pas : « {{ LISTING_STATUS_LABELS.sold_or_withdrawn }} » ne sera
        proposé que si plus aucun lien n’est en ligne.
      </p>
      <p v-else class="text-sm">
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
          class="min-h-11 rounded-lg border border-line bg-bg px-3 text-sm text-fg"
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
          class="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg disabled:opacity-60 sm:min-h-10"
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
        class="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg sm:min-h-9"
        data-testid="check-suggestion-apply"
        @click="applySuggestion"
      >
        Passer en « {{ LISTING_STATUS_LABELS[suggestion.status] }} »
      </button>
      <button
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm sm:min-h-9"
        @click="suggestion = null"
      >
        Garder « {{ LISTING_STATUS_LABELS[suggestion.currentStatus] }} »
      </button>
    </div>
  </section>
</template>
