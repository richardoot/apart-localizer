<script setup lang="ts">
  import { computed, ref } from 'vue'
  import {
    AUTO_ATTACH_REVIEW_DAYS,
    LISTING_PORTAL_LABELS,
  } from '@apart/contracts'
  import type { ListingDraft } from '@apart/contracts'
  import { comparedPriceText, shortDay } from '@apart/domain'
  import { useAttachedDrafts } from '@/composables/useDrafts'
  import { errorMessage } from '@/lib/errors'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'
  import { cardClasses } from '@/lib/ui'

  /**
   * Lot 18 : « Liens rattachés d'office », en tête de l'étape « À valider ».
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
    } catch (error) {
      errors.value = {
        ...errors.value,
        [draft.id]: errorMessage(error, 'Le détachement a échoué.'),
      }
    }
  }
</script>

<template>
  <section
    v-if="rows.length"
    aria-labelledby="attached-title"
    class="grid gap-2.5"
    :class="cardClasses()"
    data-testid="attached-links"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="attached-title" class="text-base font-semibold">
        Liens rattachés d’office : même agence, même référence
      </h2>
      <span class="text-xs text-muted"
        >ces {{ AUTO_ATTACH_REVIEW_DAYS }} derniers jours</span
      >
    </div>
    <p class="max-w-3xl text-sm leading-normal text-muted">
      Ces annonces sont celles que tu suis déjà, publiées sur un autre portail.
      Le lien rejoint la fiche, rien d’autre ne change ; un écart de prix est
      noté dans l’Historique.
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
        <UiBadge tone="accent">{{
          draft.attachment
            ? LISTING_PORTAL_LABELS[draft.attachment.portal]
            : 'Lien'
        }}</UiBadge>
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
        <UiConfirm
          v-else
          label="Ce n’est pas la même"
          variant="secondary"
          question="Retirer ce lien de la fiche ?"
          confirm-label="Oui, la détacher"
          :busy="attached.detach.isPending.value"
          :confirm-attrs="{ 'data-action': 'confirm-detach' }"
          data-action="detach"
          @confirm="detach(draft)"
        />
        <UiAlert v-if="errors[draft.id]" class="basis-full">
          {{ errors[draft.id] }}
        </UiAlert>
      </li>
    </ul>
  </section>
</template>
