<script setup lang="ts">
  import { computed } from 'vue'
  import type { Assumptions } from '@apart/contracts'
  import { occupancyReport } from '@apart/domain'
  import type { StudyInput } from '@apart/domain'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import { formatDate, formatEuros, formatEurosPerMonth } from '@/lib/format'

  /**
   * Phase 1 (besoin E3) : ce que coûte le logement pendant que le foyer
   * l'habite, comparé au loyer actuel, la part de capital remboursé et la
   * date de bascule en phase 2. Calculé dans le navigateur par `domain`,
   * comme `GET /listings/:id/occupancy`. Lot 19 : compacté pour l'onglet
   * Budget (le coût en grand, son détail, la bascule), sans rien perdre.
   */
  const props = defineProps<{
    input: StudyInput
    assumptions: Assumptions
    listingId: string
  }>()

  const report = computed(() =>
    occupancyReport(props.input, props.assumptions, {
      at: new Date(),
      listingId: props.listingId,
    })
  )
  const gapText = (gap: number | null): string =>
    gap === null
      ? 'loyer actuel à renseigner'
      : gap > 0
        ? `${formatEurosPerMonth(gap)} de plus que le loyer actuel`
        : `${formatEurosPerMonth(-gap)} de moins que le loyer actuel`

  const row = 'border-t border-line'
</script>

<template>
  <div class="grid gap-3 text-sm" data-testid="occupancy">
    <div class="grid gap-0.5">
      <p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <strong
          class="font-display text-2xl leading-tight font-bold tabular-nums"
          data-testid="occupancy-total"
          >{{ formatEurosPerMonth(report.monthly.total) }}</strong
        >
        <span class="inline-flex items-center gap-1.5 text-muted"
          >Coût d'occupation <DefinitionButton term="occupancy_cost"
        /></span>
      </p>
      <p class="text-xs text-muted" data-testid="occupancy-gap">
        {{ gapText(report.gapToCurrentRent) }}
      </p>
    </div>
    <table class="w-full tabular-nums">
      <caption class="sr-only">
        Le coût d’occupation par mois
      </caption>
      <tbody>
        <tr :class="row">
          <th scope="row" class="py-1.5 text-left font-normal">
            Crédit (hors assurance)
          </th>
          <td class="py-1.5 text-right">
            {{ formatEurosPerMonth(report.monthly.credit) }}
          </td>
        </tr>
        <tr :class="row">
          <th scope="row" class="py-1.5 text-left font-normal">
            Assurance emprunteur
          </th>
          <td class="py-1.5 text-right">
            {{ formatEurosPerMonth(report.monthly.insurance) }}
          </td>
        </tr>
        <tr :class="row">
          <th scope="row" class="py-1.5 text-left font-normal">
            Charges de copropriété (toutes)
          </th>
          <td class="py-1.5 text-right">
            {{ report.chargesKnown ? '' : '≈ '
            }}{{ formatEurosPerMonth(report.monthly.charges) }}
          </td>
        </tr>
        <tr :class="row">
          <th scope="row" class="py-1.5 text-left font-normal">
            Taxe foncière
            <span v-if="report.propertyTaxEstimated" class="text-xs text-warn"
              >estimée, à confirmer</span
            >
          </th>
          <td class="py-1.5 text-right">
            {{ report.propertyTaxEstimated ? '≈ ' : ''
            }}{{ formatEurosPerMonth(report.monthly.propertyTax) }}
          </td>
        </tr>
        <tr :class="row">
          <th scope="row" class="py-1.5 text-left font-normal">Entretien</th>
          <td class="py-1.5 text-right">
            {{ report.maintenanceKnown ? '' : '≈ '
            }}{{ formatEurosPerMonth(report.monthly.maintenance) }}
          </td>
        </tr>
      </tbody>
    </table>
    <p class="text-xs text-muted" data-testid="occupancy-capital">
      Dont
      <strong class="text-fg">{{
        formatEurosPerMonth(report.capitalMonthly)
      }}</strong>
      de capital remboursé ({{
        report.phase1Months > 0
          ? `moyenne sur ${report.phase1Months} mois`
          : 'moyenne sur les 12 premiers mois'
      }}) : coût réel
      <strong class="text-fg">{{
        formatEurosPerMonth(report.realCostMonthly)
      }}</strong
      >, {{ gapText(report.realGapToCurrentRent) }}.
    </p>
    <p class="text-xs" data-testid="switch">
      Achat le {{ formatDate(report.purchaseDate) }}, mise en location le
      <strong>{{ formatDate(report.rentalStartDate) }}</strong> :
      {{ report.phase1Months }} mois d'occupation. Sur cette période :
      {{ formatEuros(report.phase1.paid) }} payés, dont
      {{ formatEuros(report.phase1.principalRepaid) }} de capital
      <template v-if="report.phase1.rentAvoided !== null">
        et {{ formatEuros(report.phase1.rentAvoided) }} de loyers évités, soit
        un coût net de {{ formatEuros(report.phase1.netCost ?? 0) }} par rapport
        à rester locataire</template
      >. Capital restant dû à la bascule :
      {{ formatEuros(report.remainingPrincipalAtSwitch) }}.
    </p>
    <ul
      v-if="report.warnings.length"
      class="grid gap-0.5 text-xs text-warn"
      aria-label="Points à compléter"
    >
      <li v-for="warning in report.warnings" :key="warning">{{ warning }}</li>
    </ul>
  </div>
</template>
