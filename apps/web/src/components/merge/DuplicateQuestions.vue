<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import type { EvaluatedListing, ListingMergeResult } from '@apart/contracts'
  import { duplicateQuestionText } from '@apart/domain'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { useAction } from '@/composables/useAction'
  import { useListingMerge } from '@/composables/useListingMerge'
  import { useFeedbackStore } from '@/stores/feedback'
  import MergeDialog from './MergeDialog.vue'

  /**
   * Lot 30 (ADR 0043) : en haut de la fiche, la question « même bien ? »
   * posée quand Claude a enregistré l'annonce malgré un doublon probable. Les
   * deux fiches la portent. « Oui, comparer et fusionner » ouvre l'aperçu de
   * la fusion (lot 27) ; « Non, deux biens différents » tranche : la paire
   * n'est plus signalée. Une fiche fusionnée ne pose plus de question.
   */
  const props = defineProps<{ item: EvaluatedListing }>()

  const router = useRouter()
  const feedback = useFeedbackStore()
  const merges = useListingMerge()
  const action = useAction('La réponse n’a pas été enregistrée.')

  const listingId = computed(() => props.item.listing.id)
  const questions = computed(() =>
    props.item.mergedInto ? [] : props.item.duplicateQuestions
  )
  const comparing = ref<string | null>(null)
  const answering = ref<string | null>(null)

  async function distinct(otherId: string, otherTitle: string): Promise<void> {
    answering.value = otherId
    const result = await action.run(() =>
      merges.distinct.mutateAsync({ listingId: listingId.value, otherId })
    )
    answering.value = null
    if (result) {
      feedback.success(
        `C’est noté : « ${otherTitle} » est un autre bien, elle ne sera plus signalée comme doublon.`
      )
    }
  }

  function onMerged(result: ListingMergeResult): void {
    comparing.value = null
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
  <div
    v-if="questions.length"
    class="grid gap-2"
    data-testid="duplicate-questions"
  >
    <UiAlert
      v-for="question in questions"
      :key="question.id"
      tone="warn"
      :data-question="question.otherId"
    >
      {{ duplicateQuestionText(question.otherTitle, question.askedChannel) }}
      <template #actions>
        <UiButton
          size="sm"
          variant="primary"
          data-action="duplicate-compare"
          @click="comparing = question.otherId"
          >Oui, comparer et fusionner</UiButton
        >
        <UiButton
          size="sm"
          data-action="duplicate-distinct"
          :loading="answering === question.otherId"
          @click="distinct(question.otherId, question.otherTitle)"
          >Non, deux biens différents</UiButton
        >
        <UiButton
          size="sm"
          variant="ghost"
          :to="{ name: 'listing', params: { id: question.otherId } }"
          data-action="duplicate-open"
          >Voir l’autre fiche</UiButton
        >
      </template>
    </UiAlert>
    <UiAlert v-if="action.error.value">{{ action.error.value }}</UiAlert>

    <MergeDialog
      v-if="comparing"
      :item="item"
      :other-id="comparing"
      @close="comparing = null"
      @merged="onMerged"
    />
  </div>
</template>
