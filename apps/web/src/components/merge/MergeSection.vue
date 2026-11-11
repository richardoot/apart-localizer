<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import type { EvaluatedListing, ListingMergeResult } from '@apart/contracts'
  import { mergedBannerText } from '@apart/domain'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'
  import { useAction } from '@/composables/useAction'
  import {
    useListingMerge,
    useSimilarListings,
  } from '@/composables/useListingMerge'
  import { formatDate } from '@/lib/format'
  import { similarLevelText, similarTone } from '@/lib/merge'
  import { useFeedbackStore } from '@/stores/feedback'
  import MergeDialog from './MergeDialog.vue'

  /**
   * Lot 27 (ADR 0037) : « Même bien, autre fiche ? », à droite de l'onglet
   * « Le bien ». Les fiches très proches de celle-ci sont signalées (elles
   * sont peut-être le même bien) ; « Fusionner avec une autre fiche » ouvre
   * la recherche puis l'aperçu ; les doublons déjà fusionnés ici sont listés,
   * chacun avec « Annuler la fusion ». Une fiche elle-même fusionnée dit où
   * elle est passée. La réussite va dans la zone de messages, avec
   * « Annuler ».
   */
  const props = defineProps<{ item: EvaluatedListing }>()

  const router = useRouter()
  const feedback = useFeedbackStore()
  const merges = useListingMerge()
  const action = useAction('L’annulation a échoué.')

  const listingId = computed(() => props.item.listing.id)
  const merged = computed(() => props.item.mergedInto)
  const search = ref('')
  const similar = useSimilarListings(
    computed(() => ({ listingId: listingId.value })),
    search,
    { enabled: computed(() => merged.value === null), limit: 3 }
  )
  /** Seules les fiches très proches valent d'être signalées sans qu'on cherche. */
  const suggestions = computed(() =>
    (similar.data.value?.items ?? []).filter(
      item => item.level === 'certain' || item.level === 'very_close'
    )
  )

  const dialog = ref<{ otherId: string | null } | null>(null)
  const undoing = ref<string | null>(null)

  async function undo(mergeId: string): Promise<void> {
    undoing.value = mergeId
    const result = await action.run(() => merges.undo.mutateAsync(mergeId))
    undoing.value = null
    if (result) feedback.success(`${result.summary}.`)
  }

  function onMerged(result: ListingMergeResult): void {
    dialog.value = null
    const mergeId = result.merge.id
    feedback.success(`${result.summary}.`, {
      undo: () => merges.undo.mutateAsync(mergeId),
    })
    // La fiche ouverte a été fusionnée dans l'autre : on y va.
    if (result.merge.keptId !== listingId.value) {
      void router.push({ name: 'listing', params: { id: result.merge.keptId } })
    }
  }
</script>

<template>
  <UiCard
    class="grid content-start gap-3"
    aria-labelledby="merge-title"
    data-testid="merge-section"
  >
    <h3 id="merge-title" class="font-display text-base font-bold">
      Même bien, autre fiche ?
    </h3>

    <template v-if="merged">
      <p class="text-sm" data-testid="merged-into">
        {{ mergedBannerText(merged.title) }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <UiButton
          :to="{ name: 'listing', params: { id: merged.id } }"
          variant="primary"
          size="sm"
          data-action="open-kept"
          >Ouvrir la fiche gardée</UiButton
        >
        <UiConfirm
          label="Annuler la fusion"
          question="Annuler la fusion ?"
          confirm-label="Oui, annuler la fusion"
          cancel-label="Non"
          :busy="undoing === merged.mergeId"
          data-action="undo-merge"
          :confirm-attrs="{ 'data-action': 'confirm-undo-merge' }"
          @confirm="undo(merged.mergeId)"
        />
      </div>
    </template>

    <template v-else>
      <ul
        v-if="suggestions.length"
        class="m-0 grid list-none gap-2 p-0"
        data-testid="merge-suggestions"
      >
        <li
          v-for="suggestion in suggestions"
          :key="suggestion.listingId"
          class="grid gap-1.5 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn"
        >
          <span
            >Peut-être le même bien que
            <strong>« {{ suggestion.title }} »</strong></span
          >
          <span class="flex flex-wrap items-center gap-2">
            <UiBadge :tone="similarTone(suggestion.level)">{{
              similarLevelText(suggestion)
            }}</UiBadge>
            <UiButton
              size="sm"
              class="border-warn!"
              :data-suggest="suggestion.listingId"
              @click="dialog = { otherId: suggestion.listingId }"
              >Comparer et fusionner</UiButton
            >
          </span>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">
        Deux fiches pour le même bien (deux agences, deux portails) ?
        Fusionne-les : leurs liens, leurs agences et leur suivi se retrouvent
        sur une seule.
      </p>
      <UiButton
        class="justify-self-start"
        icon="search"
        data-action="open-merge"
        @click="dialog = { otherId: null }"
      >
        Fusionner avec une autre fiche
      </UiButton>

      <section
        v-if="item.absorbed.length"
        class="grid gap-2 border-t border-line pt-3"
        data-testid="absorbed-list"
      >
        <h4 class="text-sm font-semibold">Fiches fusionnées ici</h4>
        <ul class="m-0 grid list-none gap-2 p-0">
          <li
            v-for="merge in item.absorbed"
            :key="merge.id"
            class="grid gap-1 text-sm"
            :data-merge="merge.id"
          >
            <RouterLink
              :to="{ name: 'listing', params: { id: merge.absorbedId } }"
              class="font-medium text-accent underline-offset-2 hover:underline"
              >{{ merge.absorbedTitle }}</RouterLink
            >
            <span class="text-xs text-muted"
              >Fusionnée le {{ formatDate(merge.mergedAt)
              }}{{ merge.channel === 'mcp' ? ' par Claude' : '' }}</span
            >
            <span>
              <UiConfirm
                label="Annuler la fusion"
                question="Annuler cette fusion ?"
                confirm-label="Oui, annuler"
                cancel-label="Non"
                :busy="undoing === merge.id"
                data-action="undo-merge"
                :confirm-attrs="{ 'data-action': 'confirm-undo-merge' }"
                @confirm="undo(merge.id)"
              />
            </span>
          </li>
        </ul>
      </section>
    </template>

    <UiAlert v-if="action.error.value">{{ action.error.value }}</UiAlert>

    <MergeDialog
      v-if="dialog"
      :item="item"
      :other-id="dialog.otherId"
      @close="dialog = null"
      @merged="onMerged"
    />
  </UiCard>
</template>
