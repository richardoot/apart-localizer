<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import {
    LISTING_SELLERS_MAX,
    LISTING_SELLER_ORIGIN_LABELS,
    ObservedSellerTypeSchema,
    SELLER_TYPE_LABELS,
    SellerTypeSchema,
  } from '@apart/contracts'
  import type {
    EvaluatedListing,
    ObservedSellerType,
    SellerType,
  } from '@apart/contracts'
  import {
    isEmptySeller,
    otherSellerText,
    referenceProvenanceText,
    sellerNameLabel,
    sellersCountText,
  } from '@apart/domain'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiInput from '@/components/ui/UiInput.vue'
  import { useAction } from '@/composables/useAction'
  import { useListingMerge } from '@/composables/useListingMerge'
  import { useListingMutations } from '@/composables/useListings'
  import { conflictText } from '@/lib/listing-links'
  import type { ListingTab } from '@/lib/listing-tabs'

  /**
   * Lot 18 : « Qui la vend », dans la Synthèse de la fiche. Agence,
   * mandataire, particulier ou inconnu (par défaut, jamais deviné) ; le nom
   * de l'agence ou du réseau (jamais celui d'une personne : il va dans le
   * contact de l'onglet « À faire ») et la référence de l'annonce, avec
   * « Copier » et d'où elle vient. La référence sert à reconnaître la même
   * annonce sur un autre portail ; un particulier n'en a pas (champs
   * masqués). Enregistré avec le garde-fou `expectedUpdatedAt`.
   *
   * Lot 27 (ADR 0037) : un même bien est parfois vendu par plusieurs agences
   * (mandat simple). Sous l'agence principale, les autres agences, chacune
   * avec sa référence et d'où elle vient ; « Ajouter une agence » en
   * enregistre une (elle devient la principale si la fiche n'en avait pas) ;
   * une agence se retire ici, jamais par Claude.
   */
  const props = defineProps<{ item: EvaluatedListing }>()
  const emit = defineEmits<{ go: [tab: ListingTab] }>()

  const mutations = useListingMutations()
  const types = SellerTypeSchema.options

  const sellerType = ref<SellerType>('unknown')
  const sellerName = ref('')
  const sellerReference = ref('')
  const action = useAction('L’enregistrement a échoué.')
  const copied = ref(false)

  /** Le formulaire se cale sur la fiche à chaque version enregistrée. */
  watch(
    () => [
      props.item.listing.id,
      props.item.listing.updatedAt,
      props.item.listing.sellerType,
      props.item.listing.sellerName,
      props.item.listing.sellerReference,
    ],
    () => {
      sellerType.value = props.item.listing.sellerType
      sellerName.value = props.item.listing.sellerName ?? ''
      sellerReference.value = props.item.listing.sellerReference ?? ''
    },
    { immediate: true }
  )

  const isPro = computed(
    () => sellerType.value === 'agency' || sellerType.value === 'mandatary'
  )
  const nameLabel = computed(() => sellerNameLabel(sellerType.value))
  const dirty = computed(() => {
    const l = props.item.listing
    if (sellerType.value !== l.sellerType) return true
    if (sellerType.value === 'private') return false
    return (
      sellerName.value.trim() !== (l.sellerName ?? '') ||
      sellerReference.value.trim() !== (l.sellerReference ?? '')
    )
  })
  const provenance = computed(() =>
    referenceProvenanceText({
      reference: props.item.listing.sellerReference,
      provenance: props.item.listing.fieldSources.sellerReference,
      links: props.item.links,
    })
  )
  const savedReference = computed(() => props.item.listing.sellerReference)

  async function save(): Promise<void> {
    const name = sellerName.value.trim()
    const reference = sellerReference.value.trim()
    await action.run(
      () =>
        mutations.update.mutateAsync({
          id: props.item.listing.id,
          patch: {
            sellerType: sellerType.value,
            ...(sellerType.value === 'private'
              ? {}
              : {
                  sellerName: name || null,
                  sellerReference: reference || null,
                }),
            expectedUpdatedAt: props.item.listing.updatedAt,
          },
        }),
      { success: 'Vendeur enregistré.' }
    )
  }

  function cancel(): void {
    sellerType.value = props.item.listing.sellerType
    sellerName.value = props.item.listing.sellerName ?? ''
    sellerReference.value = props.item.listing.sellerReference ?? ''
    action.clear()
  }

  // --- Lot 27 : les autres agences qui vendent le même bien -----------------

  const merges = useListingMerge()
  const otherTypes = ObservedSellerTypeSchema.options
  const others = computed(() => props.item.sellers)
  const countText = computed(() =>
    sellersCountText(props.item.listing, props.item.sellers)
  )
  const canAdd = computed(() => others.value.length < LISTING_SELLERS_MAX)
  /** Sans vendeur connu, l'agence ajoutée devient celle de la fiche : autant la saisir en haut. */
  const hasPrincipal = computed(() => !isEmptySeller(props.item.listing))
  const adding = ref(false)
  const otherType = ref<ObservedSellerType>('agency')
  const otherName = ref('')
  const otherReference = ref('')
  const otherAction = useAction('L’enregistrement a échoué.')
  const removing = ref<string | null>(null)
  const otherIsPro = computed(() => otherType.value !== 'private')
  const otherError = computed(() =>
    otherAction.error.value ? conflictText(otherAction.error.value) : null
  )

  function closeOther(): void {
    adding.value = false
    otherType.value = 'agency'
    otherName.value = ''
    otherReference.value = ''
    otherAction.clear()
  }

  async function addOther(): Promise<void> {
    const name = otherName.value.trim()
    const reference = otherReference.value.trim()
    if (otherIsPro.value && !name && !reference) {
      otherAction.fail('Donne le nom de l’agence ou sa référence.')
      document.getElementById('other-seller-name')?.focus()
      return
    }
    const result = await otherAction.run(
      () =>
        merges.addSeller.mutateAsync({
          listingId: props.item.listing.id,
          input: {
            sellerType: otherType.value,
            ...(otherIsPro.value && name ? { sellerName: name } : {}),
            ...(otherIsPro.value && reference
              ? { sellerReference: reference }
              : {}),
            expectedUpdatedAt: props.item.listing.updatedAt,
          },
        }),
      { success: saved => `${saved.summary}.` }
    )
    if (result) closeOther()
  }

  async function removeOther(sellerId: string): Promise<void> {
    removing.value = sellerId
    await otherAction.run(
      () =>
        merges.removeSeller.mutateAsync({
          listingId: props.item.listing.id,
          sellerId,
        }),
      { success: saved => `${saved.summary}.` }
    )
    removing.value = null
  }

  async function copyReference(): Promise<void> {
    const reference = savedReference.value
    if (!reference) return
    try {
      await navigator.clipboard.writeText(reference)
      copied.value = true
      window.setTimeout(() => (copied.value = false), 2000)
    } catch {
      action.fail('Copie impossible : sélectionne la référence à la main.')
    }
  }
