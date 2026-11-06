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
  import { useListingLinks } from '@/composables/useListingLinks'
  import { ApiError } from '@/lib/api'
  import { formatEuros, parseNumberInput } from '@/lib/format'
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
   * s'empilent en cartes. Textes et règles : `domain`.
   */
  const props = defineProps<{
    item: EvaluatedListing
    /** L'instant de lecture (tests) ; maintenant par défaut. */
    now?: Date
  }>()

  const listingId = computed(() => props.item.listing.id)
  const links = useListingLinks(listingId)

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
  const notice = ref<string | null>(null)
  const failure = ref<string | null>(null)
  const conflict = ref<ConflictListing | null>(null)

  const recognized = computed(() =>
    draftUrl.value.trim() ? linkPortalFromUrl(draftUrl.value.trim()) : null
  )
  const hint = computed(() => {
    if (!draftUrl.value.trim()) {
      return 'Collez le lien de la même annonce sur un autre portail. Rien n’est téléchargé : Claude lira la page à la prochaine tournée.'
    }
    return recognized.value
      ? `Portail reconnu : ${LISTING_PORTAL_LABELS[recognized.value]}. Si ce lien est déjà sur une autre fiche, l’appli vous le dira avant de l’ajouter.`
      : 'Portail non reconnu : dites s’il s’agit du site de l’agence ou d’un autre site.'
  })

  function report(error: unknown): void {
    const message =
      error instanceof ApiError ? error.message : 'L’enregistrement a échoué.'
    conflict.value =
      error instanceof ApiError && error.status === 409
        ? conflictListingOf(message)
        : null
    failure.value = conflictText(message)
    notice.value = null
  }

  async function addLink(): Promise<void> {
    const url = draftUrl.value.trim()
    if (!url) return
    failure.value = null
    conflict.value = null
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
      notice.value =
        price === null && !draftOnline.value
          ? `${result.summary}. Claude relèvera son prix à la prochaine tournée.`
          : `${result.summary}.`
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
  const confirmingRemove = ref<string | null>(null)

  function startPrice(link: ListingLink): void {
    editingPrice.value = link.id
    priceInput.value = link.price === null ? '' : String(link.price)
  }

  async function run(
    action: () => Promise<{ summary: string }>
  ): Promise<void> {
    failure.value = null
    conflict.value = null
    try {
      const result = await action()
      notice.value = `${result.summary}.`
    } catch (error) {
      report(error)
    }
  }

  const savePrice = (link: ListingLink) => {
    const price = parseNumberInput(priceInput.value)
    if (price === null || price <= 0) {
      failure.value = 'Saisissez le prix affiché sur ce portail, en euros.'
      return Promise.resolve()
    }
    return run(async () => {
      const result = await links.update.mutateAsync({
        linkId: link.id,
        patch: { price, expectedUpdatedAt: props.item.listing.updatedAt },
      })
      editingPrice.value = null
      return result
    })
  }

  const setOnline = (link: ListingLink, online: boolean) =>
    run(() =>
      links.update.mutateAsync({
        linkId: link.id,
        patch: { online, expectedUpdatedAt: props.item.listing.updatedAt },
      })
    )

  const removeLink = (link: ListingLink) =>
    run(async () => {
      const result = await links.remove.mutateAsync(link.id)
      confirmingRemove.value = null
      return result
    })

  async function takePrice(): Promise<void> {
    if (!proposal.value) return
    failure.value = null
    try {
      await links.takePrice.mutateAsync({
        newPrice: proposal.value.to,
        expectedPrice: proposal.value.from,
        source: 'listing',
      })
      notice.value = 'Prix de la fiche aligné sur le plus bas affiché en ligne.'
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

  const smallButton =
    'inline-flex min-h-11 items-center rounded-lg border border-line px-2.5 text-xs hover:bg-surface-2 disabled:opacity-60 sm:min-h-8'
</script>

<template>
  <section
    class="@container grid gap-3 rounded-2xl border border-line bg-surface p-4"
    aria-labelledby="links-title"
    data-testid="listing-links"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="links-title" class="font-display text-base font-semibold">
        Où la trouver
      </h3>
      <span class="text-xs text-muted" data-testid="links-count">{{
        countText
      }}</span>
    </div>

    <p
      v-if="ordered.length === 0"
      class="text-sm text-muted"
      data-testid="links-empty"
    >
      Aucun lien pour l’instant : ajoutez celui de la page de l’annonce.
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
              <span
                v-if="link.primary && ordered.length > 1"
                class="rounded-full bg-surface-2 px-1.5 text-[11px] text-muted"
                >lien principal</span
              >
            </span>
            <span class="text-xs break-words text-muted">{{
              subLabel(link)
            }}</span>
          </div>
          <div class="grid gap-0.5 tabular-nums">
            <template v-if="editingPrice === link.id">
              <form
                class="flex flex-wrap items-center gap-1.5"
                data-testid="link-price-form"
                @submit.prevent="savePrice(link)"
              >
                <label class="sr-only" :for="`link-price-${link.id}`"
                  >Prix affiché sur
                  {{ LISTING_PORTAL_LABELS[link.portal] }} (€)</label
                >
                <input
                  :id="`link-price-${link.id}`"
                  v-model="priceInput"
                  inputmode="numeric"
                  class="min-h-11 w-32 rounded-lg border border-line bg-bg px-2 text-sm sm:min-h-8"
                  data-testid="link-price-input"
                />
                <button type="submit" :class="smallButton" :disabled="busy">
                  Enregistrer
                </button>
                <button
                  type="button"
                  :class="smallButton"
                  @click="editingPrice = null"
                >
                  Annuler
                </button>
              </form>
            </template>
            <template v-else>
              <span class="font-medium" data-testid="link-price">{{
                link.price === null ? 'prix à relever' : formatEuros(link.price)
              }}</span>
              <span
                v-if="gapOf(link)"
                class="w-fit rounded-md bg-warn-soft px-1.5 text-xs font-medium text-warn"
                data-testid="link-gap"
                >{{ gapOf(link) }}</span
              >
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
            <a
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
              :class="smallButton"
              class="font-medium text-accent"
              >Ouvrir</a
            >
            <button
              type="button"
              :class="smallButton"
              :disabled="busy"
              data-action="toggle-online"
              @click="setOnline(link, !link.online)"
            >
              {{ link.online ? 'Plus en ligne' : 'De nouveau en ligne' }}
            </button>
            <button
              v-if="editingPrice !== link.id"
              type="button"
              :class="smallButton"
              :disabled="busy"
              data-action="edit-price"
              @click="startPrice(link)"
            >
              Prix
            </button>
            <template v-if="confirmingRemove === link.id">
              <button
                type="button"
                class="inline-flex min-h-11 items-center rounded-lg border border-bad px-2.5 text-xs font-medium text-bad disabled:opacity-60 sm:min-h-8"
                :disabled="busy"
                data-action="confirm-remove"
                @click="removeLink(link)"
              >
                Retirer ce lien
              </button>
              <button
                type="button"
                :class="smallButton"
                @click="confirmingRemove = null"
              >
                Garder
              </button>
            </template>
            <button
              v-else
              type="button"
              :class="smallButton"
              :disabled="busy || lastLink"
              :title="
                lastLink
                  ? 'Le dernier lien d’une annonce ne se retire pas : remplacez-le par la saisie de la fiche, ou passez l’annonce en « Vendu ou retiré ».'
                  : 'Retirer ce lien de la fiche'
              "
              data-action="remove"
              @click="confirmingRemove = link.id"
            >
              Retirer
            </button>
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
      <button
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-60 sm:min-h-9"
        :disabled="busy"
        data-action="take-price"
        @click="takePrice"
      >
        Prendre ce prix
      </button>
    </div>
    <p v-else-if="ordered.length > 1" class="text-xs text-muted">
      Le prix de la fiche est le plus bas affiché en ligne. Un écart entre
      portails est souvent une question de frais d’agence inclus ou non, ou une
      baisse pas encore reportée : il est noté dans l’Historique.
    </p>

    <p
      v-if="failure"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      data-testid="links-failure"
    >
      {{ failure }}
      <RouterLink
        v-if="conflict"
        :to="{ name: 'listing', params: { id: conflict.id } }"
        class="font-semibold underline underline-offset-2"
        data-testid="links-conflict"
        >Ouvrir « {{ conflict.title }} »</RouterLink
      >
    </p>
    <p
      v-else-if="notice"
      class="text-sm text-good"
      aria-live="polite"
      data-testid="links-notice"
    >
      {{ notice }}
    </p>

    <button
      type="button"
      class="inline-flex min-h-11 w-fit items-center rounded-lg border border-accent px-3 text-sm font-semibold text-accent hover:bg-accent-soft @xl:hidden sm:min-h-10"
      :aria-expanded="formOpen"
      aria-controls="new-link-form"
      data-action="open-add-link"
      @click="formOpen = !formOpen"
    >
      Ajouter un lien
    </button>
    <form
      id="new-link-form"
      class="gap-2 border-t border-line pt-3"
      :class="formOpen ? 'grid' : 'hidden @xl:grid'"
      data-testid="add-link-form"
      @submit.prevent="addLink"
    >
      <label for="new-link" class="text-sm font-medium">Ajouter un lien</label>
      <div class="flex flex-wrap gap-2">
        <input
          id="new-link"
          v-model="draftUrl"
          type="url"
          required
          maxlength="2000"
          placeholder="https://www.bienici.com/annonce/…"
          class="min-h-11 min-w-0 flex-[1_1_16rem] rounded-lg border border-line bg-bg px-3 text-sm sm:min-h-9"
          data-testid="new-link-url"
        />
        <button
          type="submit"
          class="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-60 sm:min-h-9"
          :disabled="busy || !draftUrl.trim()"
          data-action="add-link"
        >
          Ajouter
        </button>
      </div>
      <span class="text-xs text-muted" data-testid="new-link-hint">{{
        hint
      }}</span>
      <fieldset
        v-if="draftUrl.trim() && !recognized"
        class="flex flex-wrap gap-3 text-sm"
      >
        <legend class="sr-only">Quel site ?</legend>
        <label class="inline-flex min-h-9 items-center gap-1.5">
          <input
            v-model="unknownPortal"
            type="radio"
            value="agence"
            class="accent-accent"
          />
          Site de l’agence
        </label>
        <label class="inline-flex min-h-9 items-center gap-1.5">
          <input
            v-model="unknownPortal"
            type="radio"
            value="autre"
            class="accent-accent"
          />
          Autre site
        </label>
      </fieldset>
      <div
        v-if="draftUrl.trim()"
        class="flex flex-wrap items-center gap-x-4 gap-y-2"
      >
        <label class="inline-flex items-center gap-2 text-sm">
          Prix affiché (facultatif)
          <input
            v-model="draftPrice"
            inputmode="numeric"
            class="min-h-11 w-32 rounded-lg border border-line bg-bg px-2 text-sm sm:min-h-8"
            data-testid="new-link-price"
          />
          €
        </label>
        <label class="inline-flex min-h-9 items-center gap-2 text-sm">
          <input
            v-model="draftOnline"
            type="checkbox"
            class="accent-accent"
            data-testid="new-link-online"
          />
          Je viens de la voir en ligne
        </label>
      </div>
    </form>
  </section>
</template>
