<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type {
    EvaluatedListing,
    ListingMergeResult,
    ListingMergeSide,
  } from '@apart/contracts'
  import {
    LISTING_STATUS_LABELS,
    MERGED_LISTING_RETENTION_DAYS,
  } from '@apart/contracts'
  import QueryState from '@/components/ui/QueryState.vue'
  import SidePanel from '@/components/ui/SidePanel.vue'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { useAction } from '@/composables/useAction'
  import {
    useListingMerge,
    useMergePreview,
  } from '@/composables/useListingMerge'
  import { mergeSideFacts, mergeSideHistory } from '@/lib/merge'
  import SimilarListingPicker from './SimilarListingPicker.vue'

  /**
   * Lot 27 (ADR 0037) : fusionner la fiche ouverte avec une autre fiche du
   * même bien. Deux temps : retrouver l'autre fiche (« Déjà vue », classée
   * par ressemblance), puis lire ce que la fusion fera — laquelle est gardée
   * (la plus avancée est proposée, le choix reste au membre), ce qui la
   * rejoint, les champs complétés, ceux qui diffèrent, les agences, ce qui
   * reste — avant de confirmer. Le doublon est caché des listes, la fusion
   * s'annule pendant sept jours, puis le doublon est supprimé (lot 30).
   * Aucune règle ici : l'aperçu vient de l'API.
   */
  const props = defineProps<{
    item: EvaluatedListing
    /** Une autre fiche déjà désignée (suggestion) : on passe à l'aperçu. */
    otherId?: string | null
  }>()
  const emit = defineEmits<{
    close: []
    merged: [result: ListingMergeResult]
  }>()

  const currentId = computed(() => props.item.listing.id)
  const otherId = ref<string | null>(props.otherId ?? null)
  /** La fiche gardée ; null tant que l'aperçu n'a pas dit laquelle proposer. */
  const keepChoice = ref<string | null>(null)

  const keepId = computed(() => keepChoice.value ?? currentId.value)
  const absorbedId = computed(() =>
    otherId.value === null
      ? null
      : keepId.value === currentId.value
        ? otherId.value
        : currentId.value
  )
  const preview = useMergePreview(
    computed(() => (otherId.value ? keepId.value : null)),
    absorbedId
  )
  const data = computed(() => preview.data.value ?? null)

  // La fiche proposée est choisie une fois, à la première lecture.
  watch(data, value => {
    if (value && keepChoice.value === null) {
      keepChoice.value = value.suggestedKeepId
    }
  })

  const sides = computed<ListingMergeSide[]>(() =>
    data.value ? [data.value.keep, data.value.absorb] : []
  )
  const merges = useListingMerge()
  const action = useAction('La fusion a échoué.')

  function back(): void {
    otherId.value = null
    keepChoice.value = null
    action.clear()
  }

  async function confirm(): Promise<void> {
    const value = data.value
    if (!value || value.refusal) return
    const result = await action.run(() =>
      merges.merge.mutateAsync({
        keepId: value.keep.id,
        input: {
          absorbedId: value.absorb.id,
          expectedUpdatedAt: value.keep.updatedAt,
          expectedAbsorbedUpdatedAt: value.absorb.updatedAt,
        },
      })
    )
    if (result) emit('merged', result)
  }
</script>

