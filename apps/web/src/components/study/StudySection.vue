<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { Assumptions, EvaluatedListing } from '@apart/contracts'
  import { useStudyInput } from '@/composables/useStudy'
  import CompliancePanel from './CompliancePanel.vue'
  import OccupancyPanel from './OccupancyPanel.vue'
  import ProjectionPanel from './ProjectionPanel.vue'
  import RentMarketPanel from './RentMarketPanel.vue'
  import ScenariosPanel from './ScenariosPanel.vue'

  /**
   * L'étude d'une annonce dans le temps (lot 5), en onglets : phase 1,
   * scénarios « et si », projection jusqu'à la revente, loyer de marché,
   * conformité. Les trois premiers sont calculés dans le navigateur par
   * `domain` ; les deux derniers par le serveur, chargés à l'ouverture de
   * l'onglet seulement.
   */
  const props = defineProps<{
    item: EvaluatedListing
    assumptions: Assumptions | null
    busy?: boolean
  }>()
  const emit = defineEmits<{ retainMarketRent: [rent: number] }>()

  const TABS = [
    { key: 'phase1', label: 'Phase 1' },
    { key: 'scenarios', label: 'Scénarios' },
    { key: 'projection', label: 'Projection' },
    { key: 'market', label: 'Loyer de marché' },
    { key: 'compliance', label: 'Conformité' },
  ] as const
  type TabKey = (typeof TABS)[number]['key']
  const active = ref<TabKey>('phase1')

  const study = useStudyInput(
    computed(() => props.item.listing),
    computed(() => props.assumptions)
  )
  const furnished = computed(
    () =>
      (props.item.listing.rentalPlan?.leaseType ?? 'unfurnished') !==
      'unfurnished'
  )

  function onKey(event: KeyboardEvent): void {
    const index = TABS.findIndex(t => t.key === active.value)
    const next =
      event.key === 'ArrowRight'
        ? index + 1
        : event.key === 'ArrowLeft'
          ? index - 1
          : null
    if (next === null) return
    active.value = TABS[(next + TABS.length) % TABS.length]?.key ?? 'phase1'
  }
</script>

<template>
  <section
    class="grid gap-3 rounded-xl border border-line p-4"
    aria-label="Étude : phase 1, scénarios, projection, loyer de marché, conformité"
  >
    <div
      class="flex flex-wrap gap-1"
      role="tablist"
      aria-label="Étude de l’annonce"
      @keydown="onKey"
    >
      <button
        v-for="tab in TABS"
        :id="`study-tab-${tab.key}`"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="active === tab.key"
        :aria-controls="`study-panel-${tab.key}`"
        :tabindex="active === tab.key ? 0 : -1"
        class="rounded-lg px-3 py-1.5 text-sm"
        :class="
          active === tab.key
            ? 'bg-accent text-accent-fg'
            : 'border border-line text-muted hover:text-fg'
        "
        @click="active = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>
    <div
      :id="`study-panel-${active}`"
      role="tabpanel"
      :aria-labelledby="`study-tab-${active}`"
    >
      <p
        v-if="!study && active !== 'market' && active !== 'compliance'"
        class="text-sm text-muted"
      >
        Chargement des hypothèses…
      </p>
      <OccupancyPanel
        v-else-if="active === 'phase1' && study"
        :input="study.input"
        :assumptions="study.assumptions"
        :listing-id="item.listing.id"
      />
      <ScenariosPanel
        v-else-if="active === 'scenarios' && study"
        :listing-id="item.listing.id"
        :title="item.listing.title"
        :input="study.input"
        :assumptions="study.assumptions"
      />
      <ProjectionPanel
        v-else-if="active === 'projection' && study"
        :listing-id="item.listing.id"
        :title="item.listing.title"
        :input="study.input"
        :assumptions="study.assumptions"
      />
      <RentMarketPanel
        v-else-if="active === 'market'"
        :listing-id="item.listing.id"
        :furnished="furnished"
        :current-market-rent="item.listing.rentalPlan?.marketRent ?? null"
        :busy="busy"
        @retain="rent => emit('retainMarketRent', rent)"
      />
      <CompliancePanel
        v-else-if="active === 'compliance'"
        :listing-id="item.listing.id"
      />
    </div>
  </section>
</template>
