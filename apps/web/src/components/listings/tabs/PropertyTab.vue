<script setup lang="ts">
  import { computed } from 'vue'
  import type { EvaluatedListing } from '@apart/contracts'
  import { useListingEditor } from '@/composables/useListingEditor'
  import type { ListingTab } from '@/lib/listing-tabs'
  import ListingLinksSection from '../ListingLinksSection.vue'
  import SellerSection from '../SellerSection.vue'
  import CoproSection from '../property/CoproSection.vue'
  import EnergySection from '../property/EnergySection.vue'
  import FeaturesSection from '../property/FeaturesSection.vue'
  import ListingInfoSection from '../property/ListingInfoSection.vue'
  import NotesSection from '../property/NotesSection.vue'
  import WorksSection from '../property/WorksSection.vue'

  /**
   * Lot 19 (ADR 0029) : « Le bien : qu'est-ce qu'on achète ? ». Les travaux
   * avant d'emménager en tête, puis les caractéristiques, l'énergie, la
   * copropriété et les charges, l'annonce et son adresse, et le dépli de la
   * description et de nos notes ; chaque section se modifie sur place. À
   * droite : « Où la trouver » et « Qui la vend » (lot 18).
   */
  const props = defineProps<{ item: EvaluatedListing }>()
  const emit = defineEmits<{ go: [tab: ListingTab] }>()

  const editor = useListingEditor()
  /** Au moins un champ lu par l'IA : la légende de la marque « IA ». */
  const hasAi = computed(() =>
    Object.values(editor.fieldSources.value ?? {}).some(p => p.source === 'ai')
  )
  const go = (tab: ListingTab) => emit('go', tab)
  const listing = computed(() => props.item.listing)
</script>

<template>
  <div class="@container grid gap-4" data-testid="tab-property">
    <p
      v-if="hasAi"
      class="-mt-2 flex items-center gap-1.5 text-xs text-muted"
      data-testid="ai-legend"
    >
      <span
        aria-hidden="true"
        class="rounded-md bg-ai-soft px-1.5 text-xs leading-[18px] font-semibold text-ai"
        >IA</span
      >
      valeur lue par l’IA dans l’annonce, à confirmer
    </p>
    <div
      class="grid gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] @4xl:items-start"
    >
      <div class="grid min-w-0 gap-4">
        <WorksSection :listing="listing" @go="go" />
        <FeaturesSection :listing="listing" />
        <EnergySection :listing="listing" />
        <CoproSection :listing="listing" :tasks="item.tasks" @go="go" />
        <ListingInfoSection :listing="listing" />
        <NotesSection :listing="listing" />
      </div>
      <aside
        class="grid min-w-0 content-start gap-4"
        aria-label="Où et par qui"
      >
        <ListingLinksSection :item="item" />
        <SellerSection :item="item" @go="go" />
      </aside>
    </div>
  </div>
</template>
