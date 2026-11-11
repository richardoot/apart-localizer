<script setup lang="ts">
  import { computed, inject, ref } from 'vue'
  import type {
    Assumptions,
    EvaluatedListing,
    ListingEvaluation,
    ListingStatus,
    NegotiationBrief,
    OfferInputRaw,
    OfferUpdate,
    SensitivityAxis,
    TargetPrice,
    TargetPriceRank,
  } from '@apart/contracts'
  import { financialsFromListing } from '@apart/domain'
  import { LISTING_EDITOR } from '@/composables/useListingEditor'
  import { useSensitivity } from '@/composables/useListings'
  import type { ListingTab } from '@/lib/listing-tabs'
  import UiAlert from '@/components/ui/UiAlert.vue'
  import HistorySection from '../HistorySection.vue'
  import SensitivityTable from '../SensitivityTable.vue'
  import TargetPriceSection from '../TargetPriceSection.vue'
  import MarketSales from '../negotiate/MarketSales.vue'
  import NegotiationArguments from '../negotiate/NegotiationArguments.vue'

  /**
   * Lot 19 (ADR 0029) : « Négocier : combien proposer ? ». Le prix cible et sa
   * jauge, les ventes comparables (DVF) et les arguments du brief, les prix
   * et les offres avec « Préparer une offre » (coût, mensualité et verdict au
   * montant choisi, par `domain`), et la sensibilité repliée, demandée au
   * serveur seulement à son ouverture. Pendant une modification de la fiche,
   * l'aperçu en direct.
   */
  const props = defineProps<{
    item: EvaluatedListing
    evaluation: ListingEvaluation | null
    targetPrice: TargetPrice | null
    negotiation: NegotiationBrief | null
    rank: TargetPriceRank | null
    assumptions: Assumptions | null
    live?: boolean
    busy?: boolean
    suggestedStatus?: ListingStatus | null
    /** Lot 22 : l'échec du dernier prix ou de la dernière offre, sous « Prix et offres ». */
    error?: string | null
  }>()
  const emit = defineEmits<{
    go: [tab: ListingTab]
    recordPrice: [newPrice: number]
    addOffer: [input: OfferInputRaw]
    updateOffer: [offerId: string, update: OfferUpdate]
    setStatus: [status: ListingStatus]
  }>()

  // L'éditeur de la fiche (aperçu en direct), s'il est fourni.
  const editor = inject(LISTING_EDITOR, null)
  const financials = computed(() => {
    const preview = editor?.preview.value.financials ?? null
    return props.live && preview
      ? preview
      : financialsFromListing(props.item.listing)
  })
  const price = computed(
    () => props.evaluation?.metrics.price ?? props.item.listing.price
  )

  // La sensibilité : axes au choix, recalculée côté serveur avec la ligne du
  // prix cible ; la requête ne part qu'à l'ouverture du dépli.
  const sensitivityOpen = ref(false)
  const rowAxis = ref<SensitivityAxis>('price')
  const colAxis = ref<SensitivityAxis>('rent')
  const sensitivity = useSensitivity(
    computed(() => (sensitivityOpen.value ? props.item.listing.id : null)),
    computed(() => ({
      rowAxis: rowAxis.value,
      colAxis: colAxis.value,
      includeTargetPrice: true,
    }))
  )
  function onToggle(event: Event): void {
    sensitivityOpen.value = (event.target as HTMLDetailsElement).open
  }
</script>

<template>
  <div class="@container grid gap-4" data-testid="tab-negotiate">
    <TargetPriceSection
      :price="price"
      :target-price="targetPrice"
      :negotiation="negotiation"
      :rank="live ? null : rank"
      :notary-fees="evaluation?.metrics.notaryFeesDetail ?? null"
      :assumptions="assumptions"
      :rent="evaluation?.metrics.rent ?? 0"
      :live="live"
    />

    <div
      class="grid gap-4 @4xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] @4xl:items-start"
    >
      <MarketSales :listing-id="item.listing.id" @go="tab => emit('go', tab)" />
      <NegotiationArguments
        :title="item.listing.title"
        :price="price"
        :target-price="targetPrice"
        :negotiation="negotiation"
      />
    </div>

    <HistorySection
      :events="item.priceEvents"
      :offers="item.offers"
      :current-price="item.listing.price"
      :suggested-status="suggestedStatus ?? null"
      :busy="busy"
      :financials="financials"
      :assumptions="assumptions"
      :suggested-offer="negotiation?.suggestedOffer ?? null"
      :target-price="targetPrice?.targetPrice ?? null"
      @record="newPrice => emit('recordPrice', newPrice)"
      @add-offer="input => emit('addOffer', input)"
      @update-offer="(offerId, update) => emit('updateOffer', offerId, update)"
      @set-status="status => emit('setStatus', status)"
    />
    <UiAlert v-if="error" data-testid="negotiate-error">{{ error }}</UiAlert>

    <details
      class="rounded-2xl border border-line bg-surface px-4 sm:px-5"
      data-testid="sensitivity"
      @toggle="onToggle"
    >
      <summary
        class="flex min-h-[52px] cursor-pointer items-center text-base font-semibold"
      >
        Sensibilité : prix et taux, prix et loyer
      </summary>
      <div class="pb-4">
        <SensitivityTable
          v-if="sensitivityOpen"
          v-model:row-axis="rowAxis"
          v-model:col-axis="colAxis"
          :grid="sensitivity.data.value ?? null"
          :loading="sensitivity.isFetching.value"
          bare
        />
      </div>
    </details>
  </div>
</template>
