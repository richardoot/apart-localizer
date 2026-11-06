<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type {
    Assumptions,
    EvaluatedListing,
    ListingEvaluation,
    Scenario,
  } from '@apart/contracts'
  import {
    applyScenario,
    compute,
    profitabilityChecks,
    projection,
  } from '@apart/domain'
  import type { StudyInput } from '@apart/domain'
  import ProjectionPanel from '@/components/study/ProjectionPanel.vue'
  import ScenariosPanel from '@/components/study/ScenariosPanel.vue'
  import { useListingEditor } from '@/composables/useListingEditor'
  import { useScenarios, useStudyInput } from '@/composables/useStudy'
  import { scenarioSummary } from '@/lib/budget'
  import { formatDate, formatEuros } from '@/lib/format'
  import ProfitabilitySummary from '../ProfitabilitySummary.vue'

  /**
   * « Rendement et projection sur N ans » (lot 19, onglet Budget) : les
   * scénarios enregistrés en sélecteur (« Base » = les hypothèses de
   * l'espace), et pour le scénario choisi le rendement brut, le rendement
   * net, l'effort mensuel en location et le TRI à l'horizon, avec leurs
   * seuils et le verdict ; la projection année par année, la fiscalité, la
   * plus-value et l'éditeur de scénarios repliés. Tout est calculé dans le
   * navigateur par `domain` (aucun appel réseau) ; une estimation, pas un
   * conseil fiscal.
   */
  const props = defineProps<{
    item: EvaluatedListing
    evaluation: ListingEvaluation | null
    assumptions: Assumptions | null
    live?: boolean
  }>()

  const editor = useListingEditor()
  const study = useStudyInput(
    computed(() => props.item.listing),
    computed(() => props.assumptions)
  )
  const { data: saved } = useScenarios(computed(() => props.item.listing.id))
  const scenarios = computed<Scenario[]>(() => saved.value ?? [])

  /** `base` ou l'identifiant d'un scénario enregistré. */
  const chosen = ref<string>('base')
  watch(scenarios, list => {
    if (chosen.value !== 'base' && !list.some(s => s.id === chosen.value)) {
      chosen.value = 'base'
    }
  })
  const scenario = computed(
    () => scenarios.value.find(s => s.id === chosen.value) ?? null
  )

  /** L'entrée de l'étude ; pendant une modification, les chiffres de l'aperçu. */
  const baseInput = computed<StudyInput | null>(() => {
    if (!study.value) return null
    const preview = editor.preview.value.financials
    return props.live && preview
      ? { ...study.value.input, financials: preview }
      : study.value.input
  })
  const applied = computed(() => {
    if (!study.value || !baseInput.value) return null
    return scenario.value
      ? applyScenario(
          baseInput.value,
          study.value.assumptions,
          scenario.value.overrides
        )
      : { input: baseInput.value, assumptions: study.value.assumptions }
  })
  const metrics = computed(() => {
    if (!applied.value) return null
    if (!scenario.value && props.evaluation) return props.evaluation.metrics
    return compute(applied.value.input.financials, applied.value.assumptions)
  })
  const checks = computed(() =>
    metrics.value && applied.value
      ? profitabilityChecks(metrics.value, applied.value.assumptions)
      : null
  )
  const report = computed(() =>
    applied.value
      ? projection(applied.value.input, applied.value.assumptions, {
          at: new Date(),
          listingId: props.item.listing.id,
          title: props.item.listing.title,
        })
      : null
  )
  const irr = computed(() => {
    const summary = report.value?.summary
    if (!summary) return null
    return summary.irrAfterTax !== null
      ? { value: summary.irrAfterTax, afterTax: true }
      : { value: summary.irrBeforeTax, afterTax: false }
  })
  const horizon = computed(
    () =>
      applied.value?.assumptions.horizonYears ??
      props.assumptions?.horizonYears ??
      null
  )
  const label = computed(() =>
    scenario.value ? scenario.value.name.toLowerCase() : 'base'
  )
  const description = computed(() => {
    const parts = [
      scenario.value
        ? `« ${scenario.value.name} »${
            scenarioSummary(scenario.value.overrides)
              ? ` : ${scenarioSummary(scenario.value.overrides)}`
              : ''
          }.`
        : 'Base : les hypothèses de l’espace.',
    ]
    if (report.value) {
      parts.push(
        `Revente estimée ${formatEuros(report.value.sale.salePrice)} le ${formatDate(report.value.sale.date)}.`
      )
    }
    return parts.join(' ')
  })

  const chip =
    'inline-flex min-h-11 items-center rounded-full border-[1.5px] px-3.5 text-sm sm:min-h-10'
</script>

<template>
  <section
    class="grid gap-3.5 rounded-2xl border border-line bg-surface p-4 sm:px-5"
    aria-labelledby="yield-title"
    data-testid="yield-section"
  >
    <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 id="yield-title" class="text-base font-semibold">
        Rendement et projection<template v-if="assumptions">
          sur {{ assumptions.horizonYears }} ans</template
        >
      </h2>
      <div
        role="group"
        aria-label="Scénario"
        class="flex flex-wrap gap-1.5"
        data-testid="scenario-picker"
      >
        <button
          type="button"
          :class="[
            chip,
            chosen === 'base'
              ? 'border-accent bg-accent font-semibold text-accent-fg'
              : 'border-line bg-surface text-fg hover:bg-surface-2',
          ]"
          :aria-pressed="chosen === 'base'"
          data-scenario="base"
          @click="chosen = 'base'"
        >
          Base
        </button>
        <button
          v-for="s in scenarios"
          :key="s.id"
          type="button"
          :class="[
            chip,
            chosen === s.id
              ? 'border-accent bg-accent font-semibold text-accent-fg'
              : 'border-line bg-surface text-fg hover:bg-surface-2',
          ]"
          :aria-pressed="chosen === s.id"
          :data-scenario="s.id"
          @click="chosen = s.id"
        >
          {{ s.name }}
        </button>
      </div>
    </header>

    <p v-if="!study" class="text-sm text-muted">Chargement des hypothèses…</p>
    <template v-else-if="metrics">
      <ProfitabilitySummary
        :metrics="metrics"
        :checks="checks"
        :irr="irr"
        :horizon-years="horizon"
        :scenario-label="label"
      />
      <p class="text-sm text-muted" data-testid="scenario-text">
        {{ description }} Estimation, pas un conseil fiscal.
      </p>
    </template>

    <details
      v-if="applied"
      class="rounded-xl border border-line px-3 text-sm"
      data-testid="projection-details"
    >
      <summary
        class="flex min-h-11 cursor-pointer items-center font-medium text-accent"
      >
        Voir la projection année par année, la fiscalité et la plus-value
      </summary>
      <div class="pb-3">
        <ProjectionPanel
          :listing-id="item.listing.id"
          :title="item.listing.title"
          :input="applied.input"
          :assumptions="applied.assumptions"
        />
      </div>
    </details>
    <details
      v-if="study && baseInput"
      class="rounded-xl border border-line px-3 text-sm"
      data-testid="scenarios-details"
    >
      <summary
        class="flex min-h-11 cursor-pointer items-center font-medium text-accent"
      >
        Créer ou modifier un scénario
      </summary>
      <div class="pb-3">
        <ScenariosPanel
          :listing-id="item.listing.id"
          :title="item.listing.title"
          :input="baseInput"
          :assumptions="study.assumptions"
        />
      </div>
    </details>
  </section>
</template>
