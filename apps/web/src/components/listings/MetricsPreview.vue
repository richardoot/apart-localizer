<script setup lang="ts">
  import type { ListingEvaluation } from '@apart/contracts'
  import {
    formatEuros,
    formatEurosPerM2,
    formatEurosPerMonth,
    formatPercent,
  } from '@/lib/format'
  import RentalPill from './RentalPill.vue'
  import VerdictPill from './VerdictPill.vue'

  defineProps<{ evaluation: ListingEvaluation | null; compact?: boolean }>()
</script>

<template>
  <section
    class="rounded-xl bg-surface-2 px-4 py-3 text-sm tabular-nums"
    aria-live="polite"
    aria-label="Aperçu des indicateurs"
  >
    <p v-if="!evaluation" class="text-muted">
      Saisissez un prix et un loyer visé pour voir les indicateurs.
    </p>
    <template v-else>
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <VerdictPill :verdict="evaluation.metrics.verdict" />
        <RentalPill :verdict="evaluation.rental.verdict" />
        <span
          v-if="evaluation.targetPrice.targetPrice !== null"
          class="text-xs text-muted"
        >
          Prix cible {{ formatEuros(evaluation.targetPrice.targetPrice) }}
          <template v-if="evaluation.targetPrice.discount !== null">
            (décote {{ formatPercent(evaluation.targetPrice.discount) }})
          </template>
        </span>
      </div>
      <dl
        class="grid grid-cols-2 gap-x-4 gap-y-1"
        :class="compact ? '' : 'sm:grid-cols-3'"
      >
        <div class="flex justify-between gap-2">
          <dt class="text-muted">Coût total</dt>
          <dd data-testid="total-cost">
            {{ formatEuros(evaluation.metrics.totalCost) }}
          </dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-muted">Mensualité</dt>
          <dd>{{ formatEurosPerMonth(evaluation.metrics.monthlyPayment) }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-muted">Prix au m²</dt>
          <dd>{{ formatEurosPerM2(evaluation.metrics.pricePerM2) }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-muted">Loyer retenu</dt>
          <dd>
            {{ formatEurosPerMonth(evaluation.metrics.rent) }}
            <span
              v-if="evaluation.metrics.rentCap !== null"
              class="text-xs text-muted"
              >(plafond {{ formatEuros(evaluation.metrics.rentCap) }})</span
            >
          </dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-muted">Rendement brut</dt>
          <dd data-testid="gross-yield">
            {{ formatPercent(evaluation.metrics.grossYield) }}
          </dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-muted">Rendement net</dt>
          <dd>
            <span
              v-if="
                evaluation.metrics.propertyTaxEstimated ||
                evaluation.metrics.nonRecoverableChargesEstimated
              "
              title="Valeur estimée faute de saisie"
              >≈ </span
            >{{ formatPercent(evaluation.metrics.netYield) }}
          </dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-muted">Effort mensuel</dt>
          <dd data-testid="effort">
            {{ formatEurosPerMonth(evaluation.metrics.effort) }}
          </dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-muted">Taxe foncière</dt>
          <dd>
            <span v-if="evaluation.metrics.propertyTaxEstimated">≈ </span
            >{{ formatEuros(evaluation.metrics.propertyTax) }}/an
          </dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-muted">Repère 220 × loyer</dt>
          <dd>{{ formatEuros(evaluation.metrics.maxCostRule220) }}</dd>
        </div>
      </dl>
      <p class="mt-2 text-xs text-muted">
        « ≈ » : valeur estimée faute de saisie (taxe foncière = un mois de
        loyer, part non récupérable = 25 % des charges).
      </p>
    </template>
  </section>
</template>
