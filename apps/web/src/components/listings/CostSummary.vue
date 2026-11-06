<script setup lang="ts">
  import { computed } from 'vue'
  import type { Assumptions, ListingMetrics } from '@apart/contracts'
  import { costShares } from '@apart/domain'
  import type { CostShareKey, MonthlyPaymentSplit } from '@apart/domain'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import {
    formatCssPercent,
    formatEuros,
    formatEurosPerMonth,
    formatRate,
  } from '@/lib/format'

  /**
   * « À l'achat » (lot 19, onglet Budget ; « Combien ça coûte ? » du lot 9) :
   * le coût tout compris, sa répartition en barre (prix, frais de notaire,
   * travaux, mobilier : `costShares` de `domain`) et sa légende, puis
   * l'emprunt et la mensualité, dont l'assurance (`monthlyPaymentSplit`).
   */
  const props = defineProps<{
    metrics: ListingMetrics
    assumptions: Assumptions | null
    payment: MonthlyPaymentSplit | null
    /** Honoraires d'agence à la charge de l'acquéreur, compris dans le prix affiché. */
    feesAmount?: number | null
  }>()
  const emit = defineEmits<{ works: [] }>()

  const shares = computed(() => costShares(props.metrics))
  const BAR: Record<CostShareKey, string> = {
    price: 'bg-accent',
    notary: 'bg-accent/50',
    renovation: 'bg-warn',
    furniture: 'bg-muted',
  }
  const notaryLabel = computed(() => {
    if (props.metrics.notaryFeesDetail.mode === 'scale') return 'barème'
    return props.assumptions ? formatRate(props.assumptions.notaryRate) : 'taux'
  })
  const swatch = 'mr-1.5 inline-block size-2.5 rounded-[3px] align-[-1px]'
</script>

<template>
  <section
    class="grid gap-3.5 rounded-2xl border border-line bg-surface p-4 sm:px-5"
    aria-labelledby="buy-title"
    data-testid="block-cost"
  >
    <h2 id="buy-title" class="text-base font-semibold">À l’achat</h2>
    <p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <strong
        class="font-display text-[28px] leading-none font-bold tabular-nums"
        data-testid="total-cost"
        >{{ formatEuros(metrics.totalCost) }}</strong
      >
      <span class="inline-flex items-center gap-1.5 text-sm text-muted"
        >coût tout compris <DefinitionButton term="total_cost"
      /></span>
    </p>
    <div
      v-if="shares.length"
      aria-hidden="true"
      class="flex h-3.5 gap-0.5 overflow-hidden rounded-full"
      data-testid="cost-bar"
    >
      <span
        v-for="share in shares"
        :key="share.key"
        :class="BAR[share.key]"
        :style="{ width: formatCssPercent(share.share) }"
        :data-share="share.key"
      />
    </div>
    <dl
      class="grid gap-x-5 gap-y-3 text-sm tabular-nums @xl:grid-cols-2 @4xl:grid-cols-4"
      data-testid="cost-breakdown"
    >
      <div class="grid content-start gap-0.5" data-row="price">
        <dt class="text-xs text-muted">
          <span aria-hidden="true" :class="[swatch, BAR.price]" />Prix affiché
        </dt>
        <dd class="m-0 font-semibold">
          {{ formatEuros(metrics.price) }}
          <span
            v-if="feesAmount"
            class="block text-xs font-normal text-muted"
            data-testid="fees-included"
            >dont {{ formatEuros(feesAmount) }} d’honoraires</span
          >
        </dd>
      </div>
      <div class="grid content-start gap-0.5" data-row="notary">
        <dt class="flex items-center gap-1 text-xs text-muted">
          <span>
            <span aria-hidden="true" :class="[swatch, BAR.notary]" />Frais de
            notaire ({{ notaryLabel }})
          </span>
          <DefinitionButton term="notary_fees" />
        </dt>
        <dd class="m-0 font-semibold">
          <span v-if="metrics.notaryFeesDetail.estimated">≈ </span
          >{{ formatEuros(metrics.notaryFees) }}
        </dd>
      </div>
      <div class="grid content-start gap-0.5" data-row="renovation">
        <dt class="text-xs text-muted">
          <span aria-hidden="true" :class="[swatch, BAR.renovation]" />Travaux
        </dt>
        <dd class="m-0 font-semibold">
          {{ formatEuros(metrics.renovationTotal) }} ·
          <button
            type="button"
            class="inline-flex min-h-11 items-center font-normal text-accent underline-offset-2 hover:underline sm:min-h-0"
            data-testid="works-detail"
            @click="emit('works')"
          >
            détail
          </button>
        </dd>
      </div>
      <div
        v-if="metrics.furnitureValue > 0"
        class="grid content-start gap-0.5"
        data-row="furniture"
      >
        <dt class="text-xs text-muted">
          <span aria-hidden="true" :class="[swatch, BAR.furniture]" />Mobilier
        </dt>
        <dd class="m-0 font-semibold">
          {{ formatEuros(metrics.furnitureValue) }}
        </dd>
      </div>
      <div class="grid content-start gap-0.5" data-row="loan">
        <dt class="flex items-center gap-1 text-xs text-muted">
          Emprunt<template v-if="assumptions">
            (apport {{ formatEuros(assumptions.downPayment) }})</template
          >
          <DefinitionButton term="monthly_payment" />
        </dt>
        <dd class="m-0 font-semibold">
          <span data-testid="loan-amount">{{
            formatEuros(metrics.loanAmount)
          }}</span>
          →
          <span data-testid="monthly-payment">{{
            formatEurosPerMonth(metrics.monthlyPayment)
          }}</span>
          <span
            v-if="assumptions"
            class="block text-xs font-normal text-muted"
            data-testid="loan-terms"
            >{{ assumptions.durationYears }} ans à
            {{ formatRate(assumptions.interestRate) }}</span
          >
          <span
            v-if="payment && payment.total > 0"
            class="block text-xs font-normal text-muted"
            data-testid="payment-split"
            >{{ formatEuros(payment.credit) }} de crédit +
            {{ formatEuros(payment.insurance) }} d’assurance</span
          >
        </dd>
      </div>
    </dl>
  </section>
</template>
