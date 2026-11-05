<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    Assumptions,
    EvaluatedListing,
    ListingEvaluation,
    NegotiationBrief,
    TargetPrice,
  } from '@apart/contracts'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import { readingOf } from '@/composables/useListingReading'
  import { formatDistance, formatEurosPerM2 } from '@/lib/format'
  import type { ListingTab } from '@/lib/listing-tabs'
  import AtTargetPanel from './AtTargetPanel.vue'
  import CostBasisBadge from './CostBasisBadge.vue'
  import CostSummary from './CostSummary.vue'
  import NegotiationSummary from './NegotiationSummary.vue'
  import ProfitabilitySummary from './ProfitabilitySummary.vue'
  import RentalPill from './RentalPill.vue'

  /**
   * L'onglet Synthèse de la fiche (lot 9) : les deux bases de calcul
   * expliquées, trois blocs (« Combien négocier ? » sur le prix, « Combien ça
   * coûte ? » et « Est-ce rentable ? » tout compris), le pont « Et au prix
   * cible ? », puis les résumés louabilité, suivi et quartier (lot 11 :
   * quartier et équipements proches) qui mènent aux
   * autres onglets. Les valeurs viennent de l'évaluation (serveur) ou de
   * l'aperçu en direct, la lecture de `domain` (`readingOf`).
   */
  const props = defineProps<{
    item: EvaluatedListing
    evaluation: ListingEvaluation | null
    targetPrice: TargetPrice | null
    negotiation: NegotiationBrief | null
    assumptions: Assumptions | null
    /** Vrai pendant l'édition : valeurs de l'aperçu en direct. */
    live?: boolean
  }>()
  const emit = defineEmits<{ go: [tab: ListingTab] }>()

  const reading = computed(() =>
    readingOf(props.evaluation, props.targetPrice, props.assumptions)
  )

  const openTasks = computed(() => props.item.tasks.filter(t => !t.done))
  const nextTask = computed(
    () =>
      [...openTasks.value].sort((a, b) => a.position - b.position)[0] ?? null
  )
  const rentalCounts = computed(() => {
    const checks = props.evaluation?.rental.checks ?? []
    return {
      bad: checks.filter(c => c.level === 'bad').length,
      warn: checks.filter(c => c.level === 'warn').length,
      unknown: checks.filter(c => c.level === 'unknown').length,
    }
  })
  const tram = computed(
    () => props.item.listing.openDataContext?.transit?.nearestTram ?? null
  )
  const marketMedian = computed(
    () => props.item.listing.openDataContext?.market?.medianPricePerM2 ?? null
  )
  /** Lot 11 : quartier et équipements de l'instantané (à vol d'oiseau). */
  const surroundings = computed(
    () => props.item.listing.openDataContext?.surroundings ?? null
  )
  const equipment = computed(() => {
    const s = surroundings.value
    if (!s) return null
    const part = (
      label: string,
      lookup: { status: string; nearest: { distanceMeters: number } | null }
    ): string =>
      lookup.nearest
        ? `${label} à ${formatDistance(lookup.nearest.distanceMeters)}`
        : lookup.status === 'unavailable'
          ? `${label} non disponible`
          : `${label} : aucun proche`
    return [
      part('piste', s.athleticsTrack),
      part('drive', s.supermarkets),
      part('Fitness Park', s.fitnessPark),
    ].join(' · ')
  })

  const linkClass =
    'inline-flex min-h-11 items-center justify-self-start text-sm font-semibold text-accent underline-offset-2 hover:underline'
</script>