</script>

<template>
  <UiCard
    class="grid content-start gap-3"
    aria-labelledby="seller-title"
    data-testid="seller-section"
  >
    <h3 id="seller-title" class="font-display text-base font-bold">
      Qui la vend
    </h3>
    <form class="grid gap-3" novalidate @submit.prevent="save">
      <fieldset class="grid gap-1.5">
        <legend class="mb-1 text-sm font-medium">Vendeur</legend>
        <div class="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
          <UiCheckbox
            v-for="type in types"
            :key="type"
            v-model="sellerType"
            type="radio"
            name="seller-type"
            :value="type"
            :label="SELLER_TYPE_LABELS[type]"
            class="rounded-lg border px-3"
            :class="
              sellerType === type
                ? 'border-accent bg-accent-soft font-medium'
                : 'border-line'
            "
            :data-seller="type"
          />
        </div>
      </fieldset>

      <template v-if="isPro">
        <UiField
          id="seller-name"
          v-model="sellerName"
          :label="nameLabel"
          quiet
          maxlength="120"
          :placeholder="
            sellerType === 'mandatary'
              ? 'Le réseau du mandataire'
              : 'Le nom de l’agence'
          "
          data-testid="seller-name"
        />
        <p class="-mt-1.5 text-xs text-muted">
          Jamais le nom d’une personne : le conseiller ou la conseillère va dans
          le contact de
          <UiButton
            variant="link"
            size="inline"
            class="text-xs"
            data-action="go-todo"
            @click="emit('go', 'a-faire')"
          >
            l’onglet À faire</UiButton
          >.
        </p>
        <div class="grid gap-1.5">
          <label for="seller-reference" class="text-sm"
            >Référence de l’annonce</label
          >
          <div class="flex gap-2">
            <UiInput
              id="seller-reference"
              v-model="sellerReference"
              class="min-w-0 flex-1 font-mono"
              align="left"
              maxlength="60"
              placeholder="EX-2041"
              :described-by="provenance ? 'reference-provenance' : undefined"
              data-testid="seller-reference"
            />
            <UiButton
              :disabled="!savedReference"
              data-action="copy-reference"
              @click="copyReference"
            >
              {{ copied ? 'Copiée' : 'Copier' }}
            </UiButton>
          </div>
          <span
            v-if="provenance"
            id="reference-provenance"
            class="text-xs text-muted"
            data-testid="reference-provenance"
            >{{ provenance }}</span
          >
        </div>
        <p class="text-xs text-muted">
          Une annonce trouvée avec la même agence et la même référence est
          rattachée à cette fiche : pas de doublon.
        </p>
      </template>
      <p
        v-else-if="sellerType === 'private'"
        class="text-sm text-muted"
        data-testid="seller-private"
      >
        Vente entre particuliers : pas de frais d’agence, pas de référence. Une
        même annonce sur un autre portail se reconnaît par l’adresse, ou par la
        surface et le prix.
      </p>
      <p v-else class="text-sm text-muted" data-testid="seller-unknown">
        Pas encore lu. La prochaine tournée de Claude le relèvera sur la page de
        l’annonce.
      </p>

      <UiAlert v-if="action.error.value">{{ action.error.value }}</UiAlert>
      <div v-if="dirty" class="flex flex-wrap justify-end gap-2">
        <UiButton @click="cancel">Annuler</UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :loading="mutations.update.isPending.value"
          loading-label="Enregistrement…"
          data-action="save-seller"
        >
          Enregistrer
        </UiButton>
      </div>
    </form>

    <!-- Lot 27 : les autres agences qui vendent le même bien. -->
    <section
      v-if="hasPrincipal"
      class="grid gap-2.5 border-t border-line pt-3"
      aria-labelledby="other-sellers-title"
      data-testid="other-sellers"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-x-2">
        <h4 id="other-sellers-title" class="text-sm font-semibold">
          Autres agences pour ce bien
        </h4>
        <span
          v-if="countText"
          class="text-xs text-muted"
          data-testid="sellers-count"
          >{{ countText }}</span
        >
      </div>
      <ul v-if="others.length" class="m-0 grid list-none gap-2 p-0">
        <li
          v-for="other in others"
          :key="other.id"
          class="grid gap-1 rounded-lg border border-line px-3 py-2 text-sm"
          :data-other-seller="other.id"
        >
          <span class="font-medium">{{ otherSellerText(other) }}</span>
          <span class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs text-muted">{{
              LISTING_SELLER_ORIGIN_LABELS[other.origin]
            }}</span>
            <UiConfirm
              label="Retirer"
              question="Retirer cette agence ?"
              confirm-label="Oui, retirer"
              cancel-label="Non"
              :busy="removing === other.id"
              data-action="remove-other-seller"
              :confirm-attrs="{ 'data-action': 'confirm-remove-other-seller' }"
              @confirm="removeOther(other.id)"
            />
          </span>
        </li>
      </ul>
      <p v-else-if="!adding" class="text-xs text-muted">
        Un même bien est parfois confié à plusieurs agences, chacune avec sa
        référence : note-les ici, l’annonce sera reconnue sur leurs portails.
      </p>

      <form
        v-if="adding"
        class="grid gap-2.5"
        novalidate
        data-testid="other-seller-form"
        @submit.prevent="addOther"
      >
        <fieldset class="grid gap-1.5">
          <legend class="mb-1 text-sm font-medium">Vendeur</legend>
          <div class="flex flex-wrap gap-1.5">
            <UiCheckbox
              v-for="type in otherTypes"
              :key="type"
              v-model="otherType"
              type="radio"
              name="other-seller-type"
              :value="type"
              :label="SELLER_TYPE_LABELS[type]"
              class="rounded-lg border px-3"
              :class="
                otherType === type
                  ? 'border-accent bg-accent-soft font-medium'
                  : 'border-line'
              "
              :data-other-type="type"
            />
          </div>
        </fieldset>
        <template v-if="otherIsPro">
          <UiField
            id="other-seller-name"
            v-model="otherName"
            :label="otherType === 'mandatary' ? 'Réseau' : 'Agence'"
            quiet
            maxlength="120"
            data-testid="other-seller-name"
          />
          <UiField
            id="other-seller-reference"
            v-model="otherReference"
            label="Sa référence pour ce bien"
            quiet
            maxlength="60"
            placeholder="EX-2041"
            data-testid="other-seller-reference"
          />
        </template>
        <p v-else class="text-sm text-muted">
          Le propriétaire vend aussi en direct (de particulier à particulier).
        </p>
        <UiAlert v-if="otherError" data-testid="other-seller-error">
          {{ otherError }}
        </UiAlert>
        <div class="flex flex-wrap justify-end gap-2">
          <UiButton @click="closeOther">Annuler</UiButton>
          <UiButton
            type="submit"
            variant="primary"
            :loading="merges.addSeller.isPending.value"
            loading-label="Enregistrement…"
            data-action="save-other-seller"
          >
            Ajouter l’agence
          </UiButton>
        </div>
      </form>
      <template v-else>
        <UiAlert v-if="otherError">{{ otherError }}</UiAlert>
        <UiButton
          v-if="canAdd"
          class="justify-self-start"
          size="sm"
          icon="plus"
          data-action="add-other-seller"
          @click="adding = true"
        >
          Ajouter une agence
        </UiButton>
      </template>
    </section>
  </UiCard>
</template>
