<script setup lang="ts">
  import { REFERENCE_LOAN_AMOUNT } from '@apart/domain'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import { useAssumptionsDraftContext } from '@/composables/useAssumptionsDraft'
  import { formatEuros, formatEurosPerMonth } from '@/lib/format'
  import UiField from '@/components/ui/UiField.vue'

  /**
   * « Comment finances-tu l'achat ? » (lot 13) : apport, taux, durée,
   * assurance, et le repère « Pour 100 000 € empruntés », recalculé en
   * direct par `@apart/domain` (`referenceMonthlyPayment`).
   */
  const { form, changeOf, errorOf, readings } = useAssumptionsDraftContext()
</script>

<template>
  <div class="grid gap-3.5">
    <div
      class="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] sm:gap-3.5"
    >
      <UiField
        id="h-down"
        v-model="form.downPayment"
        class="col-span-2 sm:col-span-1"
        label="Apport"
        unit="€"
        inputmode="numeric"
        :change="changeOf('downPayment')"
        :error="errorOf('downPayment')"
      />
      <UiField
        id="h-rate"
        v-model="form.interestRatePercent"
        label="Taux du crédit"
        unit="% / an"
        inputmode="decimal"
        hint="taux nominal, hors assurance"
        :change="changeOf('interestRatePercent')"
        :error="errorOf('interestRatePercent')"
      />
      <UiField
        id="h-years"
        v-model="form.durationYears"
        label="Durée"
        unit="ans"
        inputmode="numeric"
        :change="changeOf('durationYears')"
        :error="errorOf('durationYears')"
      />
      <UiField
        id="h-insurance"
        v-model="form.insuranceRatePercent"
        class="col-span-2 sm:col-span-1"
        label="Assurance emprunteur"
        unit="% / an"
        inputmode="decimal"
        hint="du capital emprunté"
        term="loan_insurance"
        :change="changeOf('insuranceRatePercent')"
        :error="errorOf('insuranceRatePercent')"
      />
    </div>
    <p
      class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm tabular-nums"
      data-testid="reference-payment"
    >
      <span class="flex items-center gap-1.5"
        >Pour {{ formatEuros(REFERENCE_LOAN_AMOUNT) }} empruntés
        <DefinitionButton term="monthly_payment"
      /></span>
      <strong v-if="readings.referencePayment !== null"
        >≈ {{ formatEurosPerMonth(readings.referencePayment) }}, assurance
        comprise</strong
      >
      <span v-else class="text-muted"
        >à calculer : taux et durée à corriger</span
      >
    </p>
  </div>
</template>
