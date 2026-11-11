<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { TAX_REGIME_LABELS } from '@apart/contracts'
  import type { Assumptions, TaxRegime } from '@apart/contracts'
  import { projection, regimesFor, wealthSeries } from '@apart/domain'
  import type { StudyInput } from '@apart/domain'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import ScrollTable from '@/components/ui/ScrollTable.vue'
  import UiField from '@/components/ui/UiField.vue'
  import StatTile from '@/components/ui/StatTile.vue'
  import {
    formatDate,
    formatEuros,
    formatEurosPerMonth,
    formatPercent,
    numberInputError,
    parseNumberInput,
  } from '@/lib/format'
  import ProjectionChart from './ProjectionChart.vue'

  /**
   * Projection jusqu'à la revente (besoins E6, E7) : tableau annuel,
   * graphique, TRI, VAN, enrichissement net, comparaison des régimes. Les
   * réglages de cette vue (horizon, régime, TMI) ne changent que l'aperçu ;
   * les hypothèses de l'espace se modifient dans la page Hypothèses. Calcul
   * dans le navigateur par `domain`, comme `GET /listings/:id/projection`.
   * Lot 25 : « ? » sur TRI, VAN et cash-flow (glossaire de `contracts`) ; les
   * deux tableaux défilent dans leur cadre (`ScrollTable`), jamais la page.
   */
  const props = defineProps<{
    listingId: string
    title: string
    input: StudyInput
    assumptions: Assumptions
  }>()

  const horizon = ref<string>('')
  const regime = ref<TaxRegime | ''>('')
  /** TMI de l'aperçu, en pourcentage ; vide = celle des hypothèses. */
  const tmi = ref<string>('')

  /** Lot 22 : un horizon illisible est refusé au champ, pas compris de travers. */
  const horizonError = computed(() => numberInputError(horizon.value))
  const horizonYears = computed(() =>
    horizonError.value ? null : parseNumberInput(horizon.value)
  )
  const regimes = computed(() => regimesFor(props.input.leaseType))
  const REGIME_OPTIONS = computed(() => [
    { value: '', label: 'Selon les hypothèses' },
    ...regimes.value.map(r => ({ value: r, label: TAX_REGIME_LABELS[r] })),
  ])
  const TMI_OPTIONS = computed(() => [
    {
      value: '',
      label: `Hypothèses (${
        props.assumptions.marginalTaxRate === null
          ? 'non renseignée'
          : formatPercent(props.assumptions.marginalTaxRate)
      })`,
    },
    ...['0', '11', '30', '41', '45'].map(t => ({ value: t, label: `${t} %` })),
  ])

  const report = computed(() =>
    projection(
      props.input,
      tmi.value === ''
        ? props.assumptions
        : { ...props.assumptions, marginalTaxRate: Number(tmi.value) / 100 },
      {
        at: new Date(),
        horizonYears: horizonYears.value ?? undefined,
        regime: regime.value === '' ? undefined : regime.value,
        listingId: props.listingId,
        title: props.title,
      }
    )
  )
  const series = computed(() => wealthSeries(report.value))
  const pct = (v: number | null): string =>
    v === null ? '—' : formatPercent(v)
  const eur = (v: number | null): string => (v === null ? '—' : formatEuros(v))
</script>

