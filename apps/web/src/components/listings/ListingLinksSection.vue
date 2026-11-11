<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { LISTING_PORTAL_LABELS } from '@apart/contracts'
  import type {
    EvaluatedListing,
    ListingLink,
    ListingPortal,
  } from '@apart/contracts'
  import {
    fichePriceProposal,
    linkCountText,
    linkPortalFromUrl,
    linkPriceGap,
    linkStateText,
    linkSubLabel,
    orderLinks,
    priceGapText,
    referenceKey,
    shortDay,
  } from '@apart/domain'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiInput from '@/components/ui/UiInput.vue'
  import { useListingLinks } from '@/composables/useListingLinks'
  import { errorMessage, isConflict } from '@/lib/errors'
  import { formatEuros, numberInputError, parseNumberInput } from '@/lib/format'
  import { useFeedbackStore } from '@/stores/feedback'
  import { conflictListingOf, conflictText } from '@/lib/listing-links'
  import type { ConflictListing } from '@/lib/listing-links'

  /**
   * Lot 18 : « Où la trouver », dans la Synthèse de la fiche. Les liens de
   * l'annonce sur les portails, le principal d'abord : portail, origine,
   * prix affiché et son écart au plus bas en ligne (« +5 000 € : frais
   * inclus ? », noté, jamais tranché), vue en ligne ou plus en ligne,
   * ajout. Le prix de la fiche est le plus bas affiché en ligne ; un prix
   * saisi à la main n'est jamais remplacé sans « Prendre ce prix ».
   * « Ajouter un lien » colle l'URL de la même annonce sur un autre portail
   * (rien n'est téléchargé) ; une URL déjà sur une autre fiche est refusée,
   * avec le nom de cette annonce. Un lien se relève à la main (plus en
   * ligne, prix) ou se retire, jamais le dernier. Sous 640 px, les liens
   * s'empilent en cartes. Textes et règles : `domain`. Lot 22 : l'erreur
   * dans la section, la réussite dans la zone de messages (« Annuler » pour
   * « plus en ligne ») ; un prix illisible est refusé au champ.
   */
  const props = defineProps<{
    item: EvaluatedListing
    /** L'instant de lecture (tests) ; maintenant par défaut. */
    now?: Date
  }>()

  const listingId = computed(() => props.item.listing.id)
  const links = useListingLinks(listingId)
  const feedback = useFeedbackStore()

  const ordered = computed(() => orderLinks(props.item.links))
  const countText = computed(() => linkCountText(props.item.links))
  const at = computed(() => props.now ?? new Date())
  const lastLink = computed(() => props.item.links.length <= 1)

  const proposal = computed(() =>
    fichePriceProposal({
      fichePrice: props.item.listing.price,
      priceSource: props.item.listing.fieldSources.price?.source ?? null,
      links: props.item.links,
    })
  )

  /** La ligne sous le portail ; « même référence » pour un lien rattaché par Claude. */
  function subLabel(link: ListingLink): string {
    const key = props.item.listing.sellerReferenceKey
    const sameReference =
      (link.origin === 'claude' || link.origin === 'exploration') &&
      key !== null &&
      referenceKey(link.readReference) === key
    return linkSubLabel(link, { autoAttached: sameReference })
  }

  function gapOf(link: ListingLink): string | null {
    const gap = linkPriceGap(link, props.item.links)
    return gap === null ? null : priceGapText(gap)
  }

  // --- Ajouter un lien ------------------------------------------------------

  const formOpen = ref(false)
  const draftUrl = ref('')
  const draftPrice = ref('')
  const draftOnline = ref(false)
  const unknownPortal = ref<Extract<ListingPortal, 'agence' | 'autre'>>('autre')
  const failure = ref<string | null>(null)
  const conflict = ref<ConflictListing | null>(null)
  const draftPriceError = ref<string | null>(null)

  const recognized = computed(() =>
    draftUrl.value.trim() ? linkPortalFromUrl(draftUrl.value.trim()) : null
  )
  const hint = computed(() => {
    if (!draftUrl.value.trim()) {
      return 'Colle le lien de la même annonce sur un autre portail. Rien n’est téléchargé : Claude lira la page à la prochaine tournée.'
    }
    return recognized.value
      ? `Portail reconnu : ${LISTING_PORTAL_LABELS[recognized.value]}. Si ce lien est déjà sur une autre fiche, l’appli te le dira avant de l’ajouter.`
      : 'Portail non reconnu : dis s’il s’agit du site de l’agence ou d’un autre site.'
  })

  function report(error: unknown): void {
    const message = errorMessage(error, 'L’enregistrement a échoué.')
    conflict.value = isConflict(error) ? conflictListingOf(message) : null
    failure.value = conflictText(message)
  }

  async function addLink(): Promise<void> {
    const url = draftUrl.value.trim()
    if (!url) return
    failure.value = null
    conflict.value = null
    draftPriceError.value = numberInputError(draftPrice.value)
    if (draftPriceError.value) {
      document.getElementById('new-link-price')?.focus()
      return
    }
    const price = parseNumberInput(draftPrice.value)
    try {
      const result = await links.add.mutateAsync({
        url,
        origin: 'manual',
        ...(recognized.value ? {} : { portal: unknownPortal.value }),
        ...(price !== null && price > 0 ? { price } : {}),
        ...(draftOnline.value ? { online: true } : {}),
        expectedUpdatedAt: props.item.listing.updatedAt,
      })
      feedback.success(
        price === null && !draftOnline.value
          ? `${result.summary}. Claude relèvera son prix à la prochaine tournée.`
          : `${result.summary}.`
      )
      draftUrl.value = ''
      draftPrice.value = ''
      draftOnline.value = false
      formOpen.value = false
    } catch (error) {
      report(error)
    }
  }

  // --- Relever un lien à la main -------------------------------------------

  const editingPrice = ref<string | null>(null)
  const priceInput = ref('')
  const priceError = ref<string | null>(null)

  function startPrice(link: ListingLink): void {
    editingPrice.value = link.id
    priceError.value = null
    priceInput.value = link.price === null ? '' : String(link.price)
  }

  async function run(
    action: () => Promise<{ summary: string }>,
    undo?: () => unknown
  ): Promise<void> {
    failure.value = null
    conflict.value = null
    try {
      const result = await action()
      feedback.success(`${result.summary}.`, undo ? { undo } : {})
    } catch (error) {
      report(error)
    }
  }

  const savePrice = (link: ListingLink) => {
    const price = parseNumberInput(priceInput.value)
    if (price === null || price <= 0) {
      priceError.value =
        numberInputError(priceInput.value) ??
        'Écris le prix affiché sur ce portail, en euros.'
      return Promise.resolve()
    }
    priceError.value = null
    return run(async () => {
      const result = await links.update.mutateAsync({
        linkId: link.id,
        patch: { price, expectedUpdatedAt: props.item.listing.updatedAt },
      })
      editingPrice.value = null
      return result
    })
  }

  const updateOnline = (link: ListingLink, online: boolean) =>
    links.update.mutateAsync({
      linkId: link.id,
      patch: { online, expectedUpdatedAt: props.item.listing.updatedAt },
    })
  /** « Plus en ligne » ou « De nouveau en ligne » ; « Annuler » remet l'état d'avant. */
  const setOnline = (link: ListingLink, online: boolean) =>
    run(
      () => updateOnline(link, online),
      () =>
        links.update.mutateAsync({
          linkId: link.id,
          patch: { online: !online },
        })
    )

  const removeLink = (link: ListingLink) =>
    run(() => links.remove.mutateAsync(link.id))

  async function takePrice(): Promise<void> {
    if (!proposal.value) return
    failure.value = null
    try {
      await links.takePrice.mutateAsync({
        newPrice: proposal.value.to,
        expectedPrice: proposal.value.from,
        source: 'listing',
      })
      feedback.success(
        'Prix de la fiche aligné sur le plus bas affiché en ligne.'
      )
    } catch (error) {
      report(error)
    }
  }

  const busy = computed(
    () =>
      links.add.isPending.value ||
      links.update.isPending.value ||
      links.remove.isPending.value ||
      links.takePrice.isPending.value
  )
