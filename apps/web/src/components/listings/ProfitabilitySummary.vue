<script setup lang="ts">
  import { computed } from 'vue'
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
  import VerdictPill from './VerdictPill.vue'

  /**
   * Le rendement (lot 19, onglet Budget ; « Est-ce rentable ? » du lot 9),
   * compacté : le loyer retenu, puis rendement brut, rendement net, effort
   * mensuel en location, chacun avec son seuil et son état
   * (`profitabilityChecks` de `domain` : ✓ atteint, ~ de peu, ✗ en échec),
   * le TRI à l'horizon s'il est donné, enfin le verdict et ce qui le fait.
   */
  const props = defineProps<{
    metrics: ListingMetrics
    checks: ProfitabilityCheck[] | null
    /** TRI à l'horizon (fraction) ; `afterTax` faux quand la TMI manque. */
    irr?: { value: number | null; afterTax: boolean } | null
    horizonYears?: number | null
    /** Le scénario des chiffres (« base », « taux 3 % »). */
    scenarioLabel?: string | null
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
    net_yield: {
      label: 'Rendement net',
      term: 'net_yield',
      formula: 'après vacance, taxe foncière, charges et frais',
    },
    effort: {
      label: 'Effort mensuel en location',
      term: 'effort',
      formula: 'revenu net ÷ 12 − mensualité',
    },
  }
  const ORDER: ProfitabilityIndicator[] = ['gross_yield', 'net_yield', 'effort']
  const ordered = computed(() =>
    ORDER.map(key => props.checks?.find(c => c.indicator === key)).filter(
      (c): c is ProfitabilityCheck => c !== undefined
    )
  )

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
  <div class="grid gap-3 text-sm" data-testid="block-yield">
    <div class="grid gap-0.5">
      <p class="flex flex-wrap items-baseline gap-x-2 tabular-nums">
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

    <dl
      v-if="ordered.length || irr"
      class="grid gap-2 tabular-nums @xl:grid-cols-2 @4xl:grid-cols-4"
      aria-label="Critères de rentabilité"
    >
      <div
        v-for="check in ordered"
        :key="check.indicator"
        class="grid content-start gap-0.5 rounded-xl px-3 py-2.5"
        :class="PROFITABILITY_STATUS_CLASSES[check.status]"
        :data-indicator="check.indicator"
        :data-status="check.status"
      >
        <dt class="flex items-center gap-1.5 text-xs text-fg">
          {{ INDICATORS[check.indicator].label }}
          <DefinitionButton :term="INDICATORS[check.indicator].term" />
        </dt>
        <dd
          class="m-0 font-display text-[22px] leading-tight font-bold"
          :class="PROFITABILITY_STATUS_TEXT[check.status]"
          :data-testid="`value-${check.indicator}`"
        >
          <span
            v-if="
              check.indicator === 'net_yield' &&
              (metrics.propertyTaxEstimated ||
                metrics.nonRecoverableChargesEstimated)
            "
            >≈ </span
          >{{ valueOf(check) }}
        </dd>
        <dd
          class="m-0 text-xs"
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
        </dd>
        <dd class="m-0 text-xs text-muted">
          {{ INDICATORS[check.indicator].formula }}
        </dd>
      </div>
      <div
        v-if="irr"
        class="grid content-start gap-0.5 rounded-xl bg-surface-2 px-3 py-2.5"
        data-testid="irr"
      >
        <dt class="flex items-center gap-1.5 text-xs text-fg">
          TRI {{ irr.afterTax ? 'après impôts' : 'avant impôts'
          }}<template v-if="horizonYears"> à {{ horizonYears }} ans</template
          ><template v-if="scenarioLabel"> · {{ scenarioLabel }}</template>
          <DefinitionButton term="irr" />
        </dt>
        <!-- Un TRI négatif (on perd de l'argent) ne se dit pas en vert. -->
        <dd
          class="m-0 font-display text-[22px] leading-tight font-bold"
          :class="
            irr.value !== null && irr.value < 0 ? 'text-bad' : 'text-accent'
          "
          data-testid="value-irr"
        >
          {{ irr.value === null ? '—' : formatRate(irr.value) }}
        </dd>
        <dd v-if="!irr.afterTax" class="m-0 text-xs text-muted">
          TMI à renseigner dans les hypothèses pour l’après impôts
        </dd>
      </div>
    </dl>

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
  </div>
</template>
