<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    Assumptions,
    EvaluatedListing,
    ListingEvaluation,
    TargetPrice,
  } from '@apart/contracts'
  import { monthlyPaymentSplit } from '@apart/domain'
  import OccupancyPanel from '@/components/study/OccupancyPanel.vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import { useStudyInput } from '@/composables/useStudy'
  import { assumptionsBanner } from '@/lib/budget'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCard from '@/components/ui/UiCard.vue'
  import UiSkeleton from '@/components/ui/UiSkeleton.vue'
  import type { ListingTab } from '@/lib/listing-tabs'
  import CostSummary from '../CostSummary.vue'
  import RentalPhaseSection from '../budget/RentalPhaseSection.vue'
  import YieldSection from '../budget/YieldSection.vue'

  /**
   * Lot 19 (ADR 0029) : « Budget : peut-on se le permettre, et après ? ».
   * Le bandeau des hypothèses de l'espace (avec lesquelles tout est
   * calculé : plus d'hypothèses propres à une annonce), « À l'achat », la
   * phase 1 (y habiter) et la phase 2 (la louer, modifiable sur place), le
   * rendement et la projection par scénario. Les chiffres suivent l'aperçu
   * en direct pendant une modification ; tout vient de `domain`.
   */
  const props = defineProps<{
    item: EvaluatedListing
    evaluation: ListingEvaluation | null
    targetPrice: TargetPrice | null
    assumptions: Assumptions | null
    live?: boolean
    busy?: boolean
    /** Lot 22 : l'échec de « Retenir » le loyer de marché, dit dans la phase 2. */
    error?: string | null
  }>()
  const emit = defineEmits<{
    go: [tab: ListingTab]
    retainMarketRent: [rent: number]
  }>()

  const editor = useListingEditor()
  const banner = computed(() =>
    props.assumptions ? assumptionsBanner(props.assumptions) : null
  )
  const payment = computed(() =>
    props.evaluation && props.assumptions
      ? monthlyPaymentSplit(
          props.evaluation.metrics.loanAmount,
          props.assumptions
        )
      : null
  )
  /** L'entrée de la phase 1 ; pendant une modification, les chiffres de l'aperçu. */
  const study = useStudyInput(
    computed(() => props.item.listing),
    computed(() => props.assumptions)
  )
  const occupancyInput = computed(() => {
    if (!study.value) return null
    const preview = editor.preview.value.financials
    return props.live && preview
      ? { ...study.value.input, financials: preview }
      : study.value.input
  })
  /** Les honoraires à la charge de l'acquéreur, compris dans le prix affiché. */
  const fees = computed(() =>
    props.live
      ? (editor.preview.value.financials?.buyerFees ?? null)
      : props.item.listing.feesPayer === 'seller'
        ? null
        : props.item.listing.feesAmount
  )
</script>

<template>
  <div class="@container grid gap-4" data-testid="tab-budget">
    <p
      class="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-2xl bg-surface-2 px-4 py-2.5 text-sm text-fg"
      data-testid="budget-assumptions"
    >
      <span v-if="banner"
        >Calculé avec les hypothèses de l’espace : {{ banner }}.</span
      >
      <span v-else class="min-w-40 flex-1" role="status" aria-busy="true"
        ><span class="sr-only">Chargement des hypothèses…</span
        ><UiSkeleton :count="1"
      /></span>
      <UiButton
        :to="{ name: 'assumptions' }"
        variant="link"
        data-testid="edit-assumptions"
        >Modifier les hypothèses</UiButton
      >
    </p>

    <CostSummary
      v-if="evaluation"
      :metrics="evaluation.metrics"
      :assumptions="assumptions"
      :payment="payment"
      :fees-amount="fees"
      @works="emit('go', 'bien')"
    />
    <p v-else class="text-sm text-muted">
      Saisis un prix et un loyer visé pour voir les indicateurs.
    </p>

    <div class="grid gap-4 @3xl:grid-cols-2 @3xl:items-start">
      <UiCard title="Phase 1 : y habiter" data-testid="phase1">
        <OccupancyPanel
          v-if="occupancyInput && study"
          :input="occupancyInput"
          :assumptions="study.assumptions"
          :listing-id="item.listing.id"
        />
        <div v-else role="status" aria-busy="true">
          <span class="sr-only">Chargement des hypothèses…</span>
          <UiSkeleton />
        </div>
      </UiCard>
      <div class="grid gap-3">
        <RentalPhaseSection
          :item="item"
          :evaluation="evaluation"
          :assumptions="assumptions"
          :busy="busy"
          @retain-market-rent="rent => emit('retainMarketRent', rent)"
        />
        <UiAlert v-if="error" data-testid="budget-error">{{ error }}</UiAlert>
      </div>
    </div>

    <YieldSection
      :item="item"
      :evaluation="evaluation"
      :assumptions="assumptions"
      :live="live"
    />
  </div>
</template>