</script>

<template>
  <UiCard
    class="@container grid gap-3"
    aria-labelledby="links-title"
    data-testid="listing-links"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="links-title" class="font-display text-base font-bold">
        Où la trouver
      </h3>
      <span class="text-sm text-muted" data-testid="links-count">{{
        countText
      }}</span>
    </div>

    <p
      v-if="ordered.length === 0"
      class="text-sm text-muted"
      data-testid="links-empty"
    >
      Aucun lien pour l’instant : ajoute celui de la page de l’annonce.
    </p>
    <div v-else class="grid gap-2 @xl:gap-0">
      <div
        class="hidden border-b border-line pb-1.5 text-xs font-medium text-muted @xl:grid @xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] @xl:gap-3"
        aria-hidden="true"
      >
        <span>Portail</span><span>Prix affiché</span><span>Vue en ligne</span
        ><span class="text-right">Actions</span>
      </div>
      <ul class="grid gap-2 @xl:gap-0" data-testid="links-list">
        <li
          v-for="link in ordered"
          :key="link.id"
          class="grid gap-x-3 gap-y-1.5 rounded-xl border border-line p-3 @xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] @xl:items-start @xl:rounded-none @xl:border-0 @xl:border-b @xl:px-0 @xl:py-2.5"
          :class="link.online ? '' : 'text-muted'"
          :data-link="link.id"
          :data-portal="link.portal"
          :data-online="link.online"
        >
          <div class="grid min-w-0 gap-0.5">
            <span class="flex flex-wrap items-baseline gap-x-2">
              <strong class="font-semibold">{{
                LISTING_PORTAL_LABELS[link.portal]
              }}</strong>
              <UiBadge v-if="link.primary && ordered.length > 1"
                >lien principal</UiBadge
              >
            </span>
            <span class="text-sm break-words text-muted">{{
              subLabel(link)
            }}</span>
          </div>
          <div class="grid gap-0.5 tabular-nums">
            <template v-if="editingPrice === link.id">
              <form
                class="grid gap-1.5"
                data-testid="link-price-form"
                novalidate
                @submit.prevent="savePrice(link)"
              >
                <div class="flex flex-wrap items-center gap-1.5">
                  <label class="sr-only" :for="`link-price-${link.id}`"
                    >Prix affiché sur
                    {{ LISTING_PORTAL_LABELS[link.portal] }}</label
                  >
                  <UiInput
                    :id="`link-price-${link.id}`"
                    v-model="priceInput"
                    class="w-36"
                    inputmode="numeric"
                    unit="€"
                    :invalid="!!priceError"
                    :described-by="
                      priceError ? `link-price-${link.id}-error` : undefined
                    "
                    data-testid="link-price-input"
                  />
                  <UiButton type="submit" size="sm" :disabled="busy">
                    Enregistrer
                  </UiButton>
                  <UiButton size="sm" @click="editingPrice = null">
                    Annuler
                  </UiButton>
                </div>
                <p
                  v-if="priceError"
                  :id="`link-price-${link.id}-error`"
                  class="text-sm font-medium text-bad"
                  data-testid="field-error"
                >
                  {{ priceError }}
                </p>
              </form>
            </template>
            <template v-else>
              <span class="font-medium" data-testid="link-price">{{
                link.price === null ? 'prix à relever' : formatEuros(link.price)
              }}</span>
              <UiBadge v-if="gapOf(link)" tone="warn" data-testid="link-gap">{{
                gapOf(link)
              }}</UiBadge>
            </template>
          </div>
          <div class="grid gap-0.5 text-sm">
            <span
              :class="link.online ? '' : 'font-medium'"
              data-testid="link-state"
              >{{ linkStateText(link, at) }}</span
            >
            <span class="text-xs text-muted"
              >ajouté le {{ shortDay(link.createdAt) }}</span
            >
          </div>
          <div
            class="flex flex-wrap items-start gap-1.5 @xl:justify-end"
            data-testid="link-actions"
          >
            <UiButton
              :href="link.url"
              size="sm"
              target="_blank"
              rel="noopener noreferrer"
              icon-right="external"
              class="font-medium text-accent"
              >Ouvrir</UiButton
            >
            <UiButton
              size="sm"
              :disabled="busy"
              data-action="toggle-online"
              @click="setOnline(link, !link.online)"
            >
              {{ link.online ? 'Plus en ligne' : 'De nouveau en ligne' }}
            </UiButton>
            <UiButton
              v-if="editingPrice !== link.id"
              size="sm"
              :disabled="busy"
              data-action="edit-price"
              @click="startPrice(link)"
            >
              Prix
            </UiButton>
            <UiConfirm
              label="Retirer"
              question="Retirer ce lien ?"
              confirm-label="Retirer ce lien"
              cancel-label="Garder"
              :disabled="busy || lastLink"
              :busy="links.remove.isPending.value"
              :title="
                lastLink
                  ? 'Le dernier lien d’une annonce ne se retire pas : remplace-le par la saisie de la fiche, ou passe l’annonce en « Vendu ou retiré ».'
                  : 'Retirer ce lien de la fiche'
              "
              :confirm-attrs="{ 'data-action': 'confirm-remove' }"
              data-action="remove"
              @confirm="removeLink(link)"
            />
          </div>
        </li>
      </ul>
      <p
        v-if="lastLink"
        class="pt-1.5 text-xs text-muted"
        data-testid="last-link-note"
      >
        Le dernier lien ne se retire pas : une annonce garde au moins un lien.
      </p>
    </div>

    <div
      v-if="proposal"
      class="flex flex-wrap items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm"
      data-testid="price-proposal"
    >
      <span class="min-w-0 flex-[1_1_18rem]">{{ proposal.text }}</span>
      <UiButton
        variant="primary"
        size="sm"
        :disabled="busy"
        data-action="take-price"
        @click="takePrice"
      >
        Prendre ce prix
      </UiButton>
    </div>
    <p v-else-if="ordered.length > 1" class="text-xs text-muted">
      Le prix de la fiche est le plus bas affiché en ligne. Un écart entre
      portails est souvent une question de frais d’agence inclus ou non, ou une
      baisse pas encore reportée : il est noté dans l’Historique.
    </p>

    <UiAlert v-if="failure" data-testid="links-failure">
      {{ failure }}
      <RouterLink
        v-if="conflict"
        :to="{ name: 'listing', params: { id: conflict.id } }"
        class="font-semibold underline underline-offset-2"
        data-testid="links-conflict"
        >Ouvrir « {{ conflict.title }} »</RouterLink
      >
    </UiAlert>

    <UiButton
      variant="outline"
      class="w-fit @xl:hidden"
      :aria-expanded="formOpen"
      aria-controls="new-link-form"
      data-action="open-add-link"
      @click="formOpen = !formOpen"
    >
      Ajouter un lien
    </UiButton>
    <form
      id="new-link-form"
      class="gap-2 border-t border-line pt-3"
      :class="formOpen ? 'grid' : 'hidden @xl:grid'"
      data-testid="add-link-form"
      novalidate
      @submit.prevent="addLink"
    >
      <label for="new-link" class="text-sm font-semibold"
        >Ajouter un lien</label
      >
      <div class="flex flex-wrap gap-2">
        <UiInput
          id="new-link"
          v-model="draftUrl"
          class="min-w-0 flex-[1_1_16rem]"
          type="url"
          inputmode="url"
          maxlength="2000"
          placeholder="https://www.bienici.com/annonce/…"
          described-by="new-link-hint"
          data-testid="new-link-url"
        />
        <UiButton
          type="submit"
          variant="primary"
          :disabled="busy || !draftUrl.trim()"
          data-action="add-link"
        >
          Ajouter
        </UiButton>
      </div>
      <span
        id="new-link-hint"
        class="text-xs text-muted"
        data-testid="new-link-hint"
        >{{ hint }}</span
      >
      <fieldset
        v-if="draftUrl.trim() && !recognized"
        class="flex flex-wrap gap-x-4 text-sm"
      >
        <legend class="sr-only">Quel site ?</legend>
        <UiCheckbox
          v-model="unknownPortal"
          type="radio"
          value="agence"
          label="Site de l’agence"
        />
        <UiCheckbox
          v-model="unknownPortal"
          type="radio"
          value="autre"
          label="Autre site"
        />
      </fieldset>
      <div
        v-if="draftUrl.trim()"
        class="flex flex-wrap items-end gap-x-4 gap-y-2"
      >
        <UiField
          id="new-link-price"
          v-model="draftPrice"
          class="w-56"
          label="Prix affiché (facultatif)"
          quiet
          unit="€"
          inputmode="numeric"
          :error="draftPriceError"
          data-testid="new-link-price"
        />
        <UiCheckbox
          v-model="draftOnline"
          label="Je viens de la voir en ligne"
          data-testid="new-link-online"
        />
      </div>
    </form>
  </UiCard>
</template>
