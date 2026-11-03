<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    NegotiationBrief,
    NotaryFeesBreakdown,
    TargetPrice,
    TargetPriceRank,
  } from '@apart/contracts'
  import { formatEuros, formatPercent } from '@/lib/format'
  import {
    DISCOUNT_CLASS_CLASSES,
    DISCOUNT_CLASS_LABELS,
    TARGET_CRITERION_LABELS,
  } from '@/lib/labels'

  const props = defineProps<{
    price: number
    targetPrice: TargetPrice | null
    negotiation: NegotiationBrief | null
    /** Rang parmi les annonces actives ; null en aperçu ou sans prix cible. */
    rank: TargetPriceRank | null
    notaryFees: NotaryFeesBreakdown | null
    /** Vrai pendant l'édition : valeurs de l'aperçu en direct, sans rang ni historique. */
    live?: boolean
  }>()

  const criteria = computed(() =>
    (props.targetPrice?.criteria ?? []).filter(c => c.maxPrice !== null)
  )
  const discount = computed(() => props.targetPrice?.discount ?? null)
</script>

<template>
  <section
    class="grid gap-3 rounded-xl border border-line bg-surface p-4 text-sm"
    aria-labelledby="target-price-title"
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="target-price-title" class="font-display text-base font-semibold">
        À partir de quel prix ?
      </h3>
      <span v-if="live" class="text-xs text-muted">aperçu en direct</span>
    </header>

    <p
      v-if="!targetPrice || targetPrice.targetPrice === null"
      class="text-muted"
    >
      Prix cible non calculable : renseignez le loyer visé (phase 2) et vérifiez
      les critères retenus dans les hypothèses.
    </p>
    <template v-else>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          class="font-display text-2xl font-semibold tabular-nums"
          data-testid="target-price"
          >{{ formatEuros(targetPrice.targetPrice) }}</span
        >
        <span v-if="targetPrice.bindingCriterion" class="text-muted">
          critère liant :
          <strong class="text-fg">{{
            TARGET_CRITERION_LABELS[targetPrice.bindingCriterion]
          }}</strong>
        </span>
        <span
          v-if="discount !== null && targetPrice.discountClass"
          class="rounded-full px-2 py-0.5 text-xs font-semibold"
          :class="DISCOUNT_CLASS_CLASSES[targetPrice.discountClass]"
          :data-discount-class="targetPrice.discountClass"
          data-testid="discount-class"
        >
          {{ discount > 0 ? 'décote nécessaire' : 'marge' }}
          {{ formatPercent(Math.abs(discount)) }} ·
          {{ DISCOUNT_CLASS_LABELS[targetPrice.discountClass] }}
        </span>
        <span v-if="rank" class="text-xs text-muted" data-testid="rank">
          {{ rank.position
          }}<sup>{{ rank.position === 1 ? 're' : 'e' }}</sup> sur
          {{ rank.total }} par décote nécessaire
        </span>
      </div>

      <ul class="grid gap-1" aria-label="Prix maximal par critère">
        <li
          v-for="c in criteria"
          :key="c.criterion"
          class="flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-2 py-1"
          :class="
            c.criterion === targetPrice.bindingCriterion
              ? 'bg-accent-soft font-semibold'
              : c.active
                ? ''
                : 'text-muted'
          "
          :data-criterion="c.criterion"
        >
          <span>
            {{ TARGET_CRITERION_LABELS[c.criterion] }}
            <span v-if="!c.active" class="text-xs font-normal text-muted"
              >(non retenu)</span
            >
          </span>
          <span class="tabular-nums">
            {{ formatEuros(c.maxPrice as number) }}
            <span v-if="c.discount !== null" class="text-xs text-muted">
              ({{ c.discount > 0 ? '−' : '+'
              }}{{ formatPercent(Math.abs(c.discount)) }})
            </span>
          </span>
        </li>
      </ul>

      <div
        v-if="negotiation && negotiation.suggestedOffer !== null"
        class="grid gap-1 rounded-lg bg-surface-2 px-3 py-2"
        data-testid="suggested-offer"
      >
        <p>
          Offre suggérée :
          <strong class="tabular-nums">{{
            formatEuros(negotiation.suggestedOffer)
          }}</strong>
          <span
            v-if="negotiation.suggestedOfferDiscount !== null"
            class="text-xs text-muted"
          >
            ({{ formatPercent(negotiation.suggestedOfferDiscount) }} sous le
            prix affiché, marge de
            {{ formatEuros(negotiation.marginToTarget ?? 0) }} sous le prix
            cible)</span
          >
        </p>
        <ul
          v-if="negotiation.arguments.length"
          class="grid gap-0.5 text-xs"
          aria-label="Arguments de négociation"
        >
          <li
            v-for="argument in negotiation.arguments"
            :key="argument.kind"
            class="flex gap-1.5"
            :data-argument="argument.kind"
          >
            <span aria-hidden="true">•</span><span>{{ argument.text }}</span>
          </li>
        </ul>
        <p v-else class="text-xs text-muted">
          Aucun levier factuel pour l'instant : l'ancienneté, les baisses de
          prix et les travaux en deviendront.
        </p>
      </div>
    </template>

    <p v-if="notaryFees" class="text-xs text-muted">
      Frais de notaire ≈ {{ formatEuros(notaryFees.total) }}
      <template v-if="notaryFees.mode === 'scale'">
        (barème : droits {{ formatEuros(notaryFees.transferTax ?? 0) }},
        émoluments
        {{
          formatEuros(
            (notaryFees.emoluments ?? 0) + (notaryFees.emolumentsVat ?? 0)
          )
        }}
        TTC, CSI {{ formatEuros(notaryFees.securityContribution ?? 0) }},
        débours {{ formatEuros(notaryFees.disbursements ?? 0) }})
      </template>
      <template v-else>(taux forfaitaire sur le net vendeur)</template>
    </p>
  </section>
</template>