<template>
  <div class="@container grid gap-4" data-testid="synthesis">
    <section
      class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted"
      aria-labelledby="cost-bases-title"
      data-testid="cost-bases"
    >
      <h3 id="cost-bases-title" class="font-semibold text-fg">
        Deux bases de calcul
      </h3>
      <p class="inline-flex flex-wrap items-center gap-1.5">
        <CostBasisBadge basis="price" /> se compare au prix affiché
      </p>
      <p class="inline-flex flex-wrap items-center gap-1.5">
        <CostBasisBadge basis="all_in" /> prix + notaire + travaux + mobilier
      </p>
      <DefinitionButton term="cost_basis" />
      <span
        v-if="live"
        class="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-fg"
        data-testid="live-badge"
        >aperçu en direct</span
      >
    </section>

    <p v-if="!evaluation" class="text-sm text-muted">
      Saisissez un prix et un loyer visé pour voir les indicateurs.
    </p>
    <template v-else>
      <div class="grid gap-4 @4xl:grid-cols-3 @4xl:items-start">
        <NegotiationSummary
          :price="evaluation.metrics.price"
          :target-price="targetPrice"
          :suggested-offer="negotiation?.suggestedOffer ?? null"
          :gauge="reading?.gauge ?? null"
        />
        <CostSummary
          :metrics="evaluation.metrics"
          :assumptions="assumptions"
          :payment="reading?.payment ?? null"
        />
        <ProfitabilitySummary
          :metrics="evaluation.metrics"
          :checks="reading?.checks ?? null"
        />
      </div>
      <AtTargetPanel
        :target-price="targetPrice"
        :checks="reading?.atTargetChecks ?? null"
        @negotiate="emit('go', 'negocier')"
      />
    </template>

    <div class="grid gap-4 @2xl:grid-cols-3">
      <section
        class="grid content-start gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3"
        aria-labelledby="summary-rental-title"
        data-testid="summary-rental"
      >
        <h3 id="summary-rental-title" class="text-sm font-semibold">
          Louabilité (phase 2)
        </h3>
        <template v-if="evaluation">
          <p class="flex flex-wrap items-center gap-1.5 text-sm">
            <RentalPill :verdict="evaluation.rental.verdict" />
            <span class="text-muted">en {{ evaluation.rental.year }}</span>
          </p>
          <p class="text-xs text-muted">
            <template
              v-if="
                rentalCounts.bad + rentalCounts.warn + rentalCounts.unknown ===
                0
              "
              >Aucun point bloquant ni d’attention.</template
            >
            <template v-else>
              {{ rentalCounts.bad }} bloquant(s) ·
              {{ rentalCounts.warn }} point(s) d’attention ·
              {{ rentalCounts.unknown }} à vérifier
            </template>
          </p>
        </template>
        <button
          type="button"
          :class="linkClass"
          @click="emit('go', 'financer')"
        >
          Contrôles et étude →
        </button>
      </section>
      <section
        class="grid content-start gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3"
        aria-labelledby="summary-follow-title"
        data-testid="summary-follow"
      >
        <h3 id="summary-follow-title" class="text-sm font-semibold">Suivi</h3>
        <p class="text-sm">
          {{ openTasks.length }} tâche(s) ouverte(s) ·
          {{
            item.opinions.length === 0
              ? 'aucun avis'
              : `${item.opinions.length} avis`
          }}
        </p>
        <p v-if="nextTask" class="text-xs text-muted">
          Prochaine : {{ nextTask.label }}
        </p>
        <button type="button" :class="linkClass" @click="emit('go', 'suivi')">
          Avis, tâches, visites, journal →
        </button>
      </section>
      <section
        class="grid content-start gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3"
        aria-labelledby="summary-area-title"
        data-testid="summary-area"
      >
        <h3 id="summary-area-title" class="text-sm font-semibold">Quartier</h3>
        <p class="text-sm">
          <template v-if="tram"
            >Tram {{ tram.name }} à
            {{ formatDistance(tram.distanceMeters) }}</template
          >
          <template v-else>Tram : à vérifier</template>
          ·
          <template v-if="marketMedian !== null"
            >marché DVF {{ formatEurosPerM2(marketMedian) }}</template
          >
          <template v-else>marché DVF inconnu</template>
        </p>
        <p class="text-sm" data-testid="summary-neighbourhood">
          <template v-if="surroundings?.neighbourhood.value"
            >Quartier {{ surroundings.neighbourhood.value.name
            }}<template
              v-if="
                surroundings.neighbourhood.value.commune !==
                surroundings.neighbourhood.value.name
              "
            >
              ({{ surroundings.neighbourhood.value.commune }})</template
            ><template v-if="surroundings.neighbourhood.status === 'to_verify'">
              · à vérifier</template
            ></template
          >
          <template v-else>Quartier : non disponible</template>
        </p>
        <p
          v-if="equipment"
          class="text-xs text-muted"
          data-testid="summary-equipment"
        >
          {{ equipment }} (à vol d’oiseau)
        </p>
        <p
          v-if="evaluation && marketMedian !== null"
          class="text-xs text-muted"
        >
          L’annonce : {{ formatEurosPerM2(evaluation.metrics.pricePerM2) }}
          <CostBasisBadge basis="price" compact />
        </p>
        <button
          type="button"
          :class="linkClass"
          @click="emit('go', 'quartier')"
        >
          Contexte, équipements, carte, risques →
        </button>
      </section>
    </div>
  </div>
</template>
