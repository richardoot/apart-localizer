<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    Assumptions,
    DiscountClass,
    NegotiationBrief,
    NotaryFeesBreakdown,
    TargetPrice,
    TargetPriceRank,
  } from '@apart/contracts'
  import { priceRangeGauge } from '@apart/domain'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import {
    formatCssPercent,
    formatEuros,
    formatPercent,
    formatRate,
    formatSignedEurosPerMonth,
  } from '@/lib/format'
  import {
    DISCOUNT_CLASS_LABELS,
    TARGET_CRITERION_LABELS,
    VERDICT_FAILURE_LABELS,
    VERDICT_NEAR_MISS_LABELS,
  } from '@/lib/labels'
  import CostBasisBadge from './CostBasisBadge.vue'
  import TargetCriteriaTable from './TargetCriteriaTable.vue'
  import VerdictPill from './VerdictPill.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { cardClasses } from '@/lib/ui'
  import type { Tone } from '@/lib/ui'

  /**
   * Lot 19 (ADR 0029) : le « Prix cible » de l'onglet Négocier. Le prix
   * cible est le prix affiché maximal pour rester « Cible » (le plus bas des
   * critères retenus) : en grand, avec la décote nécessaire et sa classe, le
   * critère liant, le rang ; une jauge resserrée (`priceRangeGauge`) où
   * tombent l'offre suggérée et le prix affiché ; l'annonce évaluée au prix
   * cible ; le détail par critère et les frais de notaire repliés. Pendant
   * une modification de la fiche, l'aperçu en direct, sans rang.
   */
  const props = defineProps<{
    price: number
    targetPrice: TargetPrice | null
    negotiation: NegotiationBrief | null
    /** Rang parmi les annonces actives ; null en aperçu ou sans prix cible. */
    rank: TargetPriceRank | null
    notaryFees: NotaryFeesBreakdown | null
    /** Hypothèses de l'espace : seuils de la colonne « Exigence ». */
    assumptions?: Assumptions | null
    /** Loyer retenu, pour le repère 220 × loyer. */
    rent?: number
    /** Vrai pendant l'édition : valeurs de l'aperçu en direct, sans rang ni historique. */
    live?: boolean
  }>()
  /** Lot 25 : « Préparer une offre » au montant suggéré (le formulaire de « Prix et offres »). */
  const emit = defineEmits<{ prepareOffer: [amount: number] }>()

  const target = computed(() => props.targetPrice?.targetPrice ?? null)
  const discount = computed(() => props.targetPrice?.discount ?? null)
  const offer = computed(() => props.negotiation?.suggestedOffer ?? null)
  const gauge = computed(() =>
    priceRangeGauge(props.price, target.value, offer.value)
  )
  const atTarget = computed(() => props.targetPrice?.atTarget ?? null)
  const DISCOUNT_TONES: Record<DiscountClass, Tone> = {
    in_target: 'good',
    negotiable: 'good',
    tight: 'warn',
    out_of_reach: 'bad',
  }
</script>

