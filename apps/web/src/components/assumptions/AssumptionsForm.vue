<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { AssumptionsSchema } from '@apart/contracts'
  import type {
    Assumptions,
    AssumptionsImpact,
    NotaryMode,
    TargetCriterion,
  } from '@apart/contracts'
  import FormField from '@/components/ui/FormField.vue'
  import {
    formatEuros,
    fractionToPercentInput,
    parseNumberInput,
    percentToFraction,
  } from '@/lib/format'
  import { TARGET_CRITERION_LABELS, VERDICT_LABELS } from '@/lib/labels'

  const props = defineProps<{
    values: Assumptions
    saving?: boolean
    /** Impact des valeurs saisies sur les annonces actives, rendu par la page après « Voir l'impact ». */
    impact?: AssumptionsImpact | null
    previewing?: boolean
  }>()
  const emit = defineEmits<{
    save: [update: { label: string | undefined; values: Assumptions }]
    preview: [values: Assumptions]
  }>()

  interface BandForm {
    upTo: string
    ratePercent: string
  }

  interface AssumptionsFormModel {
    downPayment: string
    interestRatePercent: string
    durationYears: string
    insuranceRatePercent: string
    notaryRatePercent: string
    notaryMode: NotaryMode
    scale: {
      departmentalRatePercent: string
      communalRatePercent: string
      collectionFeeRatePercent: string
      bands: BandForm[]
      emolumentVatRatePercent: string
      securityContributionRatePercent: string
      securityContributionMinimum: string
      disbursements: string
      label: string
    }
    vacancyMonths: string
    fixedCostsAnnual: string
    grossYieldThresholdPercent: string
    netYieldThresholdPercent: string
    maxMonthlyEffort: string
    targetCriteria: TargetCriterion[]
    negotiableDiscountPercent: string
    tightDiscountPercent: string
    rentalYear: string
    label: string
  }

  /** Les critères qu'on peut retenir ; le marché (DVF) attend le lot 4. */
  const CRITERIA: readonly TargetCriterion[] = [
    'gross_yield',
    'net_yield',
    'effort',
    'rent_x220',
  ]

  function fromValues(values: Assumptions): AssumptionsFormModel {
    return {
      downPayment: String(values.downPayment),
      interestRatePercent: fractionToPercentInput(values.interestRate),
      durationYears: String(values.durationYears),
      insuranceRatePercent: fractionToPercentInput(values.insuranceRate),
      notaryRatePercent: fractionToPercentInput(values.notaryRate),
      notaryMode: values.notaryMode,
      scale: {
        departmentalRatePercent: fractionToPercentInput(
          values.notaryScale.departmentalRate
        ),
        communalRatePercent: fractionToPercentInput(
          values.notaryScale.communalRate
        ),
        collectionFeeRatePercent: fractionToPercentInput(
          values.notaryScale.collectionFeeRate
        ),
        bands: values.notaryScale.emolumentBands.map(band => ({
          upTo: band.upTo === null ? '' : String(band.upTo),
          ratePercent: fractionToPercentInput(band.rate),
        })),
        emolumentVatRatePercent: fractionToPercentInput(
          values.notaryScale.emolumentVatRate
        ),
        securityContributionRatePercent: fractionToPercentInput(
          values.notaryScale.securityContributionRate
        ),
        securityContributionMinimum: String(
          values.notaryScale.securityContributionMinimum
        ),
        disbursements: String(values.notaryScale.disbursements),
        label: values.notaryScale.label,
      },
      vacancyMonths: String(values.vacancyMonths),
      fixedCostsAnnual: String(values.fixedCostsAnnual),
      grossYieldThresholdPercent: fractionToPercentInput(
        values.grossYieldThreshold
      ),
      netYieldThresholdPercent: fractionToPercentInput(
        values.netYieldThreshold
      ),
      maxMonthlyEffort: String(values.maxMonthlyEffort),
      targetCriteria: [...values.targetCriteria],
      negotiableDiscountPercent: fractionToPercentInput(
        values.negotiableDiscount
      ),
      tightDiscountPercent: fractionToPercentInput(values.tightDiscount),
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
    const netYield = percentToFraction(model.netYieldThresholdPercent)
    const candidate = {
      ...props.values,
      downPayment: parseNumberInput(model.downPayment),
      interestRate: percentToFraction(model.interestRatePercent),
      durationYears: parseNumberInput(model.durationYears),
      insuranceRate: percentToFraction(model.insuranceRatePercent),
      notaryRate: percentToFraction(model.notaryRatePercent),
      notaryMode: model.notaryMode,
      notaryScale: {
        departmentalRate: percentToFraction(
          model.scale.departmentalRatePercent
        ),
        communalRate: percentToFraction(model.scale.communalRatePercent),
        collectionFeeRate: percentToFraction(
          model.scale.collectionFeeRatePercent
        ),
        emolumentBands: model.scale.bands.map(band => ({
          upTo: band.upTo.trim() === '' ? null : parseNumberInput(band.upTo),
          rate: percentToFraction(band.ratePercent),
        })),
        emolumentVatRate: percentToFraction(
          model.scale.emolumentVatRatePercent
        ),
        securityContributionRate: percentToFraction(
          model.scale.securityContributionRatePercent
        ),
        securityContributionMinimum: parseNumberInput(
          model.scale.securityContributionMinimum
        ),
        disbursements: parseNumberInput(model.scale.disbursements),
        label: model.scale.label.trim(),
      },
      vacancyMonths: parseNumberInput(model.vacancyMonths),
      fixedCostsAnnual: parseNumberInput(model.fixedCostsAnnual),
      grossYieldThreshold: percentToFraction(model.grossYieldThresholdPercent),
      netYieldThreshold: netYield,
      maxMonthlyEffort: parseNumberInput(model.maxMonthlyEffort),
      targetCriteria: model.targetCriteria,
      negotiableDiscount: percentToFraction(model.negotiableDiscountPercent),
      tightDiscount: percentToFraction(model.tightDiscountPercent),
      rentalYear: parseNumberInput(model.rentalYear),
    }
    const parsed = AssumptionsSchema.safeParse(candidate)
    if (parsed.success) {
      if (
        parsed.data.targetCriteria.includes('net_yield') &&
        parsed.data.netYieldThreshold === null
      ) {
        error.value =
          'netYieldThreshold : saisissez un seuil de rendement net pour retenir ce critère'
        return null
      }
      if (parsed.data.tightDiscount < parsed.data.negotiableDiscount) {
        error.value =
          'tightDiscount : le seuil « tendu » doit être au moins égal au seuil « négociable »'
        return null
      }
      return parsed.data
    }
    error.value = parsed.error.issues
      .map(issue => `${issue.path.join('.')} : ${issue.message}`)
      .join(' ; ')
    return null
  }

  function toggleCriterion(criterion: TargetCriterion, checked: boolean): void {
    const current = form.value.targetCriteria.filter(c => c !== criterion)
    form.value.targetCriteria = checked ? [...current, criterion] : current
  }

  function submit(): void {
    error.value = null
    const values = toValues(form.value)
    if (!values) return
    emit('save', { label: form.value.label.trim() || undefined, values })
  }

  function preview(): void {
    error.value = null
    const values = toValues(form.value)
    if (!values) return
    emit('preview', values)
  }

  const bandLabel = (index: number): string => {
    const previous = form.value.scale.bands[index - 1]?.upTo
    const current = form.value.scale.bands[index]?.upTo
    if (current === undefined || current.trim() === '') {
      return `au-delà de ${previous ?? '0'} €`
    }
    return `${previous ?? '0'} à ${current} €`
  }

  const impactSummary = computed(() => {
    const impact = props.impact
    if (!impact) return null
    return impact.changedVerdicts === 0
      ? `Aucun changement de verdict sur ${impact.total} annonce(s) active(s).`
      : `${impact.changedVerdicts} annonce(s) sur ${impact.total} changent de verdict (cible ${impact.byVerdictBefore.target} → ${impact.byVerdictAfter.target}, à creuser ${impact.byVerdictBefore.to_dig} → ${impact.byVerdictAfter.to_dig}, hors cible ${impact.byVerdictBefore.off_target} → ${impact.byVerdictAfter.off_target}).`
  })

  const inputClass =
    'rounded-lg border border-line bg-bg px-3 py-1.5 text-sm w-full'
</script>

<template>
  <form class="grid gap-5" @submit.prevent="submit">
    <fieldset class="grid gap-3">
      <legend class="font-display text-base font-semibold">Financement</legend>
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
        <FormField label="Année de mise en location par défaut" for-id="h-year">
          <input
            id="h-year"
            v-model="form.rentalYear"
            :class="inputClass"
            inputmode="numeric"
          />
        </FormField>
      </div>
    </fieldset>

    <fieldset class="grid gap-3">
      <legend class="font-display text-base font-semibold">
        Frais de notaire
      </legend>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FormField
          label="Mode de calcul"
          for-id="h-notary-mode"
          hint="Le taux forfaitaire est la parité avec l'artefact ; le barème détaille droits, émoluments, CSI et débours"
        >
          <select
            id="h-notary-mode"
            v-model="form.notaryMode"
            :class="inputClass"
          >
            <option value="rate">Taux forfaitaire</option>
            <option value="scale">Barème (droits, émoluments, débours)</option>
          </select>
        </FormField>
        <FormField
          v-if="form.notaryMode === 'rate'"
          label="Frais de notaire (% du net vendeur)"
          for-id="h-notary"
        >
          <input
            id="h-notary"
            v-model="form.notaryRatePercent"
            :class="inputClass"
            inputmode="decimal"
          />
        </FormField>
      </div>
      <div
        v-if="form.notaryMode === 'scale'"
        class="grid gap-3 rounded-xl bg-surface-2 p-3"
        data-testid="notary-scale"
      >
        <p class="text-xs text-muted">
          {{ form.scale.label || 'Barème personnalisé' }} · les forfaits sont
          des estimations (≈).
        </p>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField
            label="Droit départemental (%)"
            for-id="h-dept"
            hint="5 % en Gironde depuis le 1er mai 2025 ; 4,5 % pour les primo-accédants"
          >
            <input
              id="h-dept"
              v-model="form.scale.departmentalRatePercent"
              :class="inputClass"
              inputmode="decimal"
            />
          </FormField>
          <FormField label="Taxe communale (%)" for-id="h-communal">
            <input
              id="h-communal"
              v-model="form.scale.communalRatePercent"
              :class="inputClass"
              inputmode="decimal"
            />
          </FormField>
          <FormField
            label="Frais d'assiette (% du droit départemental)"
            for-id="h-collection"
          >
            <input
              id="h-collection"
              v-model="form.scale.collectionFeeRatePercent"
              :class="inputClass"
              inputmode="decimal"
            />
          </FormField>
          <FormField label="TVA sur émoluments (%)" for-id="h-vat">
            <input
              id="h-vat"
              v-model="form.scale.emolumentVatRatePercent"
              :class="inputClass"
              inputmode="decimal"
            />
          </FormField>
          <FormField
            label="Contribution de sécurité immobilière (%)"
            for-id="h-csi"
          >
            <input
              id="h-csi"
              v-model="form.scale.securityContributionRatePercent"
              :class="inputClass"
              inputmode="decimal"
            />
          </FormField>
          <FormField label="CSI minimum (€)" for-id="h-csi-min">
            <input
              id="h-csi-min"
              v-model="form.scale.securityContributionMinimum"
              :class="inputClass"
              inputmode="numeric"
            />
          </FormField>
          <FormField
            label="Débours et formalités (€, estimés)"
            for-id="h-disbursements"
          >
            <input
              id="h-disbursements"
              v-model="form.scale.disbursements"
              :class="inputClass"
              inputmode="numeric"
            />
          </FormField>
          <FormField label="Origine du barème" for-id="h-scale-label" full>
            <input
              id="h-scale-label"
              v-model="form.scale.label"
              :class="inputClass"
            />
          </FormField>
        </div>
        <fieldset class="grid gap-2">
          <legend class="text-xs font-medium text-muted">
            Émoluments proportionnels par tranche (art. A444-91 du code de
            commerce)
          </legend>
          <div
            v-for="(band, index) in form.scale.bands"
            :key="index"
            class="grid grid-cols-[1fr_1fr_auto] items-center gap-2 text-sm"
          >
            <input
              v-model="band.upTo"
              :class="inputClass"
              inputmode="numeric"
              :placeholder="
                index === form.scale.bands.length - 1
                  ? 'sans limite'
                  : 'jusqu’à (€)'
              "
              :aria-label="`Borne supérieure de la tranche ${index + 1} en euros`"
            />
            <input
              v-model="band.ratePercent"
              :class="inputClass"
              inputmode="decimal"
              :aria-label="`Taux de la tranche ${index + 1} en pourcentage`"
            />
            <span class="text-xs text-muted">{{ bandLabel(index) }}</span>
          </div>
        </fieldset>
      </div>
    </fieldset>

    <fieldset class="grid gap-3">
      <legend class="font-display text-base font-semibold">
        Cible, prix cible et décote
      </legend>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label="Seuil rendement brut (%)" for-id="h-yield">
          <input
            id="h-yield"
            v-model="form.grossYieldThresholdPercent"
            :class="inputClass"
            inputmode="decimal"
          />
        </FormField>
        <FormField
          label="Seuil rendement net (%)"
          for-id="h-net-yield"
          hint="Vide = critère inactif pour le prix cible"
        >
          <input
            id="h-net-yield"
            v-model="form.netYieldThresholdPercent"
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
        <FormField
          label="Décote « négociable » jusqu'à (%)"
          for-id="h-negotiable"
        >
          <input
            id="h-negotiable"
            v-model="form.negotiableDiscountPercent"
            :class="inputClass"
            inputmode="decimal"
          />
        </FormField>
        <FormField
          label="Décote « tendue » jusqu'à (%)"
          for-id="h-tight"
          hint="Au-delà : hors de portée"
        >
          <input
            id="h-tight"
            v-model="form.tightDiscountPercent"
            :class="inputClass"
            inputmode="decimal"
          />
        </FormField>
      </div>
      <fieldset class="grid gap-1" data-testid="target-criteria">
        <legend class="text-xs font-medium text-muted">
          Critères retenus pour le prix cible (le plus contraignant l'emporte)
        </legend>
        <div class="flex flex-wrap gap-3 text-sm">
          <label
            v-for="criterion in CRITERIA"
            :key="criterion"
            class="flex items-center gap-1.5"
          >
            <input
              type="checkbox"
              class="size-4 accent-[var(--accent)]"
              :checked="form.targetCriteria.includes(criterion)"
              :aria-label="TARGET_CRITERION_LABELS[criterion]"
              @change="
                toggleCriterion(
                  criterion,
                  ($event.target as HTMLInputElement).checked
                )
              "
            />
            {{ TARGET_CRITERION_LABELS[criterion] }}
          </label>
          <span class="text-xs text-muted">Marché (DVF) : lot 4</span>
        </div>
      </fieldset>
    </fieldset>

    <FormField
      label="Libellé de cette version"
      for-id="h-label"
      hint="Facultatif : « taux négocié mars »"
    >
      <input id="h-label" v-model="form.label" :class="inputClass" />
    </FormField>

    <p
      v-if="error"
      role="alert"
      class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
    >
      {{ error }}
    </p>

    <div
      v-if="impact"
      class="grid gap-1 rounded-lg bg-surface-2 px-3 py-2 text-sm"
      data-testid="impact"
      aria-live="polite"
    >
      <p>{{ impactSummary }}</p>
      <ul v-if="impact.changes.length" class="grid gap-0.5 text-xs">
        <li v-for="change in impact.changes" :key="change.listingId">
          {{ change.title }} : {{ VERDICT_LABELS[change.before] }} →
          {{ VERDICT_LABELS[change.after] }}
          <template v-if="change.targetPriceAfter !== null">
            · prix cible {{ formatEuros(change.targetPriceAfter) }}</template
          >
        </li>
      </ul>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-muted">
        La taxe foncière et les charges de copropriété sont saisies par annonce.
        Chaque enregistrement crée une nouvelle version datée.
      </p>
      <span class="flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-60"
          :disabled="previewing"
          @click="preview"
        >
          {{ previewing ? 'Calcul…' : "Voir l'impact" }}
        </button>
        <button
          type="submit"
          class="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
          :disabled="saving"
        >
          {{ saving ? 'Enregistrement…' : 'Enregistrer les hypothèses' }}
        </button>
      </span>
    </div>
  </form>
</template>
