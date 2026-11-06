<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { SELLER_TYPE_LABELS, SellerTypeSchema } from '@apart/contracts'
  import type { EvaluatedListing, SellerType } from '@apart/contracts'
  import { referenceProvenanceText, sellerNameLabel } from '@apart/domain'
  import { useListingMutations } from '@/composables/useListings'
  import { ApiError } from '@/lib/api'
  import type { ListingTab } from '@/lib/listing-tabs'

  /**
   * Lot 18 : « Qui la vend », dans la Synthèse de la fiche. Agence,
   * mandataire, particulier ou inconnu (par défaut, jamais deviné) ; le nom
   * de l'agence ou du réseau (jamais celui d'une personne : il va dans le
   * contact de l'onglet Échanges) et la référence de l'annonce, avec
   * « Copier » et d'où elle vient. La référence sert à reconnaître la même
   * annonce sur un autre portail ; un particulier n'en a pas (champs
   * masqués). Enregistré avec le garde-fou `expectedUpdatedAt`.
   */
  const props = defineProps<{ item: EvaluatedListing }>()
  const emit = defineEmits<{ go: [tab: ListingTab] }>()

  const mutations = useListingMutations()
  const types = SellerTypeSchema.options

  const sellerType = ref<SellerType>('unknown')
  const sellerName = ref('')
  const sellerReference = ref('')
  const failure = ref<string | null>(null)
  const notice = ref<string | null>(null)
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
    failure.value = null
    notice.value = null
    const name = sellerName.value.trim()
    const reference = sellerReference.value.trim()
    try {
      await mutations.update.mutateAsync({
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
      })
      notice.value = 'Vendeur enregistré.'
    } catch (error) {
      failure.value =
        error instanceof ApiError ? error.message : 'L’enregistrement a échoué.'
    }
  }

  function cancel(): void {
    sellerType.value = props.item.listing.sellerType
    sellerName.value = props.item.listing.sellerName ?? ''
    sellerReference.value = props.item.listing.sellerReference ?? ''
    failure.value = null
  }

  async function copyReference(): Promise<void> {
    const reference = savedReference.value
    if (!reference) return
    try {
      await navigator.clipboard.writeText(reference)
      copied.value = true
      window.setTimeout(() => (copied.value = false), 2000)
    } catch {
      failure.value = 'Copie impossible : sélectionnez la référence à la main.'
    }
  }
</script>

<template>
  <section
    class="grid content-start gap-3 rounded-2xl border border-line bg-surface p-4"
    aria-labelledby="seller-title"
    data-testid="seller-section"
  >
    <h3 id="seller-title" class="font-display text-base font-semibold">
      Qui la vend
    </h3>
    <form class="grid gap-3" @submit.prevent="save">
      <fieldset class="grid gap-1.5">
        <legend class="mb-1 text-xs font-medium text-muted">Vendeur</legend>
        <div class="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
          <label
            v-for="type in types"
            :key="type"
            class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm sm:min-h-9"
            :class="
              sellerType === type
                ? 'border-accent bg-accent-soft font-medium'
                : 'border-line'
            "
          >
            <input
              v-model="sellerType"
              type="radio"
              name="seller-type"
              :value="type"
              class="accent-accent"
              :data-seller="type"
            />
            {{ SELLER_TYPE_LABELS[type] }}
          </label>
        </div>
      </fieldset>

      <template v-if="isPro">
        <div class="grid gap-1">
          <label for="seller-name" class="text-xs font-medium text-muted">{{
            nameLabel
          }}</label>
          <input
            id="seller-name"
            v-model="sellerName"
            type="text"
            maxlength="120"
            :placeholder="
              sellerType === 'mandatary'
                ? 'Le réseau du mandataire'
                : 'Le nom de l’agence'
            "
            class="min-h-11 rounded-lg border border-line bg-bg px-3 text-sm sm:min-h-9"
            data-testid="seller-name"
          />
          <span class="text-xs text-muted">
            Jamais le nom d’une personne : le conseiller ou la conseillère va
            dans le contact de
            <button
              type="button"
              class="text-accent underline underline-offset-2"
              data-action="go-todo"
              @click="emit('go', 'a-faire')"
            >
              l’onglet À faire</button
            >.
          </span>
        </div>
        <div class="grid gap-1">
          <label for="seller-reference" class="text-xs font-medium text-muted"
            >Référence de l’annonce</label
          >
          <div class="flex gap-2">
            <input
              id="seller-reference"
              v-model="sellerReference"
              type="text"
              maxlength="60"
              placeholder="EX-2041"
              class="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono text-sm sm:min-h-9"
              data-testid="seller-reference"
            />
            <button
              type="button"
              class="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm hover:bg-surface-2 disabled:opacity-60 sm:min-h-9"
              :disabled="!savedReference"
              data-action="copy-reference"
              @click="copyReference"
            >
              {{ copied ? 'Copiée' : 'Copier' }}
            </button>
          </div>
          <span
            v-if="provenance"
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

      <p
        v-if="failure"
        role="alert"
        class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {{ failure }}
      </p>
      <p
        v-else-if="notice && !dirty"
        class="text-sm text-good"
        aria-live="polite"
      >
        {{ notice }}
      </p>
      <div v-if="dirty" class="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm sm:min-h-9"
          @click="cancel"
        >
          Annuler
        </button>
        <button
          type="submit"
          class="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-60 sm:min-h-9"
          :disabled="mutations.update.isPending.value"
          data-action="save-seller"
        >
          {{
            mutations.update.isPending.value ? 'Enregistrement…' : 'Enregistrer'
          }}
        </button>
      </div>
    </form>
  </section>
</template>