<template>
  <div class="grid gap-3 text-sm" data-testid="projection">
    <div class="grid gap-2 sm:grid-cols-3">
      <UiField
        id="pj-horizon"
        v-model="horizon"
        label="Horizon"
        unit="ans"
        inputmode="numeric"
        :placeholder="String(assumptions.horizonYears)"
        :error="horizonError"
      />
      <UiField
        id="pj-regime"
        v-model="regime"
        as="select"
        label="Régime fiscal"
        :options="REGIME_OPTIONS"
      />
      <UiField
        id="pj-tmi"
        v-model="tmi"
        as="select"
        label="TMI de l’aperçu"
        hint="Ne modifie pas les hypothèses"
        :options="TMI_OPTIONS"
      />
    </div>

    <div class="grid gap-px overflow-hidden rounded-lg bg-line sm:grid-cols-4">
      <StatTile
        label="TRI avant impôt"
        term="irr"
        :value="pct(report.summary.irrBeforeTax)"
      />
      <StatTile
        label="TRI après impôt"
        term="irr"
        :value="pct(report.summary.irrAfterTax)"
        :hint="
          report.summary.irrAfterTax === null ? 'TMI à renseigner' : undefined
        "
      />
      <StatTile
        label="VAN après impôt"
        term="npv"
        :value="eur(report.summary.npvAfterTax)"
        :hint="`au taux de ${formatPercent(report.summary.discountRate)}`"
      />
      <StatTile
        label="Enrichissement net"
        :value="
          eur(
            report.summary.netWealthAfterTax ??
              report.summary.netWealthBeforeTax
          )
        "
        :hint="
          report.summary.netWealthAfterTax === null
            ? 'avant impôt'
            : 'après impôt'
        "
      />
    </div>
    <p v-if="report.summary.firstRentalYear !== null" data-testid="first-year">
      Première année entièrement louée (année
      {{ report.summary.firstRentalYear }}) : cash-flow net d’impôt
      <DefinitionButton term="cash_flow_after_tax" />
      <strong>{{
        report.summary.firstRentalYearMonthlyAfterTax === null
          ? '— (TMI à renseigner)'
          : formatEurosPerMonth(report.summary.firstRentalYearMonthlyAfterTax)
      }}</strong
      >.
    </p>

    <ProjectionChart :series="series" />

    <ScrollTable label="Comparaison des régimes fiscaux">
      <table
        class="w-full min-w-[34rem] text-sm tabular-nums"
        data-testid="regimes"
      >
        <caption class="pb-1 text-left text-muted">
          Comparaison des régimes
        </caption>
        <thead class="text-left text-muted">
          <tr>
            <th class="sticky left-0 bg-surface py-1 pr-2">Régime</th>
            <th class="text-right">Impôt sur les loyers</th>
            <th class="text-right">Plus-value</th>
            <th class="text-right">
              <span class="inline-flex items-center gap-1"
                >TRI après impôt <DefinitionButton term="irr"
              /></span>
            </th>
            <th class="text-right">Enrichissement</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in report.regimes"
            :key="r.regime"
            class="border-t border-line"
            :class="r.regime === report.summary.regime ? 'font-semibold' : ''"
          >
            <td class="sticky left-0 bg-surface py-1 pr-2">
              {{ TAX_REGIME_LABELS[r.regime] }}
              <span v-if="r.regime === report.bestRegime" class="text-good"
                >★</span
              >
              <span v-if="!r.eligible" class="text-warn"
                >(plafond dépassé)</span
              >
            </td>
            <td class="text-right">{{ eur(r.totalRentalTax) }}</td>
            <td class="text-right">{{ formatEuros(r.capitalGainsTax) }}</td>
            <td class="text-right">{{ pct(r.irrAfterTax) }}</td>
            <td class="text-right">{{ eur(r.netWealthAfterTax) }}</td>
          </tr>
        </tbody>
      </table>
    </ScrollTable>

    <p data-testid="sale">
      Revente le {{ formatDate(report.sale.date) }} à
      {{ formatEuros(report.sale.salePrice) }} (frais
      {{ formatEuros(report.sale.saleCosts) }}, capital restant dû
      {{ formatEuros(report.sale.remainingPrincipal) }}) :
      <template v-if="report.sale.capitalGains.exempt">
        plus-value exonérée (résidence principale au jour de la vente)
      </template>
      <template v-else>
        plus-value brute {{ formatEuros(report.sale.capitalGains.grossGain) }},
        impôt {{ formatEuros(report.sale.capitalGains.total) }}
      </template>
      ; produit net {{ formatEuros(report.sale.netProceeds) }}.
    </p>

    <details class="rounded-lg border border-line">
      <summary class="cursor-pointer px-3 py-2 text-xs font-medium">
        Tableau annuel ({{ report.rows.length }} ans)
      </summary>
      <div class="px-3 pb-3">
        <ScrollTable label="Tableau annuel de la projection">
          <table
            class="w-full min-w-[960px] text-sm whitespace-nowrap tabular-nums"
            data-testid="rows"
          >
            <thead class="text-left text-muted">
              <tr>
                <th class="sticky left-0 bg-surface py-1 pr-2">Année</th>
                <th class="text-right">Loyer évité</th>
                <th class="text-right">Loyers</th>
                <th class="text-right">Mensualités</th>
                <th class="text-right">Charges</th>
                <th class="text-right">Taxe foncière</th>
                <th class="text-right">Entretien</th>
                <th class="text-right">Frais fixes</th>
                <th class="text-right">Impôt</th>
                <th class="text-right">
                  <span class="inline-flex items-center gap-1"
                    >Cash-flow net <DefinitionButton term="cash_flow_after_tax"
                  /></span>
                </th>
                <th class="text-right">Capital dû</th>
                <th class="text-right">Valeur</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in report.rows"
                :key="row.year"
                class="border-t border-line"
              >
                <td class="sticky left-0 bg-surface py-1 pr-2">
                  {{ row.year }}
                  <span class="text-muted">{{
                    row.phase2Months === 12
                      ? 'loué'
                      : row.phase2Months > 0
                        ? 'bascule'
                        : 'habité'
                  }}</span>
                </td>
                <td class="text-right">{{ formatEuros(row.rentAvoided) }}</td>
                <td class="text-right">{{ formatEuros(row.rentCollected) }}</td>
                <td class="text-right">{{ formatEuros(row.loanPayment) }}</td>
                <td class="text-right">{{ formatEuros(row.charges) }}</td>
                <td class="text-right">{{ formatEuros(row.propertyTax) }}</td>
                <td class="text-right">{{ formatEuros(row.maintenance) }}</td>
                <td class="text-right">{{ formatEuros(row.fixedCosts) }}</td>
                <td class="text-right">
                  {{ row.tax ? eur(row.tax.total) : '—' }}
                </td>
                <td class="text-right">{{ eur(row.cashFlowAfterTax) }}</td>
                <td class="text-right">
                  {{ formatEuros(row.remainingPrincipal) }}
                </td>
                <td class="text-right">{{ formatEuros(row.propertyValue) }}</td>
              </tr>
            </tbody>
          </table>
        </ScrollTable>
      </div>
    </details>

    <ul v-if="report.warnings.length" class="grid gap-0.5 text-xs text-warn">
      <li v-for="warning in report.warnings" :key="warning">{{ warning }}</li>
    </ul>
    <p class="text-xs text-muted" data-testid="disclaimer">
      {{ report.disclaimer }} Paramètres fiscaux :
      {{ report.parameters.taxParametersLabel }}.
    </p>
  </div>
</template>
