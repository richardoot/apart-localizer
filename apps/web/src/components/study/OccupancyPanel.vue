<script setup lang="ts">
  import { computed } from 'vue'
  import type { Assumptions } from '@apart/contracts'
  import { occupancyReport } from '@apart/domain'
  import type { StudyInput } from '@apart/domain'
  import StatTile from '@/components/ui/StatTile.vue'
  import { formatDate, formatEuros, formatEurosPerMonth } from '@/lib/format'

  /**
   * Phase 1 (besoin E3) : ce que coûte le logement pendant que le foyer
   * l'habite, comparé au loyer actuel, la part de capital remboursé et la
   * date de bascule en phase 2. Calculé dans le navigateur par `domain`,
   * comme `GET /listings/:id/occupancy`.
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
</script>

<template>
  <div class="grid gap-3 text-sm" data-testid="occupancy">
    <div class="grid gap-px overflow-hidden rounded-lg bg-line sm:grid-cols-3">
      <StatTile
        label="Coût d'occupation"
        :value="formatEurosPerMonth(report.monthly.total)"
        :hint="gapText(report.gapToCurrentRent)"
      />
      <StatTile
        label="Dont capital remboursé"
        :value="formatEurosPerMonth(report.capitalMonthly)"
        :hint="
          report.phase1Months > 0
            ? `moyenne sur ${report.phase1Months} mois`
            : 'moyenne sur les 12 premiers mois'
        "
      />
      <StatTile
        label="Coût réel"
        :value="formatEurosPerMonth(report.realCostMonthly)"
        :hint="gapText(report.realGapToCurrentRent)"
      />
    </div>
    <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
      <dt class="text-muted">Crédit (hors assurance)</dt>
      <dd class="text-right tabular-nums">
        {{ formatEurosPerMonth(report.monthly.credit) }}
      </dd>
      <dt class="text-muted">Assurance emprunteur</dt>
      <dd class="text-right tabular-nums">
        {{ formatEurosPerMonth(report.monthly.insurance) }}
      </dd>
      <dt class="text-muted">Charges de copropriété (toutes)</dt>
      <dd class="text-right tabular-nums">
        {{ report.chargesKnown ? '' : '≈ '
        }}{{ formatEurosPerMonth(report.monthly.charges) }}
      </dd>
      <dt class="text-muted">Taxe foncière</dt>
      <dd class="text-right tabular-nums">
        {{ report.propertyTaxEstimated ? '≈ ' : ''
        }}{{ formatEurosPerMonth(report.monthly.propertyTax) }}
      </dd>
      <dt class="text-muted">Entretien</dt>
      <dd class="text-right tabular-nums">
        {{ report.maintenanceKnown ? '' : '≈ '
        }}{{ formatEurosPerMonth(report.monthly.maintenance) }}
      </dd>
    </dl>
    <p data-testid="switch">
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
