<script setup lang="ts">
  import { computed } from 'vue'
  import type { Assumptions, ListingMetrics } from '@apart/contracts'
  import type { MonthlyPaymentSplit } from '@apart/domain'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import { formatEuros, formatEurosPerMonth, formatRate } from '@/lib/format'
  import CostBasisBadge from './CostBasisBadge.vue'

  /**
   * « Combien ça coûte ? » (lot 9) : du prix affiché au coût tout compris
   * (notaire, travaux, mobilier), puis l'apport, l'emprunt et la mensualité
   * séparée en crédit et assurance. Toutes les grandeurs viennent de
   * `compute` et de `monthlyPaymentSplit`.
   */
  const props = defineProps<{
    metrics: ListingMetrics
    assumptions: Assumptions | null
    payment: MonthlyPaymentSplit | null
  }>()

  const notaryLabel = computed(() => {
    if (props.metrics.notaryFeesDetail.mode === 'scale') return 'barème'
    return props.assumptions ? formatRate(props.assumptions.notaryRate) : 'taux'
  })
</script>

<template>
  <section
    class="grid content-start gap-3.5 rounded-2xl border border-line bg-surface p-4 text-sm sm:p-5"
    aria-labelledby="summary-cost-title"
    data-testid="block-cost"
  >
    <header class="flex items-center justify-between gap-2">
      <h3 id="summary-cost-title" class="font-display text-lg font-bold">
        Combien ça coûte ?
      </h3>
      <CostBasisBadge basis="all_in" />
    </header>
    <table class="w-full tabular-nums" data-testid="cost-breakdown">
      <caption class="pb-1.5 text-left text-xs text-muted">
        Du prix au coût tout compris
      </caption>
      <tbody>
        <tr>
          <th scope="row" class="py-1 text-left font-normal">Prix affiché</th>
          <td class="py-1 text-right">{{ formatEuros(metrics.price) }}</td>
        </tr>
        <tr class="text-muted" data-row="notary">
          <th scope="row" class="py-1 text-left font-normal">
            <span class="inline-flex items-center gap-1.5"
              >+ Notaire ({{ notaryLabel }})
              <DefinitionButton term="notary_fees"
            /></span>
          </th>
          <td class="py-1 text-right">
            <span v-if="metrics.notaryFeesDetail.estimated">≈ </span
            >{{ formatEuros(metrics.notaryFees) }}
          </td>
        </tr>
        <tr class="text-muted" data-row="renovation">
          <th scope="row" class="py-1 text-left font-normal">+ Travaux</th>
          <td class="py-1 text-right">
            {{ formatEuros(metrics.renovationTotal) }}
          </td>
        </tr>
        <tr class="text-muted" data-row="furniture">
          <th scope="row" class="py-1 text-left font-normal">+ Mobilier</th>
          <td class="py-1 text-right">
            {{ formatEuros(metrics.furnitureValue) }}
          </td>
        </tr>
        <tr class="border-t-2 border-fg">
          <th scope="row" class="pt-2 pb-1 text-left font-semibold">
            <span class="inline-flex items-center gap-1.5"
              >= Coût tout compris <DefinitionButton term="total_cost"
            /></span>
          </th>
          <td
            class="pt-2 pb-1 text-right font-display text-2xl font-bold"
            data-testid="total-cost"
          >
            {{ formatEuros(metrics.totalCost) }}
          </td>
        </tr>
      </tbody>
    </table>
    <dl
      class="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-2 border-t border-line pt-3 tabular-nums"
    >
      <template v-if="assumptions">
        <dt class="text-muted">Apport</dt>
        <dd class="text-right">− {{ formatEuros(assumptions.downPayment) }}</dd>
      </template>
      <dt class="text-muted">Emprunt</dt>
      <dd class="text-right" data-testid="loan-amount">
        {{ formatEuros(metrics.loanAmount) }}
      </dd>
      <dt class="flex flex-wrap items-center gap-1.5 text-muted">
        Mensualité
        <span v-if="assumptions" class="text-xs"
          >({{ assumptions.durationYears }} ans,
          {{ formatRate(assumptions.interestRate) }})</span
        >
        <DefinitionButton term="monthly_payment" />
      </dt>
      <dd class="text-right font-semibold" data-testid="monthly-payment">
        {{ formatEurosPerMonth(metrics.monthlyPayment) }}
      </dd>
    </dl>
    <p
      v-if="payment && payment.total > 0"
      class="text-xs text-muted"
      data-testid="payment-split"
    >
      {{ formatEuros(payment.credit) }} de crédit +
      {{ formatEuros(payment.insurance) }} d’assurance.
    </p>
  </section>
</template>
