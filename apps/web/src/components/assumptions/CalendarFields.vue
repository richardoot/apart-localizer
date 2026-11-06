<script setup lang="ts">
  import { computed } from 'vue'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import { useAssumptionsDraftContext } from '@/composables/useAssumptionsDraft'
  import { LEASE_TYPE_LABELS } from '@/lib/labels'
  import { LEASE_TYPES } from '@/lib/assumptions-form'
  import SelectField from './SelectField.vue'
  import UnitField from './UnitField.vue'

  /**
   * « Quel est votre calendrier ? » (lot 13) : phase 1 « Vous y habitez »
   * (date d'achat, loyer actuel, entretien) puis phase 2 « Vous le louez »
   * (date de mise en location, vacance, frais fixes). L'année de mise en
   * location par défaut est rappelée sous la date et se change à la demande.
   * Lot 19 : l'année et le type de location valent pour toutes les annonces
   * de l'espace (la fiche ne les règle plus).
   */
  const { form, draft, changeOf, errorOf, openPanels } =
    useAssumptionsDraftContext()

  const defaultYear = computed(() => draft.value.rentalYear ?? '—')
  const LEASE_OPTIONS = LEASE_TYPES.map(value => ({
    value,
    label: LEASE_TYPE_LABELS[value],
  }))
</script>

<template>
  <div class="grid gap-3.5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-stretch">
      <div
        role="group"
        aria-labelledby="phase-1-title"
        class="grid flex-1 content-start gap-3 rounded-xl border border-line p-3.5"
        data-testid="phase-1"
      >
        <p class="flex flex-wrap items-center gap-2">
          <span
            class="rounded-full bg-fg px-2.5 py-0.5 text-xs font-semibold text-bg"
            >Phase 1</span
          >
          <strong id="phase-1-title">Vous y habitez</strong>
          <DefinitionButton term="occupancy_cost" />
        </p>
        <UnitField
          id="h-purchase"
          v-model="form.purchaseDate"
          type="date"
          label="Date d'achat prévue"
          hint="vide = date du calcul"
          :change="changeOf('purchaseDate')"
          :error="errorOf('purchaseDate')"
        />
        <UnitField
          id="h-current-rent"
          v-model="form.currentRent"
          label="Votre loyer actuel"
          unit="€/mois"
          inputmode="numeric"
          placeholder="non renseigné"
          hint="celui du foyer, pour comparer avec ce que l'achat vous coûtera"
          :change="changeOf('currentRent')"
          :error="errorOf('currentRent')"
        />
        <UnitField
          id="h-maintenance"
          v-model="form.maintenanceAnnual"
          label="Entretien"
          unit="€/an"
          inputmode="numeric"
          placeholder="0"
          hint="pendant que vous y habitez ; vide = compté 0"
          :change="changeOf('maintenanceAnnual')"
          :error="errorOf('maintenanceAnnual')"
        />
      </div>
      <div
        aria-hidden="true"
        class="hidden self-center text-xl text-muted sm:block"
      >
        →
      </div>
      <div
        role="group"
        aria-labelledby="phase-2-title"
        class="grid flex-1 content-start gap-3 rounded-xl border border-line p-3.5"
        data-testid="phase-2"
      >
        <p class="flex flex-wrap items-center gap-2">
          <span
            class="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-fg"
            >Phase 2</span
          >
          <strong id="phase-2-title">Vous le louez</strong>
          <DefinitionButton term="rental_phases" />
        </p>
        <div class="grid gap-1.5">
          <UnitField
            id="h-rental-start"
            v-model="form.rentalStartDate"
            type="date"
            label="Mise en location"
            :hint="`vide = 1er janvier ${defaultYear} (année par défaut)`"
            :change="changeOf('rentalStartDate')"
            :error="errorOf('rentalStartDate')"
          />
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-lg px-1 text-sm font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            :aria-expanded="openPanels.rentalYear"
            aria-controls="rental-year-panel"
            data-testid="toggle-rental-year"
            @click="openPanels.rentalYear = !openPanels.rentalYear"
          >
            <span aria-hidden="true">{{
              openPanels.rentalYear ? '▾' : '▸'
            }}</span>
            Changer l'année par défaut
          </button>
          <div
            v-if="openPanels.rentalYear"
            id="rental-year-panel"
            class="grid gap-1.5 rounded-xl bg-surface-2/60 p-3"
          >
            <UnitField
              id="h-year"
              v-model="form.rentalYear"
              label="Année de mise en location par défaut"
              inputmode="numeric"
              hint="pour toutes les annonces, quand la date ci-dessus n'est pas renseignée"
              :change="changeOf('rentalYear')"
              :error="errorOf('rentalYear')"
            />
          </div>
        </div>
        <SelectField
          id="h-lease-type"
          v-model="form.leaseType"
          label="Type de location"
          :options="LEASE_OPTIONS"
          hint="pour toutes les annonces : plafond d’encadrement, loyers comparables, régime fiscal"
          :change="changeOf('leaseType')"
        />
        <UnitField
          id="h-vacancy"
          v-model="form.vacancyMonths"
          label="Vacance locative"
          unit="mois/an sans locataire"
          inputmode="decimal"
          term="vacancy"
          :change="changeOf('vacancyMonths')"
          :error="errorOf('vacancyMonths')"
        />
        <UnitField
          id="h-fixed"
          v-model="form.fixedCostsAnnual"
          label="Frais fixes du bailleur"
          unit="€/an"
          inputmode="numeric"
          hint="assurance PNO, CFE, comptable LMNP, entretien"
          term="fixed_costs"
          :change="changeOf('fixedCostsAnnual')"
          :error="errorOf('fixedCostsAnnual')"
        />
      </div>
    </div>
    <p class="text-xs text-muted">
      La taxe foncière et les charges de copropriété se saisissent dans chaque
      annonce.
    </p>
  </div>
</template>
