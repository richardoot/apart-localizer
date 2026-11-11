<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { LISTING_PORTAL_LABELS } from '@apart/contracts'
  import type {
    ListingCheckSuggestion,
    ListingLink,
    ListingStatus,
  } from '@apart/contracts'
  import { checkFreshness, orderLinks } from '@apart/domain'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { useAction } from '@/composables/useAction'
  import { useListingChecks } from '@/composables/useListingChecks'
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
   * Lot 22 : l'erreur dans ce bloc, la réussite dans la zone de messages.
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
  const action = useAction('L’enregistrement a échoué.')
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
  const linkOptions = computed(() =>
    orderedLinks.value.map(link => ({
      value: link.id,
      label: linkOption(link),
    }))
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

  async function seenOnline(): Promise<void> {
    const done = await action.run(
      () =>
        checks.apply.mutateAsync({
          observed: { online: true },
          outcome: 'unchanged',
          expectedUpdatedAt: props.updatedAt,
          ...target.value,
        }),
      {
        success: multiLink.value
          ? `Lien ${portalName.value} noté en ligne aujourd’hui.`
          : 'Annonce notée en ligne aujourd’hui.',
      }
    )
    if (done) suggestion.value = null
  }

  async function markOffline(): Promise<void> {
    const result = await action.run(
      () =>
        checks.apply.mutateAsync({
          observed: { online: false },
          outcome: 'offline',
          expectedUpdatedAt: props.updatedAt,
          ...(evidence.value.trim() ? { evidence: evidence.value.trim() } : {}),
          ...target.value,
        }),
      {
        success: multiLink.value
          ? `Lien ${portalName.value} noté « plus en ligne ».`
          : 'Annonce notée « plus en ligne ».',
      }
    )
    if (!result) return
    confirmingOffline.value = false
    evidence.value = ''
    suggestion.value = result.suggestion
  }

  function applySuggestion(): void {
    if (!suggestion.value) return
    emit('set-status', suggestion.value.status)
    suggestion.value = null
  }
</script>

<template>
  <UiCard
    class="grid gap-3"
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
      Claude revérifie les annonces depuis ton navigateur (demande « Tournée de
      mise à jour ») : les faits lus sur le portail s’appliquent à la fiche, un
      changement de statut n’est jamais appliqué sans ton accord. Tu peux aussi
      noter ce que tu as constaté :
    </p>

    <UiField
      v-if="multiLink"
      id="check-link"
      :model-value="chosenLink?.id"
      as="select"
      label="Lien vérifié"
      quiet
      class="sm:max-w-sm"
      :options="linkOptions"
      data-testid="check-link"
      @update:model-value="value => (chosenLinkId = String(value))"
    />

    <div class="flex flex-wrap gap-2">
      <UiButton
        :disabled="checks.apply.isPending.value"
        data-testid="check-online"
        @click="seenOnline"
      >
        Vue en ligne aujourd’hui
      </UiButton>
      <UiButton
        v-if="!confirmingOffline"
        :disabled="checks.apply.isPending.value"
        data-testid="check-offline"
        @click="confirmingOffline = true"
      >
        Plus en ligne
      </UiButton>
    </div>

    <form
      v-if="confirmingOffline"
      class="grid gap-2 rounded-xl bg-surface-2 p-3"
      novalidate
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
        : « {{ LISTING_STATUS_LABELS.sold_or_withdrawn }} » te sera proposé.
      </p>
      <UiField
        id="check-offline-evidence"
        v-model="evidence"
        label="Ce que la page affiche (facultatif)"
        quiet
        maxlength="500"
        placeholder="« Cette annonce a expiré », page introuvable…"
        data-testid="check-offline-evidence"
      />
      <div class="flex flex-wrap justify-end gap-2">
        <UiButton @click="confirmingOffline = false">Annuler</UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :loading="checks.apply.isPending.value"
          data-testid="check-offline-confirm"
        >
          Noter « plus en ligne »
        </UiButton>
      </div>
    </form>

    <UiAlert v-if="action.error.value">{{ action.error.value }}</UiAlert>

    <div
      v-if="suggestion"
      class="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm"
      data-testid="check-suggestion"
    >
      <span
        >{{ suggestion.reason }} Passer l’annonce à «
        {{ LISTING_STATUS_LABELS[suggestion.status] }} » ?</span
      >
      <UiButton
        variant="primary"
        size="sm"
        data-testid="check-suggestion-apply"
        @click="applySuggestion"
      >
        Passer en « {{ LISTING_STATUS_LABELS[suggestion.status] }} »
      </UiButton>
      <UiButton size="sm" @click="suggestion = null">
        Garder « {{ LISTING_STATUS_LABELS[suggestion.currentStatus] }} »
      </UiButton>
    </div>
  </UiCard>
</template>
