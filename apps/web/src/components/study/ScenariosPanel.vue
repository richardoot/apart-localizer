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
  import UiAlert from '@/components/ui/UiAlert.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiConfirm from '@/components/ui/UiConfirm.vue'
  import UiField from '@/components/ui/UiField.vue'
  import { useAction } from '@/composables/useAction'
  import { useFeedbackStore } from '@/stores/feedback'
  import { useScenarioMutations, useScenarios } from '@/composables/useStudy'
  import { formatEuros, formatPercent } from '@/lib/format'
  import {
    emptyScenarioForm,
    scenarioFormFromOverrides,
    scenarioOverridesFromForm,
  } from '@/lib/scenario-form'
  import type { ScenarioNumberField } from '@/lib/scenario-form'

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
  // Lot 22 : l'échec se dit sous les boutons, la réussite dans la zone.
  const action = useAction('L’enregistrement a échoué.')
  const feedback = useFeedbackStore()
  const fieldError = (field: ScenarioNumberField): string | null =>
    parsed.value.fieldErrors?.[field] ?? null
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

  const LEASE_OPTIONS = [
    { value: '', label: 'Inchangé' },
    ...(Object.keys(LEASE_TYPE_LABELS) as LeaseType[]).map(lease => ({
      value: lease,
      label: LEASE_TYPE_LABELS[lease],
    })),
  ]
  const REGIME_OPTIONS = [
    { value: '', label: 'Inchangé' },
    ...(Object.keys(TAX_REGIME_LABELS) as TaxRegime[]).map(regime => ({
      value: regime,
      label: TAX_REGIME_LABELS[regime],
    })),
  ]

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
    feedback.success(
      `Scénario « ${scenario.name} » appliqué : modifiable avant d’être enregistré à nouveau.`
    )
  }

  async function save(): Promise<void> {
    action.clear()
    const overrides = parsed.value.overrides
    if (parsed.value.fieldErrors) {
      document
        .querySelector<HTMLElement>(
          '[data-testid="scenarios"] [aria-invalid="true"]'
        )
        ?.focus()
      return
    }
    if (!overrides || empty.value || !name.value.trim()) {
      action.fail('Donne un nom et au moins une valeur à changer.')
      return
    }
    const scenarioName = name.value.trim()
    await action.run(
      () =>
        mutations.create.mutateAsync({
          name: scenarioName,
          listingId: forWorkspace.value ? null : props.listingId,
          overrides,
        }),
      { success: `Scénario « ${scenarioName} » enregistré.` }
    )
  }

  async function remove(scenario: Scenario): Promise<void> {
    await action.run(() => mutations.remove.mutateAsync(scenario.id), {
      success: `Scénario « ${scenario.name} » supprimé.`,
      fallback: 'La suppression a échoué.',
    })
  }
</script>

