<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    Assumptions,
    NegotiationBrief,
    NotaryFeesBreakdown,
    TargetPrice,
    TargetPriceRank,
  } from '@apart/contracts'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import { formatEuros, formatPercent } from '@/lib/format'
  import {
    DISCOUNT_CLASS_CLASSES,
    DISCOUNT_CLASS_LABELS,
    TARGET_CRITERION_LABELS,
  } from '@/lib/labels'
  import CostBasisBadge from './CostBasisBadge.vue'
  import TargetCriteriaTable from './TargetCriteriaTable.vue'

  /**
   * « À partir de quel prix ? » (onglet Négocier) : le prix cible, la décote
   * et son rang, le tableau des critères (prix affiché maximal et coût tout
   * compris maximal), l'offre suggérée et les arguments de négociation, le
   * détail des frais de notaire.
   */
  const props = defineProps<{
    price: number
    targetPrice: TargetPrice | null
    negotiation: NegotiationBrief | null
    /** Rang parmi les annonces actives ; null en aperçu ou sans prix cible. */
    rank: TargetPriceRank | null
    notaryFees: NotaryFeesBreakdown | null
    /** Hypothèses de l'annonce : seuils de la colonne « Exigence ». */
    assumptions?: Assumptions | null
    /** Loyer retenu, pour le repère 220 × loyer. */
    rent?: number
    /** Vrai pendant l'édition : valeurs de l'aperçu en direct, sans rang ni historique. */
    live?: boolean
  }>()

  const discount = computed(() => props.targetPrice?.discount ?? null)
</script>

<template>
  <section
    class="grid gap-3 rounded-2xl border border-line bg-surface p-4 text-sm sm:p-5"
    aria-labelledby="target-price-title"
  >
    <header class="grid gap-1">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 id="target-price-title" class="font-display text-lg font-bold">
          À partir de quel prix ?
        </h3>
        <span v-if="live" class="text-xs text-muted">aperçu en direct</span>
      </div>
      <p class="text-muted">
        Pour chaque critère : le prix affiché maximal, et le coût tout compris
        qu’il entraîne. Le prix cible est le plus bas des critères retenus.
      </p>
    </header>

    <p
      v-if="!targetPrice || targetPrice.targetPrice === null"
      class="text-muted"
    >
      Prix cible non calculable : renseignez le loyer visé (phase 2) et vérifiez
      les critères retenus dans les hypothèses.
    </p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          class="font-display text-2xl font-bold text-accent tabular-nums"
          data-testid="target-price"
          >{{ formatEuros(targetPrice.targetPrice) }}</span
        >
        <CostBasisBadge basis="price" />
        <DefinitionButton term="target_price" />
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

      <TargetCriteriaTable
        :target-price="targetPrice"
        :assumptions="assumptions ?? null"
        :rent="rent ?? 0"
      />

      <div
        v-if="negotiation && negotiation.suggestedOffer !== null"
        class="grid gap-1.5 rounded-xl bg-surface-2 px-3.5 py-3"
        data-testid="suggested-offer"
      >
        <p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="inline-flex items-center gap-1.5 self-center"
            >Offre suggérée <DefinitionButton term="suggested_offer"
          /></span>
          <strong class="text-lg tabular-nums">{{
            formatEuros(negotiation.suggestedOffer)
          }}</strong>
          <span class="text-xs text-muted">
            prix cible arrondi au millier inférieur<template
              v-if="negotiation.marginToTarget !== null"
              >, {{ formatEuros(negotiation.marginToTarget) }} de marge sous le
              prix cible</template
            ><template v-if="negotiation.suggestedOfferDiscount !== null"
              >, {{ formatPercent(negotiation.suggestedOfferDiscount) }} sous le
              prix affiché</template
            >
          </span>
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
      Frais de notaire ≈ {{ formatEuros(notaryFees.total) }}, comptés dans le
      coût tout compris
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
