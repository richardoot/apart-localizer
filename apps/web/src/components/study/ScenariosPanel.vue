<script setup lang="ts">
  import { computed, ref } from 'vue'
  import {
    LEASE_TYPE_LABELS,
    RENTAL_VERDICT_LABELS,
    TAX_REGIME_LABELS,
    VERDICT_LABELS,
  } from '@apart/contracts'
  import type {
    Assumptions,
    LeaseType,
    Scenario,
    ScenarioDelta,
    TaxRegime,
  } from '@apart/contracts'
  import { compareScenario } from '@apart/domain'
  import type { StudyInput } from '@apart/domain'
  import FormField from '@/components/ui/FormField.vue'
  import { useScenarioMutations, useScenarios } from '@/composables/useStudy'
  import { ApiError } from '@/lib/api'
  import { formatEuros, formatPercent } from '@/lib/format'
  import {
    emptyScenarioForm,
    scenarioFormFromOverrides,
    scenarioOverridesFromForm,
  } from '@/lib/scenario-form'

  /**
   * Scénarios « et si » (besoin E4) : l'éditeur recalcule la comparaison à
   * chaque frappe dans le navigateur (`compareScenario`, domain), sans appel
   * réseau ; un scénario s'enregistre pour l'annonce ou pour l'espace, et se
   * réapplique ensuite (aussi par le MCP, `evaluate_scenario`).
   */
  const props = defineProps<{
    listingId: string
    title: string
    input: StudyInput
    assumptions: Assumptions
  }>()

  const form = ref(emptyScenarioForm())
  const name = ref('')
  const forWorkspace = ref(false)
  const failure = ref<string | null>(null)
  const message = ref<string | null>(null)
  const { data: saved } = useScenarios(computed(() => props.listingId))
  const mutations = useScenarioMutations()

  const parsed = computed(() => scenarioOverridesFromForm(form.value))
  const comparison = computed(() =>
    parsed.value.overrides
      ? compareScenario(
          props.input,
          props.assumptions,
          parsed.value.overrides,
          {
            at: new Date(),
            listingId: props.listingId,
            title: props.title,
          }
        )
      : null
  )
  const empty = computed(
    () => Object.keys(parsed.value.overrides ?? {}).length === 0
  )

  const LEASE_TYPES = Object.keys(LEASE_TYPE_LABELS) as LeaseType[]
  const REGIMES = Object.keys(TAX_REGIME_LABELS) as TaxRegime[]

  function show(delta: ScenarioDelta, value: number | null): string {
    if (value === null) return '—'
    if (delta.unit === 'fraction') return formatPercent(value)
    return delta.unit === 'eur_month'
      ? `${formatEuros(value)}/mois`
      : formatEuros(value)
  }
  function deltaClass(delta: ScenarioDelta): string {
    if (delta.better === null) return 'text-muted'
    return delta.better ? 'text-good' : 'text-bad'
  }

  function apply(scenario: Scenario): void {
    form.value = scenarioFormFromOverrides(scenario.overrides)
    name.value = scenario.name
    message.value = `Scénario « ${scenario.name} » appliqué : modifiable avant d’être enregistré à nouveau.`
  }

  async function save(): Promise<void> {
    failure.value = null
    if (!parsed.value.overrides || empty.value || !name.value.trim()) {
      failure.value = 'Donnez un nom et au moins une valeur à changer.'
      return
    }
    try {
      await mutations.create.mutateAsync({
        name: name.value.trim(),
        listingId: forWorkspace.value ? null : props.listingId,
        overrides: parsed.value.overrides,
      })
      message.value = `Scénario « ${name.value.trim()} » enregistré.`
    } catch (err) {
      failure.value =
        err instanceof ApiError ? err.message : "L'enregistrement a échoué."
    }
  }

  async function remove(scenario: Scenario): Promise<void> {
    failure.value = null
    try {
      await mutations.remove.mutateAsync(scenario.id)
    } catch (err) {
      failure.value =
        err instanceof ApiError ? err.message : 'La suppression a échoué.'
    }
  }

  const inputClass =
    'rounded-lg border border-line bg-bg px-2 py-1 text-sm w-full'
