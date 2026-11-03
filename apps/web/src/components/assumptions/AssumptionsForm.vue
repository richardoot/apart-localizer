<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { AssumptionsSchema } from '@apart/contracts'
  import type { Assumptions } from '@apart/contracts'
  import FormField from '@/components/ui/FormField.vue'
  import {
    fractionToPercentInput,
    parseNumberInput,
    percentToFraction,
  } from '@/lib/format'

  const props = defineProps<{ values: Assumptions; saving?: boolean }>()
  const emit = defineEmits<{
    save: [update: { label: string | undefined; values: Assumptions }]
  }>()

  interface AssumptionsFormModel {
    downPayment: string
    interestRatePercent: string
    durationYears: string
    insuranceRatePercent: string
    notaryRatePercent: string
    vacancyMonths: string
    fixedCostsAnnual: string
    grossYieldThresholdPercent: string
    maxMonthlyEffort: string
    rentalYear: string
    label: string
  }

  function fromValues(values: Assumptions): AssumptionsFormModel {
    return {
      downPayment: String(values.downPayment),
      interestRatePercent: fractionToPercentInput(values.interestRate),
      durationYears: String(values.durationYears),
      insuranceRatePercent: fractionToPercentInput(values.insuranceRate),
      notaryRatePercent: fractionToPercentInput(values.notaryRate),
      vacancyMonths: String(values.vacancyMonths),
      fixedCostsAnnual: String(values.fixedCostsAnnual),
      grossYieldThresholdPercent: fractionToPercentInput(
        values.grossYieldThreshold
      ),
      maxMonthlyEffort: String(values.maxMonthlyEffort),
      rentalYear: String(values.rentalYear),
      label: '',
    }
  }

  const form = ref(fromValues(props.values))
  const error = ref<string | null>(null)
  watch(
    () => props.values,
    values => {
      form.value = fromValues(values)
    }
  )

  /** Le formulaire vers des hypothèses complètes, validées par le contrat. */
  function toValues(model: AssumptionsFormModel): Assumptions | null {
    const candidate = {
      ...props.values,
      downPayment: parseNumberInput(model.downPayment),
      interestRate: percentToFraction(model.interestRatePercent),
      durationYears: parseNumberInput(model.durationYears),
      insuranceRate: percentToFraction(model.insuranceRatePercent),
      notaryRate: percentToFraction(model.notaryRatePercent),
      vacancyMonths: parseNumberInput(model.vacancyMonths),
      fixedCostsAnnual: parseNumberInput(model.fixedCostsAnnual),
      grossYieldThreshold: percentToFraction(model.grossYieldThresholdPercent),
      maxMonthlyEffort: parseNumberInput(model.maxMonthlyEffort),
      rentalYear: parseNumberInput(model.rentalYear),
    }
    const parsed = AssumptionsSchema.safeParse(candidate)
    if (parsed.success) return parsed.data
    error.value = parsed.error.issues
      .map(issue => `${issue.path.join('.')} : ${issue.message}`)
      .join(' ; ')
    return null
  }

  function submit(): void {
    error.value = null
    const values = toValues(form.value)
    if (!values) return
    emit('save', { label: form.value.label.trim() || undefined, values })
  }

  const inputClass =
    'rounded-lg border border-line bg-bg px-3 py-1.5 text-sm w-full'
</script>

<template>
  <form class="grid gap-4" @submit.prevent="submit">
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <FormField label="Apport (€)" for-id="h-down">
        <input
          id="h-down"
          v-model="form.downPayment"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField label="Taux nominal (%)" for-id="h-rate">
        <input
          id="h-rate"
          v-model="form.interestRatePercent"
          :class="inputClass"
          inputmode="decimal"
        />
      </FormField>
      <FormField label="Durée (ans)" for-id="h-years">
        <input
          id="h-years"
          v-model="form.durationYears"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField label="Assurance (% du capital/an)" for-id="h-insurance">
        <input
          id="h-insurance"
          v-model="form.insuranceRatePercent"
          :class="inputClass"
          inputmode="decimal"
        />
      </FormField>
      <FormField label="Frais de notaire (% du prix)" for-id="h-notary">
        <input
          id="h-notary"
          v-model="form.notaryRatePercent"
          :class="inputClass"
          inputmode="decimal"
        />
      </FormField>
      <FormField label="Vacance (mois/an)" for-id="h-vacancy">
        <input
          id="h-vacancy"
          v-model="form.vacancyMonths"
          :class="inputClass"
          inputmode="decimal"
        />
      </FormField>
      <FormField
        label="Frais fixes (€/an)"
        for-id="h-fixed"
        hint="Assurance PNO, CFE, comptable LMNP, entretien"
      >
        <input
          id="h-fixed"
          v-model="form.fixedCostsAnnual"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField label="Seuil rendement brut (%)" for-id="h-yield">
        <input
          id="h-yield"
          v-model="form.grossYieldThresholdPercent"
          :class="inputClass"
          inputmode="decimal"
        />
      </FormField>
      <FormField label="Effort max (€/mois)" for-id="h-effort">
        <input
          id="h-effort"
          v-model="form.maxMonthlyEffort"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField label="Année de mise en location par défaut" for-id="h-year">
        <input
          id="h-year"
          v-model="form.rentalYear"
          :class="inputClass"
          inputmode="numeric"
        />
      </FormField>
      <FormField
        label="Libellé de cette version"
        for-id="h-label"
        hint="Facultatif : « taux négocié mars »"
      >
        <input id="h-label" v-model="form.label" :class="inputClass" />
      </FormField>
    </div>
    <p
      v-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error }}
    </p>
    <div class="flex items-center justify-between gap-3">
      <p class="text-xs text-muted">
        La taxe foncière et les charges de copropriété sont saisies par annonce.
        Chaque enregistrement crée une nouvelle version datée.
      </p>
      <button
        type="submit"
        class="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
        :disabled="saving"
      >
        {{ saving ? 'Enregistrement…' : 'Enregistrer les hypothèses' }}
      </button>
    </div>
  </form>
</template>