<template>
  <section
    class="grid gap-3.5 text-sm"
    :class="cardClasses()"
    aria-labelledby="target-price-title"
    data-testid="target-price-section"
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h2
        id="target-price-title"
        class="inline-flex items-center gap-1.5 text-base font-semibold"
      >
        Prix cible <DefinitionButton term="target_price" />
      </h2>
      <span
        v-if="live"
        class="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-fg"
        data-testid="target-live"
        >aperçu en direct</span
      >
    </header>

    <p v-if="target === null || !targetPrice" class="text-muted">
      Prix cible non calculable : renseigne le loyer visé (phase 2, onglet
      Budget) et vérifie les critères retenus dans les hypothèses.
    </p>
    <template v-else>
      <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <strong
          class="font-display text-[30px] leading-none font-bold text-accent tabular-nums"
          data-testid="target-price"
          >{{ formatEuros(target) }}</strong
        >
        <span
          v-if="discount !== null && discount > 0"
          class="text-fg"
          data-testid="target-discount-text"
          >{{ formatPercent(discount) }} sous le prix affiché</span
        >
        <span v-else-if="discount !== null" data-testid="target-discount-text"
          >marge : le prix affiché est déjà
          {{ formatPercent(Math.abs(discount)) }} sous le prix cible</span
        >
        <span class="text-muted" data-testid="target-limit"
          >au-dessus de {{ formatEuros(target) }}, l’annonce n’est plus « Cible
          »</span
        >
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <CostBasisBadge basis="price" />
        <UiBadge
          v-if="discount !== null && targetPrice.discountClass"
          :tone="DISCOUNT_TONES[targetPrice.discountClass]"
          :data-discount-class="targetPrice.discountClass"
          data-testid="discount-class"
        >
          {{ discount > 0 ? 'Décote nécessaire' : 'Marge' }}
          {{ formatPercent(Math.abs(discount)) }} ·
          {{ DISCOUNT_CLASS_LABELS[targetPrice.discountClass] }}
        </UiBadge>
        <DefinitionButton term="discount" />
        <span
          v-if="targetPrice.bindingCriterion"
          class="inline-flex items-center gap-1.5 text-muted"
        >
          Fixé par le
          <strong class="text-fg">{{
            TARGET_CRITERION_LABELS[targetPrice.bindingCriterion].toLowerCase()
          }}</strong>
          (critère liant)
          <DefinitionButton term="binding_criterion" />
        </span>
        <span v-if="rank" class="text-xs text-muted" data-testid="rank">
          {{ rank.position
          }}<sup>{{ rank.position === 1 ? 're' : 'e' }}</sup> sur
          {{ rank.total }} par décote nécessaire
        </span>
      </div>

      <div v-if="gauge" class="grid gap-1.5" data-testid="price-range">
        <div
          class="relative h-3 rounded-full bg-warn-soft"
          aria-hidden="true"
          data-testid="price-gauge"
        >
          <div
            class="absolute inset-y-0 left-0 rounded-l-full bg-accent-soft"
            :style="{ width: formatCssPercent(gauge.targetShare ?? 0) }"
            data-marker="target-zone"
          />
          <div
            v-if="gauge.offerShare !== null"
            class="absolute -top-[5px] size-[22px] -translate-x-1/2 rounded-full border-2 border-surface bg-accent"
            :style="{ left: formatCssPercent(gauge.offerShare) }"
            data-marker="offer"
          />
          <div
            class="absolute -top-[5px] h-[22px] w-[3px] -translate-x-1/2 rounded-sm bg-fg"
            :style="{ left: formatCssPercent(gauge.listedShare) }"
            data-marker="listed"
          />
        </div>
        <div
          class="flex flex-wrap justify-between gap-x-3 text-xs text-muted tabular-nums"
        >
          <span>{{ formatEuros(gauge.min) }}</span>
          <span class="text-accent" data-testid="gauge-target"
            >Cible jusqu’à {{ formatEuros(target) }}</span
          >
          <span class="text-fg" data-testid="gauge-listed"
            >{{ formatEuros(price) }} affiché</span
          >
        </div>
      </div>

      <div
        v-if="negotiation && negotiation.suggestedOffer !== null"
        class="grid gap-1 rounded-xl bg-surface-2 px-3.5 py-3"
        data-testid="suggested-offer"
      >
        <p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="inline-flex items-center gap-1.5 self-center"
            ><span
              aria-hidden="true"
              class="inline-block size-3 rounded-full bg-accent" />
            Offre suggérée <DefinitionButton term="suggested_offer"
          /></span>
          <strong class="text-lg tabular-nums">{{
            formatEuros(negotiation.suggestedOffer)
          }}</strong>
        </p>
        <p class="text-xs text-muted">
          Prix cible arrondi au millier inférieur<template
            v-if="negotiation.marginToTarget !== null"
            >, {{ formatEuros(negotiation.marginToTarget) }} de marge sous le
            prix cible</template
          ><template v-if="negotiation.suggestedOfferDiscount !== null"
            >, {{ formatPercent(negotiation.suggestedOfferDiscount) }} sous le
            prix affiché</template
          >.
        </p>
        <!-- Lot 25 : l'action de l'onglet dès le premier écran (téléphone compris). -->
        <UiButton
          variant="primary"
          size="sm"
          class="mt-1 justify-self-start"
          data-testid="prepare-suggested-offer"
          @click="emit('prepareOffer', negotiation.suggestedOffer)"
        >
          Préparer une offre à {{ formatEuros(negotiation.suggestedOffer) }}
        </UiButton>
      </div>

      <p
        v-if="atTarget"
        class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums"
        data-testid="at-target"
      >
        <!-- Une phrase par élément du flex : la virgule reste collée au mot. -->
        <span class="text-muted">Au prix cible :</span>
        <span
          >coût tout compris
          <strong data-testid="at-target-cost">{{
            formatEuros(atTarget.totalCost)
          }}</strong
          >{{ ' ' }}<CostBasisBadge basis="all_in" compact />,</span
        >
        <span
          >rendement brut <strong>{{ formatRate(atTarget.grossYield) }}</strong
          >,</span
        >
        <span
          >effort
          <strong>{{ formatSignedEurosPerMonth(atTarget.effort) }}</strong
          >.</span
        >
        <!-- Lot 25 : le verdict est le jugement « Rentabilité ». -->
        <span class="text-muted">Rentabilité :</span>
        <VerdictPill :verdict="atTarget.verdict" />
        <span
          v-if="atTarget.verdict !== 'target'"
          class="text-xs text-muted"
          data-testid="at-target-why"
          >{{
            atTarget.verdict === 'to_dig'
              ? `de peu : ${atTarget.nearMisses.map(n => VERDICT_NEAR_MISS_LABELS[n]).join(', ')}`
              : `même à ce prix, en échec : ${atTarget.failures.map(f => VERDICT_FAILURE_LABELS[f]).join(', ')}`
          }}</span
        >
      </p>
    </template>

    <details
      class="rounded-xl border border-line px-3.5"
      data-testid="target-details"
    >
      <summary
        class="flex min-h-[52px] cursor-pointer items-center text-sm font-semibold"
      >
        Détail par critère et frais de notaire
      </summary>
      <div class="grid gap-3 pb-3">
        <p class="text-muted">
          Pour chaque critère : le prix affiché maximal, et le coût tout compris
          qu’il entraîne. Le prix cible est le plus bas des critères retenus.
        </p>
        <TargetCriteriaTable
          v-if="targetPrice"
          :target-price="targetPrice"
          :assumptions="assumptions ?? null"
          :rent="rent ?? 0"
        />
        <p v-if="notaryFees" class="text-xs text-muted">
          Frais de notaire ≈ {{ formatEuros(notaryFees.total) }}, comptés dans
          le coût tout compris
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
      </div>
    </details>
  </section>
</template>
