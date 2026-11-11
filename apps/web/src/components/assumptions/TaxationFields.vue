<script setup lang="ts">
  import { computed } from 'vue'
  import {
    FURNISHED_KINDS,
    TAX_REGIMES,
    TMI_CHOICES,
  } from '@/lib/assumptions-form'
  import { useAssumptionsDraftContext } from '@/composables/useAssumptionsDraft'
  import { formatEuros, formatRateCompact } from '@/lib/format'
  import { FURNISHED_RENTAL_KIND_LABELS, TAX_REGIME_LABELS } from '@/lib/labels'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiField from '@/components/ui/UiField.vue'

  /**
   * « Fiscalité et revente » (lot 13). Sur ordinateur, repliée par défaut :
   * des pastilles résumé ; dépliée (et toujours sur mobile, dans
   * l'accordéon) : Impôt puis Revente et projection, et les paramètres
   * fiscaux datés. Des estimations, pas un conseil fiscal.
   */
  const { desktop, values, form, changeOf, errorOf, pills, openPanels } =
    useAssumptionsDraftContext()

  const expanded = computed(() => !desktop.value || openPanels.value.taxation)

  const TMI_OPTIONS = [
    { value: '', label: 'Non renseignée' },
    ...TMI_CHOICES.map(t => ({ value: t, label: `${t} %` })),
  ]
  const REGIME_OPTIONS = [
    { value: '', label: 'Selon le bail (micro)' },
    ...TAX_REGIMES.map(r => ({ value: r, label: TAX_REGIME_LABELS[r] })),
  ]
  const FURNISHED_OPTIONS = FURNISHED_KINDS.map(k => ({
    value: k,
    label: FURNISHED_RENTAL_KIND_LABELS[k],
  }))

  const tax = computed(() => values.value.taxParameters)
</script>

<template>
  <ul
    v-if="!expanded"
    class="flex flex-wrap gap-2 text-sm"
    aria-label="Résumé de la fiscalité et de la revente"
    data-testid="taxation-pills"
  >
    <li v-for="pill in pills" :key="pill">
      <UiBadge class="px-2.5 py-1 text-sm font-normal text-fg">{{
        pill
      }}</UiBadge>
    </li>
  </ul>
  <div
    v-else
    id="taxation-panel"
    class="grid gap-3.5"
    data-testid="study-assumptions"
  >
    <h3 class="text-sm font-semibold">Impôt</h3>
    <div
      class="grid gap-3.5 sm:grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))]"
    >
      <UiField
        id="h-tmi"
        v-model="form.marginalTaxPercent"
        as="select"
        label="Tranche marginale du foyer"
        :options="TMI_OPTIONS"
        hint="sans elle, l'impôt n'est pas estimé"
        term="marginal_tax_rate"
        :change="changeOf('marginalTaxPercent')"
      />
      <UiField
        id="h-regime"
        v-model="form.taxRegime"
        as="select"
        label="Régime fiscal visé"
        :options="REGIME_OPTIONS"
        hint="le réel s'impose si le plafond du micro est dépassé"
        term="tax_regimes"
        :change="changeOf('taxRegime')"
      />
      <UiField
        id="h-furnished-kind"
        v-model="form.furnishedRentalKind"
        as="select"
        label="Location meublée"
        :options="FURNISHED_OPTIONS"
        hint="pour l'abattement et le plafond du micro-BIC"
        :change="changeOf('furnishedRentalKind')"
      />
    </div>
    <h3 class="text-sm font-semibold">Revente et projection</h3>
    <div
      class="grid gap-3.5 sm:grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))]"
    >
      <UiField
        id="h-horizon"
        v-model="form.horizonYears"
        label="Revente dans"
        unit="ans"
        inputmode="numeric"
        hint="horizon de détention"
        :change="changeOf('horizonYears')"
        :error="errorOf('horizonYears')"
      />
      <UiField
        id="h-appreciation"
        v-model="form.appreciationPercent"
        label="Valeur du bien"
        unit="%/an"
        inputmode="decimal"
        hint="revalorisation ; 0 = valeur constante"
        :change="changeOf('appreciationPercent')"
        :error="errorOf('appreciationPercent')"
      />
      <UiField
        id="h-irl"
        v-model="form.rentIndexationPercent"
        label="Hausse des loyers et charges"
        unit="%/an"
        inputmode="decimal"
        hint="défaut : IRL du 3e trimestre 2026, +1,57 % (INSEE)"
        term="rent_indexation"
        :change="changeOf('rentIndexationPercent')"
        :error="errorOf('rentIndexationPercent')"
      />
      <UiField
        id="h-resale"
        v-model="form.resaleCostsPercent"
        label="Frais de revente"
        unit="% du prix"
        inputmode="decimal"
        hint="honoraires et diagnostics, estimation"
        :change="changeOf('resaleCostsPercent')"
        :error="errorOf('resaleCostsPercent')"
      />
      <UiField
        id="h-discount"
        v-model="form.discountPercent"
        label="Taux d'actualisation (VAN)"
        unit="%"
        inputmode="decimal"
        placeholder="= taux du crédit"
        hint="vide = taux du crédit"
        term="npv"
        :change="changeOf('discountPercent')"
        :error="errorOf('discountPercent')"
      />
    </div>
    <p class="text-xs text-muted" data-testid="tax-parameters">
      Paramètres fiscaux : {{ tax.label }} (prélèvements sociaux
      {{ formatRateCompact(tax.socialContributions.landIncomeRate) }} en
      location vide,
      {{ formatRateCompact(tax.socialContributions.furnishedIncomeRate) }} en
      meublé ; micro-foncier jusqu'à
      {{ formatEuros(tax.microFoncier.receiptsCeiling) }}, micro-BIC longue
      durée jusqu'à {{ formatEuros(tax.microBic.longTerm.receiptsCeiling) }}).
      Estimation, pas un conseil fiscal. Ces paramètres sont datés et sourcés ;
      Claude peut les mettre à jour à ta demande.
    </p>
  </div>
</template>