<template>
  <div class="grid gap-3 text-sm" data-testid="scenarios">
    <div class="grid gap-2 sm:grid-cols-3">
      <UiField
        id="sc-price"
        v-model="form.price"
        :error="fieldError('price')"
        label="Prix"
        unit="€"
        inputmode="numeric"
        :placeholder="formatEuros(input.financials.price)"
      />
      <UiField
        id="sc-rent"
        v-model="form.targetRent"
        :error="fieldError('targetRent')"
        label="Loyer visé"
        unit="€/mois"
        inputmode="numeric"
        :placeholder="String(input.financials.targetRent)"
      />
      <UiField
        id="sc-works"
        v-model="form.renovationTotal"
        :error="fieldError('renovationTotal')"
        label="Travaux"
        unit="€"
        inputmode="numeric"
        :placeholder="String(input.financials.renovationTotal)"
      />
      <UiField
        id="sc-lease"
        v-model="form.leaseType"
        as="select"
        label="Bail"
        :options="LEASE_OPTIONS"
      />
      <UiField
        id="sc-rate"
        v-model="form.interestRatePercent"
        :error="fieldError('interestRatePercent')"
        label="Taux"
        unit="%"
        inputmode="decimal"
        :placeholder="formatPercent(assumptions.interestRate)"
      />
      <UiField
        id="sc-down"
        v-model="form.downPayment"
        :error="fieldError('downPayment')"
        label="Apport"
        unit="€"
        inputmode="numeric"
        :placeholder="String(assumptions.downPayment)"
      />
      <UiField
        id="sc-years"
        v-model="form.durationYears"
        :error="fieldError('durationYears')"
        label="Durée"
        unit="ans"
        inputmode="numeric"
        :placeholder="String(assumptions.durationYears)"
      />
      <UiField
        id="sc-vacancy"
        v-model="form.vacancyMonths"
        :error="fieldError('vacancyMonths')"
        label="Vacance"
        unit="mois/an"
        inputmode="decimal"
        :placeholder="String(assumptions.vacancyMonths)"
      />
      <UiField
        id="sc-start"
        v-model="form.rentalStartDate"
        label="Mise en location"
        type="date"
        align="left"
      />
      <UiField
        id="sc-tmi"
        v-model="form.marginalTaxPercent"
        :error="fieldError('marginalTaxPercent')"
        label="TMI"
        unit="%"
        inputmode="decimal"
        :placeholder="
          assumptions.marginalTaxRate === null
            ? 'non renseignée'
            : formatPercent(assumptions.marginalTaxRate)
        "
      />
      <UiField
        id="sc-regime"
        v-model="form.taxRegime"
        as="select"
        label="Régime fiscal"
        :options="REGIME_OPTIONS"
      />
      <UiField
        id="sc-horizon"
        v-model="form.horizonYears"
        :error="fieldError('horizonYears')"
        label="Horizon"
        unit="ans"
        inputmode="numeric"
        :placeholder="String(assumptions.horizonYears)"
      />
      <UiField
        id="sc-appreciation"
        v-model="form.appreciationPercent"
        :error="fieldError('appreciationPercent')"
        label="Revalorisation"
        unit="%/an"
        inputmode="decimal"
        :placeholder="formatPercent(assumptions.appreciationRate)"
      />
    </div>
    <UiAlert v-if="parsed.error && !parsed.fieldErrors">
      {{ parsed.error }}
    </UiAlert>

    <table
      v-if="comparison"
      class="w-full text-sm tabular-nums"
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
          <td class="py-0.5">Rentabilité</td>
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
    <p class="text-sm text-muted">{{ comparison?.disclaimer }}</p>

    <div class="flex flex-wrap items-end gap-2">
      <UiField
        id="sc-name"
        v-model="name"
        label="Nom du scénario"
        placeholder="Taux négocié 3,2 %"
      />
      <UiCheckbox v-model="forWorkspace" label="pour toutes les annonces" />
      <UiButton
        variant="primary"
        :disabled="empty && !parsed.fieldErrors"
        :loading="mutations.create.isPending.value"
        data-action="save-scenario"
        @click="save"
      >
        Enregistrer le scénario
      </UiButton>
      <UiButton @click="form = emptyScenarioForm()">Revenir à la base</UiButton>
    </div>
    <UiAlert v-if="action.error.value">{{ action.error.value }}</UiAlert>

    <ul
      v-if="saved?.length"
      class="grid gap-1"
      aria-label="Scénarios enregistrés"
    >
      <li
        v-for="scenario in saved"
        :key="scenario.id"
        class="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm"
      >
        <strong>{{ scenario.name }}</strong>
        <span class="text-muted">{{
          scenario.listingId ? 'cette annonce' : 'tout l’espace'
        }}</span>
        <UiButton
          variant="outline"
          size="sm"
          class="ml-auto"
          @click="apply(scenario)"
        >
          Appliquer
        </UiButton>
        <UiConfirm
          label="Supprimer"
          :question="`Supprimer « ${scenario.name} » ?`"
          :busy="mutations.remove.isPending.value"
          @confirm="remove(scenario)"
        />
      </li>
    </ul>
  </div>
</template>
