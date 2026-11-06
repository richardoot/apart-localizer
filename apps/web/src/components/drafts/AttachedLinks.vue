<script setup lang="ts">
  import { computed, ref } from 'vue'
  import {
    AUTO_ATTACH_REVIEW_DAYS,
    LISTING_PORTAL_LABELS,
  } from '@apart/contracts'
  import type { ListingDraft } from '@apart/contracts'
  import { comparedPriceText, shortDay } from '@apart/domain'
  import { useAttachedDrafts } from '@/composables/useDrafts'
  import { ApiError } from '@/lib/api'

  /**
   * Lot 18 : « Liens rattachés d'office », en tête de l'onglet « À valider ».
   * Une annonce trouvée par Claude (ou reçue par e-mail) avec la même agence
   * et la même référence qu'une annonce suivie est la même, publiée sur un
   * autre portail : son lien a rejoint la fiche, rien d'autre ne change ; un
   * écart de prix est noté dans l’Historique. « Ce n'est pas la même »
   * (après confirmation) retire le lien de la fiche et la remet à valider.
   * Montrés `AUTO_ATTACH_REVIEW_DAYS` jours.
   */
  const attached = useAttachedDrafts()
  /** Les détachements de la session, gardés à leur place. */
  const detached = ref(new Map<string, ListingDraft>())
  const confirming = ref<string | null>(null)
  const errors = ref<Record<string, string>>({})

  const rows = computed(() => {
    const byId = new Map<string, ListingDraft>()
    for (const draft of attached.data.value ?? []) {
      if (draft.attachment) byId.set(draft.id, draft)
    }
    for (const [id, draft] of detached.value) byId.set(id, draft)
    return [...byId.values()].sort(
      (a, b) =>
        Date.parse(b.attachment?.attachedAt ?? b.receivedAt) -
          Date.parse(a.attachment?.attachedAt ?? a.receivedAt) ||
        a.id.localeCompare(b.id)
    )
  })

  function priceText(draft: ListingDraft): string {
    if (!draft.attachment) return ''
    const price = draft.listing.price > 0 ? draft.listing.price : null
    return comparedPriceText(price, draft.attachment.fichePrice)
  }

  async function detach(draft: ListingDraft): Promise<void> {
    const { [draft.id]: _drop, ...rest } = errors.value
    errors.value = rest
    try {
      await attached.detach.mutateAsync(draft.id)
      const next = new Map(detached.value)
      next.set(draft.id, draft)
      detached.value = next
      confirming.value = null
    } catch (error) {
      errors.value = {
        ...errors.value,
        [draft.id]:
          error instanceof ApiError
            ? error.message
            : 'Le détachement a échoué.',
      }
    }
  }
</script>

<template>
  <section
    v-if="rows.length"
    aria-labelledby="attached-title"
    class="grid gap-2.5 rounded-2xl border border-line bg-surface p-4 sm:px-5"
    data-testid="attached-links"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="attached-title" class="text-[15px] font-semibold">
        Liens rattachés d’office : même agence, même référence
      </h2>
      <span class="text-xs text-muted"
        >ces {{ AUTO_ATTACH_REVIEW_DAYS }} derniers jours</span
      >
    </div>
    <p class="max-w-3xl text-[13px] leading-normal text-muted">
      Ces annonces sont les vôtres, publiées sur un autre portail. Le lien
      rejoint la fiche, rien d’autre ne change ; un écart de prix est noté dans
      l’Historique.
    </p>
    <ul class="grid gap-2">
      <li
        v-for="draft in rows"
        :key="draft.id"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line px-3 py-2.5"
        :class="detached.has(draft.id) ? 'bg-surface-2' : ''"
        :data-draft="draft.id"
        :data-detached="detached.has(draft.id)"
      >
        <span
          class="rounded-md border border-accent/50 bg-accent-soft px-1.5 py-px text-xs font-medium text-accent"
          >{{
            draft.attachment
              ? LISTING_PORTAL_LABELS[draft.attachment.portal]
              : 'Lien'
          }}</span
        >
        <span class="min-w-0 flex-[1_1_18rem] text-sm leading-normal">
          Ajouté à
          <RouterLink
            v-if="draft.attachment"
            :to="{
              name: 'listing',
              params: { id: draft.attachment.listingId },
            }"
            class="font-semibold text-accent underline-offset-2 hover:underline"
            >{{ draft.attachment.listingTitle }}</RouterLink
          >
          <template v-if="draft.attachment?.sellerReference">
            ·
            <span class="font-mono"
              >Réf. {{ draft.attachment.sellerReference }}</span
            >
          </template>
          <template v-if="draft.attachment?.sellerName">
            · {{ draft.attachment.sellerName }}</template
          >
          <span class="block text-xs text-muted"
            >rattaché le
            {{ shortDay(draft.attachment?.attachedAt ?? draft.receivedAt) }}
            <template v-if="draft.attachment?.linkId === null">
              · lien retiré depuis</template
            ></span
          >
        </span>
        <span
          class="text-sm tabular-nums"
          :class="
            priceText(draft).includes('de plus') ||
            priceText(draft).includes('de moins')
              ? 'font-medium text-warn'
              : 'text-muted'
          "
          data-testid="attached-price"
          >{{ priceText(draft) }}</span
        >
        <span
          v-if="detached.has(draft.id)"
          class="text-sm text-muted"
          role="status"
          data-testid="attached-detached"
          >Détachée : elle passe dans les annonces à valider.</span
        >
        <template v-else-if="confirming === draft.id">
          <span class="text-sm">Retirer ce lien de la fiche ?</span>
          <button
            type="button"
            class="min-h-10 rounded-lg border border-bad bg-surface px-3 text-sm font-semibold text-bad disabled:opacity-60"
            :disabled="attached.detach.isPending.value"
            data-action="confirm-detach"
            @click="detach(draft)"
          >
            Oui, la détacher
          </button>
          <button
            type="button"
            class="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm"
            @click="confirming = null"
          >
            Annuler
          </button>
        </template>
        <button
          v-else
          type="button"
          class="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm disabled:opacity-60"
          :disabled="attached.detach.isPending.value"
          data-action="detach"
          @click="confirming = draft.id"
        >
          Ce n’est pas la même
        </button>
        <p
          v-if="errors[draft.id]"
          role="alert"
          class="basis-full text-sm text-bad"
        >
          {{ errors[draft.id] }}
        </p>
      </li>
    </ul>
  </section>
</template>
