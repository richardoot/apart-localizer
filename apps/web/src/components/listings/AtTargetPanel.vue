<script setup lang="ts">
  import { computed } from 'vue'
  import type { TargetPrice } from '@apart/contracts'
  import type { ProfitabilityCheck } from '@apart/domain'
  import {
    formatEuros,
    formatRate,
    formatSignedEurosPerMonth,
  } from '@/lib/format'
  import {
    PROFITABILITY_STATUS_LABELS,
    PROFITABILITY_STATUS_SYMBOLS,
    VERDICT_FAILURE_LABELS,
    VERDICT_NEAR_MISS_LABELS,
  } from '@/lib/labels'
  import CostBasisBadge from './CostBasisBadge.vue'

  /**
   * « Et au prix cible ? » (lot 9) : le pont entre les deux bases. Au prix
   * cible (sur le prix), le coût tout compris, le rendement brut et l'effort
   * qu'il donne, et le verdict : l'évaluation `atTarget` du prix cible,
   * calculée par `domain` côté serveur ou dans l'aperçu en direct.
   */
  const props = defineProps<{
    targetPrice: TargetPrice | null
    checks: ProfitabilityCheck[] | null
  }>()
  const emit = defineEmits<{ negotiate: [] }>()

  const outcome = computed(() => props.targetPrice?.atTarget ?? null)
  const check = (indicator: ProfitabilityCheck['indicator']) =>
    props.checks?.find(c => c.indicator === indicator) ?? null
  const gross = computed(() => check('gross_yield'))
  const effort = computed(() => check('effort'))
</script>

<template>
  <section
    class="@container grid gap-3 rounded-2xl bg-accent-soft p-4 text-fg sm:px-5"
    aria-labelledby="at-target-title"
    data-testid="at-target"
  >
    <h3 id="at-target-title" class="font-display text-base font-bold">
      Et au prix cible ?
    </h3>
    <p v-if="!outcome" class="text-sm">
      Sans prix cible, il n’y a pas de prix à évaluer : renseignez le loyer visé
      (phase 2).
    </p>
    <template v-else>
      <dl
        class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 tabular-nums @xl:grid-cols-4 @xl:gap-3"
      >
        <div class="contents @xl:grid @xl:gap-0.5">
          <dt class="flex items-center gap-1.5 text-sm @xl:text-xs">
            Prix <CostBasisBadge basis="price" compact />
          </dt>
          <dd
            class="text-right font-semibold @xl:text-left @xl:text-lg"
            data-testid="at-target-price"
          >
            {{ formatEuros(outcome.price) }}
          </dd>
        </div>
        <div class="contents @xl:grid @xl:gap-0.5">
          <dt class="flex items-center gap-1.5 text-sm @xl:text-xs">
            Coût tout compris <CostBasisBadge basis="all_in" compact />
          </dt>
          <dd
            class="text-right font-semibold @xl:text-left @xl:text-lg"
            data-testid="at-target-cost"
          >
            {{ formatEuros(outcome.totalCost) }}
          </dd>
        </div>
        <div class="contents @xl:grid @xl:gap-0.5">
          <dt class="text-sm @xl:text-xs">Rendement brut</dt>
          <dd
            class="text-right font-semibold @xl:text-left @xl:text-lg"
            data-testid="at-target-gross"
          >
            {{ formatRate(outcome.grossYield) }}
            <template v-if="gross && gross.status !== 'not_retained'">
              <span aria-hidden="true">{{
                PROFITABILITY_STATUS_SYMBOLS[gross.status]
              }}</span>
              <span class="sr-only">{{
                PROFITABILITY_STATUS_LABELS[gross.status]
              }}</span>
            </template>
          </dd>
        </div>
        <div class="contents @xl:grid @xl:gap-0.5">
          <dt class="text-sm @xl:text-xs">Effort</dt>
          <dd
            class="text-right font-semibold @xl:text-left @xl:text-lg"
            data-testid="at-target-effort"
          >
            {{ formatSignedEurosPerMonth(outcome.effort) }}
            <template v-if="effort && effort.status !== 'not_retained'">
              <span aria-hidden="true">{{
                PROFITABILITY_STATUS_SYMBOLS[effort.status]
              }}</span>
              <span class="sr-only">{{
                PROFITABILITY_STATUS_LABELS[effort.status]
              }}</span>
            </template>
          </dd>
        </div>
      </dl>
      <p class="text-sm" data-testid="at-target-verdict">
        <template v-if="targetPrice?.discountClass === 'in_target'"
          >Le prix affiché est déjà sous le prix cible.
        </template>
        <template v-if="outcome.verdict === 'target'"
          >À ce prix, le bien entre dans la cible.</template
        >
        <template v-else-if="outcome.verdict === 'to_dig'"
          >À ce prix, le bien reste à creuser (de peu :
          {{
            outcome.nearMisses.map(n => VERDICT_NEAR_MISS_LABELS[n]).join(', ')
          }}).</template
        >
        <template v-else
          >Même à ce prix, le bien reste hors cible (en échec :
          {{
            outcome.failures.map(f => VERDICT_FAILURE_LABELS[f]).join(', ')
          }}).</template
        >
      </p>
    </template>
    <button
      type="button"
      class="inline-flex min-h-11 items-center justify-self-start font-semibold text-accent underline-offset-2 hover:underline"
      data-testid="go-negotiate"
      @click="emit('negotiate')"
    >
      Voir le détail par critère et la sensibilité →
    </button>
  </section>
</template>