<template>
  <SidePanel
    :title="
      otherId ? 'Fusionner les deux fiches' : 'Fusionner avec une autre fiche'
    "
    @close="emit('close')"
  >
    <div v-if="!otherId" class="grid gap-3" data-testid="merge-search">
      <p class="text-sm text-muted">
        Retrouve l’autre fiche du même bien : les plus ressemblantes à «
        {{ item.listing.title }} » sont proposées d’abord.
      </p>
      <SimilarListingPicker
        :target="{ listingId: currentId }"
        action-label="Comparer et fusionner"
        @pick="similar => (otherId = similar.listingId)"
      />
    </div>

    <div v-else class="grid gap-4" data-testid="merge-preview">
      <QueryState
        :query="preview"
        skeleton="cards"
        :skeleton-count="2"
        loading-label="ce que la fusion ferait"
        error-fallback="Impossible de préparer la fusion."
      >
        <template v-if="data">
          <UiAlert v-if="data.refusal" data-testid="merge-refusal">
            {{ data.refusal }}
          </UiAlert>
          <fieldset class="grid gap-2">
            <legend class="mb-1 text-sm font-medium">
              Quelle fiche garder ?
            </legend>
            <label
              v-for="side in sides"
              :key="side.id"
              class="grid cursor-pointer gap-1 rounded-xl border px-3.5 py-3"
              :class="
                side.id === keepId
                  ? 'border-accent bg-accent-soft'
                  : 'border-line bg-surface'
              "
              :data-side="side.id"
            >
              <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <input
                  v-model="keepChoice"
                  type="radio"
                  name="merge-keep"
                  class="size-4 accent-[var(--color-accent)]"
                  :value="side.id"
                  :data-keep="side.id"
                />
                <span class="min-w-0 flex-1 font-semibold">{{
                  side.title
                }}</span>
                <UiBadge :tone="side.id === keepId ? 'accent' : 'neutral'">{{
                  side.id === keepId ? 'Gardée' : 'Fusionnée dedans'
                }}</UiBadge>
              </span>
              <span class="text-sm text-muted"
                >{{ mergeSideFacts(side) }} ·
                {{ LISTING_STATUS_LABELS[side.status] }}</span
              >
              <span class="text-sm text-muted">{{
                mergeSideHistory(side)
              }}</span>
              <span
                v-if="side.id === data.suggestedKeepId"
                class="text-xs text-accent"
                data-testid="merge-suggestion"
                >Conseillée : {{ data.suggestionReason }}.</span
              >
            </label>
          </fieldset>

          <section class="grid gap-1.5" data-testid="merge-moves">
            <h3 class="text-sm font-semibold">
              Ce qui rejoint « {{ data.keep.title }} »
            </h3>
            <ul
              v-if="data.moves.length"
              class="m-0 ml-4.5 list-disc p-0 text-sm"
            >
              <li v-for="line in data.moves" :key="line">{{ line }}</li>
            </ul>
            <p v-else class="text-sm text-muted">
              Rien à reprendre : l’autre fiche est seulement retirée des listes.
            </p>
          </section>

          <section
            v-if="data.sellers.length"
            class="grid gap-1.5"
            data-testid="merge-sellers"
          >
            <h3 class="text-sm font-semibold">Qui la vend, après la fusion</h3>
            <ul class="m-0 ml-4.5 list-disc p-0 text-sm">
              <li v-for="line in data.sellers" :key="line">{{ line }}</li>
            </ul>
          </section>

          <section
            v-if="data.fills.length"
            class="grid gap-1.5"
            data-testid="merge-fills"
          >
            <h3 class="text-sm font-semibold">Champs vides complétés</h3>
            <ul class="m-0 ml-4.5 list-disc p-0 text-sm">
              <li v-for="field in data.fills" :key="field.field">
                {{ field.label }} : {{ field.other }}
              </li>
            </ul>
          </section>

          <section
            v-if="data.differences.length"
            class="grid gap-1.5"
            data-testid="merge-differences"
          >
            <h3 class="text-sm font-semibold">
              Ce qui diffère : la fiche gardée l’emporte
            </h3>
            <ul class="m-0 ml-4.5 list-disc p-0 text-sm">
              <li v-for="field in data.differences" :key="field.field">
                {{ field.label }} : {{ field.kept }}
                <span class="text-muted"
                  >(l’autre disait {{ field.other }})</span
                >
              </li>
            </ul>
          </section>

          <section class="grid gap-1.5 text-sm text-muted">
            <p v-for="line in data.leftBehind" :key="line">{{ line }}</p>
            <p>
              « {{ data.absorb.title }} » est retirée des listes ; la fusion
              s’annule depuis la fiche gardée pendant
              {{ MERGED_LISTING_RETENTION_DAYS }} jours, puis cette fiche est
              supprimée.
            </p>
          </section>
        </template>
      </QueryState>
      <UiAlert v-if="action.error.value" data-testid="merge-error">
        {{ action.error.value }}
      </UiAlert>
    </div>

    <template v-if="otherId" #footer>
      <div class="flex flex-wrap justify-between gap-2">
        <UiButton icon="arrow-left" data-action="merge-back" @click="back">
          Choisir une autre fiche
        </UiButton>
        <UiButton
          variant="primary"
          :disabled="!data || data.refusal !== null"
          :loading="action.pending.value"
          loading-label="Fusion…"
          data-action="merge-confirm"
          @click="confirm"
        >
          Fusionner les deux fiches
        </UiButton>
      </div>
    </template>
  </SidePanel>
</template>
