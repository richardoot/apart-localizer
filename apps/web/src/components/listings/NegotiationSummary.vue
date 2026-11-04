<script setup lang="ts">
  import { computed } from 'vue'
  import type { TargetPrice } from '@apart/contracts'
  import type { PriceGauge } from '@apart/domain'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import { formatCssPercent, formatEuros, formatPercent } from '@/lib/format'
  import {
    DISCOUNT_CLASS_CLASSES,
    DISCOUNT_CLASS_LABELS,
    TARGET_CRITERION_LABELS,
  } from '@/lib/labels'
  import CostBasisBadge from './CostBasisBadge.vue'

  /**
   * « Combien négocier ? » (lot 9) : tout ce qui se compare au prix affiché.
   * Prix affiché, prix cible, l'échelle qui situe l'un par rapport à l'autre,
   * la décote et sa classe, le critère liant, l'offre suggérée.
   */
  const props = defineProps<{
    price: number
    targetPrice: TargetPrice | null
    suggestedOffer: number | null
    gauge: PriceGauge | null
  }>()

  const target = computed(() => props.targetPrice?.targetPrice ?? null)
  const discount = computed(() => props.targetPrice?.discount ?? null)
</script>

<template>
  <section
    class="grid content-start gap-3.5 rounded-2xl border border-line bg-surface p-4 text-sm sm:p-5"
    aria-labelledby="summary-price-title"
    data-testid="block-price"
  >
    <header class="flex items-center justify-between gap-2">
      <h3 id="summary-price-title" class="font-display text-lg font-bold">
        Combien négocier ?
      </h3>
      <CostBasisBadge basis="price" />
    </header>
    <dl
      class="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-2.5 tabular-nums"
    >
      <dt class="text-muted">Prix affiché</dt>
      <dd class="text-right font-semibold" data-testid="summary-listed-price">
        {{ formatEuros(price) }}
      </dd>
      <dt class="flex items-center gap-1.5 text-muted">
        Prix cible <DefinitionButton term="target_price" />
      </dt>
      <dd
        class="text-right font-display text-2xl font-bold text-accent"
        data-testid="summary-target-price"
      >
        {{ target === null ? '—' : formatEuros(target) }}
      </dd>
    </dl>

    <p v-if="target === null || !targetPrice" class="text-sm text-muted">
      Prix cible non calculable : renseignez le loyer visé (phase 2) et vérifiez
      les critères retenus dans les hypothèses.
    </p>
    <template v-else>
      <div
        v-if="gauge"
        class="grid gap-1 text-[11px] text-muted"
        aria-hidden="true"
        data-testid="price-gauge"
      >
        <div class="relative h-2.5 rounded-full bg-surface-2">
          <div
            class="absolute inset-y-0 left-0 rounded-full bg-accent-soft"
            :style="{ width: formatCssPercent(gauge.targetShare) }"
          />
          <div
            class="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-sm bg-accent"
            :style="{ left: formatCssPercent(gauge.targetShare) }"
            data-marker="target"
          />
          <div
            class="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-sm bg-fg"
            :style="{ left: formatCssPercent(gauge.listedShare) }"
            data-marker="listed"
          />
        </div>
        <div class="relative h-4">
          <span class="absolute left-0">0</span>
          <span
            class="absolute text-accent"
            :class="gauge.targetShare === 1 ? 'right-0' : '-translate-x-1/2'"
            :style="
              gauge.targetShare === 1
                ? undefined
                : { left: formatCssPercent(gauge.targetShare) }
            "
            >cible</span
          >
        </div>
        <div class="relative -order-1 h-4">
          <span
            class="absolute text-fg"
            :class="gauge.listedShare === 1 ? 'right-0' : '-translate-x-1/2'"
            :style="
              gauge.listedShare === 1
                ? undefined
                : { left: formatCssPercent(gauge.listedShare) }
            "
            >affiché</span
          >
        </div>
      </div>

      <p
        v-if="discount !== null && targetPrice.discountClass"
        class="flex flex-wrap items-center gap-1.5"
      >
        <span
          class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
          :class="DISCOUNT_CLASS_CLASSES[targetPrice.discountClass]"
          :data-discount-class="targetPrice.discountClass"
          data-testid="summary-discount"
        >
          {{ discount > 0 ? 'Décote nécessaire' : 'Marge' }}
          {{ formatPercent(Math.abs(discount)) }} ·
          {{ DISCOUNT_CLASS_LABELS[targetPrice.discountClass].toLowerCase() }}
        </span>
        <DefinitionButton term="discount" />
      </p>
      <p
        v-if="targetPrice.bindingCriterion"
        class="flex flex-wrap items-center gap-1.5 text-sm text-muted"
      >
        <span>
          Fixé par le
          <strong class="text-fg">{{
            TARGET_CRITERION_LABELS[targetPrice.bindingCriterion].toLowerCase()
          }}</strong>
          (critère liant).
        </span>
        <DefinitionButton term="binding_criterion" />
      </p>
      <div
        v-if="suggestedOffer !== null"
        class="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5 tabular-nums"
      >
        <span class="flex items-center gap-1.5"
          >Offre suggérée <DefinitionButton term="suggested_offer"
        /></span>
        <strong class="text-base" data-testid="summary-offer">{{
          formatEuros(suggestedOffer)
        }}</strong>
      </div>
    </template>
  </section>
</template>
