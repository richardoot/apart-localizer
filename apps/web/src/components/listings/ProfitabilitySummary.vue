<script setup lang="ts">
  import type { ListingMetrics } from '@apart/contracts'
  import type {
    ProfitabilityCheck,
    ProfitabilityIndicator,
  } from '@apart/domain'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import {
    formatEurosPerMonth,
    formatRate,
    formatSignedEurosPerMonth,
  } from '@/lib/format'
  import {
    PROFITABILITY_STATUS_CLASSES,
    PROFITABILITY_STATUS_LABELS,
    PROFITABILITY_STATUS_SYMBOLS,
    PROFITABILITY_STATUS_TEXT,
    VERDICT_FAILURE_LABELS,
    VERDICT_NEAR_MISS_LABELS,
  } from '@/lib/labels'
  import CostBasisBadge from './CostBasisBadge.vue'
  import VerdictPill from './VerdictPill.vue'

  /**
   * « Est-ce rentable ? » (lot 9) : le loyer retenu, puis rendement brut,
   * effort et rendement net, chacun avec sa formule en une ligne, le seuil des
   * hypothèses et son état (`profitabilityChecks` de `domain`), enfin le
   * verdict et ce qui le fait.
   */
  defineProps<{
    metrics: ListingMetrics
    checks: ProfitabilityCheck[] | null
  }>()

  const INDICATORS: Record<
    ProfitabilityIndicator,
    { label: string; term: string; formula: string }
  > = {
    gross_yield: {
      label: 'Rendement brut',
      term: 'gross_yield',
      formula: '12 × loyer ÷ coût tout compris',
    },
    effort: {
      label: 'Effort mensuel',
      term: 'effort',
      formula: 'revenu net ÷ 12 − mensualité',
    },
    net_yield: {
      label: 'Rendement net',
      term: 'net_yield',
      formula: 'après vacance, taxe foncière, charges et frais',
    },
  }

  function valueOf(check: ProfitabilityCheck): string {
    return check.indicator === 'effort'
      ? formatSignedEurosPerMonth(check.value)
      : formatRate(check.value)
  }

  function thresholdOf(check: ProfitabilityCheck): string | null {
    if (check.threshold === null) return null
    return check.indicator === 'effort'
      ? `effort ≤ ${formatEurosPerMonth(check.threshold)}`
      : `seuil ≥ ${formatRate(check.threshold)}`
  }
</script>

<template>
  <section
    class="grid content-start gap-3.5 rounded-2xl border border-line bg-surface p-4 text-sm sm:p-5"
    aria-labelledby="summary-yield-title"
    data-testid="block-yield"
  >
    <header class="flex items-center justify-between gap-2">
      <h3 id="summary-yield-title" class="font-display text-lg font-bold">
        Est-ce rentable ?
      </h3>
      <CostBasisBadge basis="all_in" />
    </header>
    <div class="grid gap-1">
      <p class="flex items-baseline justify-between gap-3 tabular-nums">
        <span class="text-muted">Loyer retenu (phase 2)</span>
        <strong data-testid="retained-rent">{{
          formatEurosPerMonth(metrics.rent)
        }}</strong>
      </p>
      <p
        v-if="metrics.rentCap !== null"
        class="text-xs text-muted"
        data-testid="rent-cap"
      >
        Loyer visé {{ formatEurosPerMonth(metrics.targetRent) }}, plafond
        d’encadrement {{ formatEurosPerMonth(metrics.rentCap) }} : le plus bas
        des deux est retenu.
      </p>
      <p v-if="metrics.targetRent === 0" class="text-xs text-muted">
        Loyer visé non renseigné : renseignez la phase 2 pour juger la
        rentabilité.
      </p>
    </div>

    <ul v-if="checks" class="grid gap-2.5" aria-label="Critères de rentabilité">
      <li
        v-for="check in checks"
        :key="check.indicator"
        class="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 rounded-xl px-3 py-2.5 tabular-nums"
        :class="PROFITABILITY_STATUS_CLASSES[check.status]"
        :data-indicator="check.indicator"
        :data-status="check.status"
      >
        <span class="flex items-center gap-1.5 font-semibold">
          {{ INDICATORS[check.indicator].label }}
          <DefinitionButton :term="INDICATORS[check.indicator].term" />
        </span>
        <strong
          :class="PROFITABILITY_STATUS_TEXT[check.status]"
          :data-testid="`value-${check.indicator}`"
          ><span
            v-if="
              check.indicator === 'net_yield' &&
              (metrics.propertyTaxEstimated ||
                metrics.nonRecoverableChargesEstimated)
            "
            >≈ </span
          >{{ valueOf(check) }}</strong
        >
        <span class="text-xs">{{ INDICATORS[check.indicator].formula }}</span>
        <span
          class="text-right text-xs"
          :class="
            check.status === 'not_retained'
              ? 'text-fg'
              : PROFITABILITY_STATUS_TEXT[check.status]
          "
          :data-testid="`status-${check.indicator}`"
        >
          <template v-if="check.status === 'not_retained'"
            >non retenu<template v-if="thresholdOf(check)">
              · {{ thresholdOf(check) }}</template
            ></template
          >
          <template v-else>
            <span aria-hidden="true"
              >{{ PROFITABILITY_STATUS_SYMBOLS[check.status] }}
            </span>
            <span class="sr-only"
              >{{ PROFITABILITY_STATUS_LABELS[check.status] }} :
            </span>
            {{ thresholdOf(check)
            }}<template v-if="check.status === 'near'"> (de peu)</template>
          </template>
        </span>
      </li>
    </ul>

    <p
      class="flex flex-wrap items-center gap-1.5 text-sm"
      data-testid="summary-verdict"
    >
      <span class="text-muted">Verdict :</span>
      <VerdictPill :verdict="metrics.verdict" />
      <DefinitionButton term="verdict" />
      <span v-if="metrics.failures.length" class="text-muted">
        en échec :
        {{ metrics.failures.map(f => VERDICT_FAILURE_LABELS[f]).join(', ') }}.
      </span>
      <span v-else-if="metrics.nearMisses.length" class="text-muted">
        de peu :
        {{
          metrics.nearMisses.map(n => VERDICT_NEAR_MISS_LABELS[n]).join(', ')
        }}.
      </span>
    </p>
  </section>
</template>