</script>

<template>
  <div class="grid gap-3 text-sm" data-testid="scenarios">
    <div class="grid gap-2 sm:grid-cols-3">
      <FormField label="Prix (€)" for-id="sc-price">
        <input
          id="sc-price"
          v-model="form.price"
          :class="inputClass"
          inputmode="numeric"
          :placeholder="formatEuros(input.financials.price)"
        />
      </FormField>
      <FormField label="Loyer visé (€/mois)" for-id="sc-rent">
        <input
          id="sc-rent"
          v-model="form.targetRent"
          :class="inputClass"
          inputmode="numeric"
          :placeholder="String(input.financials.targetRent)"
        />
      </FormField>
      <FormField label="Travaux (€)" for-id="sc-works">
        <input
          id="sc-works"
          v-model="form.renovationTotal"
          :class="inputClass"
          inputmode="numeric"
          :placeholder="String(input.financials.renovationTotal)"
        />
      </FormField>
      <FormField label="Bail" for-id="sc-lease">
        <select id="sc-lease" v-model="form.leaseType" :class="inputClass">
          <option value="">Inchangé</option>
          <option v-for="lease in LEASE_TYPES" :key="lease" :value="lease">
            {{ LEASE_TYPE_LABELS[lease] }}
          </option>
        </select>
      </FormField>
      <FormField label="Taux (%)" for-id="sc-rate">
        <input
          id="sc-rate"
          v-model="form.interestRatePercent"
          :class="inputClass"
          inputmode="decimal"
          :placeholder="formatPercent(assumptions.interestRate)"
        />
      </FormField>
      <FormField label="Apport (€)" for-id="sc-down">
        <input
          id="sc-down"
          v-model="form.downPayment"
          :class="inputClass"
          inputmode="numeric"
          :placeholder="String(assumptions.downPayment)"
        />
      </FormField>
      <FormField label="Durée (ans)" for-id="sc-years">
        <input
          id="sc-years"
          v-model="form.durationYears"
          :class="inputClass"
          inputmode="numeric"
          :placeholder="String(assumptions.durationYears)"
        />
      </FormField>
      <FormField label="Vacance (mois/an)" for-id="sc-vacancy">
        <input
          id="sc-vacancy"
          v-model="form.vacancyMonths"
          :class="inputClass"
          inputmode="decimal"
          :placeholder="String(assumptions.vacancyMonths)"
        />
      </FormField>
      <FormField label="Mise en location" for-id="sc-start">
        <input
          id="sc-start"
          v-model="form.rentalStartDate"
          type="date"
          :class="inputClass"
        />
      </FormField>
      <FormField label="TMI (%)" for-id="sc-tmi">
        <input
          id="sc-tmi"
          v-model="form.marginalTaxPercent"
          :class="inputClass"
          inputmode="decimal"
          :placeholder="
            assumptions.marginalTaxRate === null
              ? 'non renseignée'
              : formatPercent(assumptions.marginalTaxRate)
          "
        />
      </FormField>
      <FormField label="Régime fiscal" for-id="sc-regime">
        <select id="sc-regime" v-model="form.taxRegime" :class="inputClass">
          <option value="">Inchangé</option>
          <option v-for="regime in REGIMES" :key="regime" :value="regime">
            {{ TAX_REGIME_LABELS[regime] }}
          </option>
        </select>
      </FormField>
      <FormField label="Horizon (ans)" for-id="sc-horizon">
        <input
          id="sc-horizon"
          v-model="form.horizonYears"
          :class="inputClass"
          inputmode="numeric"
          :placeholder="String(assumptions.horizonYears)"
        />
      </FormField>
      <FormField label="Revalorisation (%/an)" for-id="sc-appreciation">
        <input
          id="sc-appreciation"
          v-model="form.appreciationPercent"
          :class="inputClass"
          inputmode="decimal"
          :placeholder="formatPercent(assumptions.appreciationRate)"
        />
      </FormField>
    </div>
    <p v-if="parsed.error" role="alert" class="text-xs text-bad">
      {{ parsed.error }}
    </p>

    <table
      v-if="comparison"
      class="w-full text-xs tabular-nums"
      data-testid="scenario-compare"
    >
      <caption class="pb-1 text-left text-muted">
        Base et scénario côte à côte (aperçu en direct, rien n’est enregistré)
      </caption>
      <thead class="text-left text-muted">
        <tr>
          <th class="py-1">Indicateur</th>
          <th class="text-right">Base</th>
          <th class="text-right">Scénario</th>
          <th class="text-right">Écart</th>
        </tr>
      </thead>
      <tbody>
        <tr class="border-t border-line">
          <td class="py-0.5">Verdict</td>
          <td class="text-right">
            {{ VERDICT_LABELS[comparison.base.verdict] }}
          </td>
          <td
            class="text-right"
            :class="comparison.verdictChanged ? 'font-semibold' : ''"
          >
            {{ VERDICT_LABELS[comparison.result.verdict] }}
          </td>
          <td />
        </tr>
        <tr class="border-t border-line">
          <td class="py-0.5">Location (phase 2)</td>
          <td class="text-right">
            {{ RENTAL_VERDICT_LABELS[comparison.base.rentalVerdict] }}
          </td>
          <td class="text-right">
            {{ RENTAL_VERDICT_LABELS[comparison.result.rentalVerdict] }}
          </td>
          <td />
        </tr>
        <tr
          v-for="delta in comparison.deltas"
          :key="delta.key"
          class="border-t border-line"
          :data-key="delta.key"
        >
          <td class="py-0.5">{{ delta.label }}</td>
          <td class="text-right">{{ show(delta, delta.base) }}</td>
          <td class="text-right">{{ show(delta, delta.scenario) }}</td>
          <td class="text-right" :class="deltaClass(delta)">
            {{
              delta.delta === null || delta.better === null
                ? ''
                : (delta.delta > 0 ? '+' : '−') +
                  show(delta, Math.abs(delta.delta))
            }}
          </td>
        </tr>
      </tbody>
    </table>
    <p class="text-xs text-muted">{{ comparison?.disclaimer }}</p>

    <div class="flex flex-wrap items-end gap-2">
      <FormField label="Nom du scénario" for-id="sc-name">
        <input
          id="sc-name"
          v-model="name"
          :class="inputClass"
          placeholder="Taux négocié 3,2 %"
        />
      </FormField>
      <label class="flex items-center gap-1.5 text-xs">
        <input
          v-model="forWorkspace"
          type="checkbox"
          class="size-4 accent-[var(--accent)]"
        />
        pour toutes les annonces
      </label>
      <button
        type="button"
        class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
        :disabled="mutations.create.isPending.value || empty"
        data-action="save-scenario"
        @click="save"
      >
        Enregistrer le scénario
      </button>
      <button
        type="button"
        class="rounded-lg border border-line px-3 py-1.5 text-sm"
        @click="form = emptyScenarioForm()"
      >
        Revenir à la base
      </button>
    </div>
    <p v-if="failure" role="alert" class="text-xs text-bad">{{ failure }}</p>
    <p v-else-if="message" class="text-xs text-good" aria-live="polite">
      {{ message }}
    </p>

    <ul
      v-if="saved?.length"
      class="grid gap-1"
      aria-label="Scénarios enregistrés"
    >
      <li
        v-for="scenario in saved"
        :key="scenario.id"
        class="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-1 text-xs"
      >
        <strong>{{ scenario.name }}</strong>
        <span class="text-muted">{{
          scenario.listingId ? 'cette annonce' : 'tout l’espace'
        }}</span>
        <button
          type="button"
          class="ml-auto rounded border border-accent px-2"
          @click="apply(scenario)"
        >
          Appliquer
        </button>
        <button
          type="button"
          class="rounded border border-line px-2 text-muted"
          @click="remove(scenario)"
        >
          Supprimer
        </button>
      </li>
    </ul>
  </div>
</template>
