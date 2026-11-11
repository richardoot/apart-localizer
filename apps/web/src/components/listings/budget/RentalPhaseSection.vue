<script setup lang="ts">
  import { computed } from 'vue'
  import { OPEN_DATA_STATUS_LABELS, RENT_EPOCH_LABELS } from '@apart/contracts'
  import type {
    Assumptions,
    EvaluatedListing,
    ListingEvaluation,
    OpenDataStatus,
  } from '@apart/contracts'
  import { rentGauge } from '@apart/domain'
  import CompliancePanel from '@/components/study/CompliancePanel.vue'
  import RentMarketPanel from '@/components/study/RentMarketPanel.vue'
  import UiBadge from '@/components/ui/UiBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
  import type { Tone } from '@/lib/ui'
  import { useListingContext } from '@/composables/useListingContext'
  import { useListingEditor } from '@/composables/useListingEditor'
  import { useRentComparables } from '@/composables/useStudy'
  import { budgetRentalYear, marketRange } from '@/lib/budget'
  import {
    formatCssPercent,
    formatEuros,
    formatEurosPerMonth,
    plural,
  } from '@/lib/format'
  import {
    CHECK_LEVEL_CLASSES,
    CHECK_LEVEL_LABELS,
    CHECK_LEVEL_SYMBOLS,
  } from '@/lib/labels'
  import { provenanceOf } from '@/lib/provenance'
  import RentalPill from '../RentalPill.vue'
  import EditableSection from '../sections/EditableSection.vue'
  import ReadItem from '../sections/ReadItem.vue'

  /**
   * « Phase 2 : la louer en <année> » (lot 19, onglet Budget) : la
   * louabilité, le loyer visé et sa position entre le marché (comparables,
   * ou loyer de marché constaté) et le plafond d'encadrement (venu de
   * l'onglet Quartier), les contrôles ; la section se modifie sur place
   * (loyer visé d'abord, encadrement, marché, demande, règlement, décence,
   * permis, mobilier, notes). L'année et le type de location sont ceux de
   * l'espace (page Hypothèses). Plus bas, les loyers comparables et la
   * checklist réglementaire, repliés.
   */
  const props = defineProps<{
    item: EvaluatedListing
    evaluation: ListingEvaluation | null
    assumptions: Assumptions | null
    busy?: boolean
  }>()
  const emit = defineEmits<{ retainMarketRent: [rent: number] }>()

  const editor = useListingEditor()
  const listingId = computed(() => props.item.listing.id)
  const { data: context } = useListingContext(listingId)
  const { data: comparables } = useRentComparables(listingId)

  const plan = computed(() => props.item.listing.rentalPlan)
  const metrics = computed(() => props.evaluation?.metrics ?? null)
  const year = computed(
    () =>
      props.evaluation?.rental.year ??
      (props.assumptions ? budgetRentalYear(props.assumptions) : null)
  )
  const title = computed(() =>
    year.value === null
      ? 'Phase 2 : la louer'
      : `Phase 2 : la louer en ${year.value}`
  )
  const furnished = computed(
    () => (props.assumptions?.leaseType ?? 'unfurnished') !== 'unfurnished'
  )

  /** Le marché : la fourchette des comparables, sinon le loyer de marché constaté. */
  const market = computed(() => {
    const range = marketRange(
      comparables.value?.market.stats ?? null,
      props.item.listing.surface
    )
    if (range) {
      return {
        low: range.low,
        high: range.high,
        text: `marché ${formatEuros(range.low)} à ${formatEuros(range.high)} (${comparables.value?.market.stats?.count ?? 0} comparables)`,
      }
    }
    const rent = plan.value?.marketRent ?? null
    return rent !== null
      ? {
          low: rent,
          high: rent,
          text: `marché ${formatEuros(rent)} (constaté)`,
        }
      : null
  })
  const capText = computed(() => {
    const m = metrics.value
    if (!m) return null
    if (m.rentCap !== null) return `plafond ${formatEuros(m.rentCap)}`
    return m.rentControlled ? 'plafond à préciser' : 'pas d’encadrement'
  })
  const gauge = computed(() =>
    metrics.value
      ? rentGauge({
          targetRent: metrics.value.targetRent,
          marketLow: market.value?.low ?? null,
          marketHigh: market.value?.high ?? null,
          rentCap: metrics.value.rentCap,
        })
      : null
  )

  const rentControl = computed(() => context.value?.rentControl ?? null)
  const STATUS_TONES: Record<OpenDataStatus, Tone> = {
    ok: 'good',
    to_verify: 'warn',
    not_applicable: 'neutral',
    unavailable: 'neutral',
  }

  const DEMAND_LABELS = {
    strong: 'forte',
    medium: 'moyenne',
    weak: 'faible',
  } as const

  /** La provenance et la mise en évidence d'un champ de la phase 2. */
  function meta(path: string): {
    provenance: ReturnType<typeof provenanceOf>
    changed: boolean
  } {
    const key = path === 'furnitureValue' ? path : `rentalPlan.${path}`
    return {
      provenance:
        provenanceOf(editor.fieldSources.value, key) ??
        provenanceOf(editor.fieldSources.value, 'rentalPlan'),
      changed: editor.changedFields.value.includes(key),
    }
  }
  const error = (path: string): string | undefined =>
    editor.errors.value[`rentalPlan.${path}`] ??
    (path === 'furnitureValue' ? editor.errors.value.furnitureValue : undefined)

  const YES_NO_UNKNOWN = [
    { value: 'unknown', label: 'À vérifier' },
    { value: 'yes', label: 'Oui' },
    { value: 'no', label: 'Non' },
  ]
  const RENT_CONTROL_OPTIONS = [
    { value: 'auto', label: 'Automatique (commune)' },
    { value: 'yes', label: 'Oui, loyer plafonné' },
    { value: 'no', label: 'Non' },
  ]
  const DEMAND_OPTIONS = [
    { value: '', label: 'À évaluer' },
    { value: 'strong', label: 'Forte (tram, campus, CHU, emplois)' },
    { value: 'medium', label: 'Moyenne' },
    { value: 'weak', label: 'Faible' },
  ]
  const PERMIT_OPTIONS = [
    { value: 'unknown', label: 'À vérifier' },
    { value: 'no', label: 'Non' },
    { value: 'yes', label: 'Oui (demande à faire)' },
  ]
</script>

<template>
  <EditableSection
    section="rental"
    :title="title"
    preview
    data-testid="rental-phase"
  >
    <template #actions>
      <RentalPill v-if="evaluation" :verdict="evaluation.rental.verdict" />
    </template>

    <div class="grid gap-1">
      <div class="flex flex-wrap items-end gap-x-6 gap-y-2">
        <dl class="m-0">
          <ReadItem
            label="Loyer visé HC"
            source="rentalPlan"
            :changed-keys="['rentalPlan.targetRent']"
            :tone="plan?.targetRent ? 'default' : 'warn'"
          >
            <span class="font-display text-2xl" data-testid="target-rent">{{
              plan?.targetRent
                ? formatEurosPerMonth(plan.targetRent)
                : 'à renseigner'
            }}</span>
          </ReadItem>
        </dl>
        <p class="pb-1 text-sm text-muted" data-testid="rent-references">
          <template v-if="market">{{ market.text }}</template
          ><template v-else>marché inconnu</template
          ><template v-if="capText"> · {{ capText }}</template>
        </p>
      </div>
      <div
        v-if="gauge"
        aria-hidden="true"
        class="relative my-2 h-2.5 rounded-full bg-surface-2"
        data-testid="rent-gauge"
      >
        <span
          v-if="gauge.marketFromShare !== null && gauge.marketToShare !== null"
          class="absolute inset-y-0 rounded-full bg-accent/40"
          :style="{
            left: formatCssPercent(gauge.marketFromShare),
            width: formatCssPercent(
              Math.max(0.012, gauge.marketToShare - gauge.marketFromShare)
            ),
          }"
          data-marker="market"
        />
        <span
          v-if="gauge.capShare !== null"
          class="absolute -top-1 h-[18px] w-0.5 bg-warn"
          :style="{ left: formatCssPercent(gauge.capShare) }"
          data-marker="cap"
        />
        <span
          class="absolute -top-[5px] size-5 -translate-x-1/2 rounded-full border-2 border-surface bg-accent"
          :style="{ left: formatCssPercent(gauge.targetShare) }"
          data-marker="target"
        />
      </div>
      <p
        v-if="
          metrics &&
          metrics.rentCap !== null &&
          metrics.targetRent > metrics.rentCap
        "
        class="text-xs text-warn"
      >
        Loyer visé au-dessus du plafond : les calculs retiennent
        {{ formatEurosPerMonth(metrics.rentCap) }}.
      </p>
    </div>

    <ul
      v-if="evaluation"
      class="grid gap-1 text-sm"
      aria-label="Contrôles de la mise en location"
      data-testid="rental-checks"
    >
      <li
        v-for="check in evaluation.rental.checks"
        :key="check.key"
        class="grid grid-cols-[18px_1fr] gap-1.5"
        :data-check="check.key"
        :data-level="check.level"
      >
        <span
          class="font-mono text-xs font-bold"
          :class="CHECK_LEVEL_CLASSES[check.level]"
          :aria-label="CHECK_LEVEL_LABELS[check.level]"
          >{{ CHECK_LEVEL_SYMBOLS[check.level] }}</span
        >
        <span>{{ check.message }}</span>
      </li>
    </ul>

    <!-- La demande est déjà dite par les contrôles quand ils sont calculés. -->
    <dl
      v-if="
        plan &&
        ((plan.demand && !evaluation) ||
          plan.notes ||
          item.listing.furnitureValue)
      "
      class="grid gap-3 text-sm @xl:grid-cols-3"
    >
      <ReadItem
        v-if="plan.demand && !evaluation"
        label="Demande locative"
        :value="DEMAND_LABELS[plan.demand]"
      />
      <ReadItem
        v-if="item.listing.furnitureValue"
        label="Mobilier pour louer meublé"
        :value="formatEuros(item.listing.furnitureValue)"
        source="furnitureValue"
        :changed-keys="['furnitureValue']"
      />
      <ReadItem v-if="plan.notes" label="Notes location" :value="plan.notes" />
    </dl>

    <details
      v-if="rentControl"
      class="rounded-xl border border-line px-3 text-sm"
      data-testid="rent-control"
    >
      <summary
        class="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 font-medium"
      >
        Encadrement des loyers
        <UiBadge :tone="STATUS_TONES[rentControl.status]">{{
          OPEN_DATA_STATUS_LABELS[rentControl.status]
        }}</UiBadge>
      </summary>
      <div class="grid gap-1 pb-3">
        <p v-if="rentControl.referenceRentPerM2 !== null">
          Loyer de référence majoré
          <strong
            >{{
              rentControl.referenceRentPerM2.toLocaleString('fr-FR')
            }}
            €/m²</strong
          >
          <template v-if="rentControl.monthlyCap !== null">
            · plafond
            {{ formatEurosPerMonth(rentControl.monthlyCap) }} hors charges
          </template>
          <span class="block text-xs text-muted">
            zone {{ rentControl.zone?.zone }},
            {{
              rentControl.rooms === 4
                ? '4 pièces et plus'
                : plural(rentControl.rooms ?? 0, 'pièce')
            }},
            {{
              rentControl.epoch
                ? RENT_EPOCH_LABELS[rentControl.epoch].toLowerCase()
                : 'époque inconnue'
            }}, {{ rentControl.furnished ? 'meublé' : 'vide' }}
          </span>
        </p>
        <ul class="grid gap-0.5 text-xs">
          <li
            v-for="reason in rentControl.reasons"
            :key="reason"
            class="text-warn"
          >
            {{ reason }}
          </li>
          <li v-for="note in rentControl.notes" :key="note" class="text-muted">
            {{ note }}
          </li>
        </ul>
      </div>
    </details>

    <details class="rounded-xl border border-line px-3 text-sm">
      <summary class="flex min-h-11 cursor-pointer items-center font-medium">
        Loyers comparables
      </summary>
      <div class="pb-3">
        <RentMarketPanel
          :listing-id="item.listing.id"
          :furnished="furnished"
          :current-market-rent="plan?.marketRent ?? null"
          :busy="busy"
          @retain="rent => emit('retainMarketRent', rent)"
        />
      </div>
    </details>

    <details class="rounded-xl border border-line px-3 text-sm">
      <summary class="flex min-h-11 cursor-pointer items-center font-medium">
        Conformité réglementaire
      </summary>
      <div class="pb-3">
        <CompliancePanel :listing-id="item.listing.id" />
      </div>
    </details>

    <template #edit="{ draft }">
      <p class="text-sm text-muted">
        L’année et le type de location se règlent pour tout l’espace, dans la
        page
        <UiButton :to="{ name: 'assumptions' }" variant="link" size="inline"
          >Hypothèses</UiButton
        >.
      </p>
      <div class="grid gap-3 @xl:grid-cols-2">
        <UiField
          id="f-rent"
          v-model="draft.rentalPlan.targetRent"
          label="Loyer visé HC"
          v-bind="meta('targetRent')"
          :error="error('targetRent')"
          unit="€/mois"
          inputmode="numeric"
        />
        <UiField
          id="f-p2-control"
          v-model="draft.rentalPlan.rentControl"
          as="select"
          label="Encadrement des loyers"
          v-bind="meta('rentControl')"
          :options="RENT_CONTROL_OPTIONS"
        />
        <UiField
          id="f-p2-ref"
          v-model="draft.rentalPlan.referenceRentPerM2"
          label="Loyer de référence majoré"
          v-bind="meta('referenceRentPerM2')"
          :error="error('referenceRentPerM2')"
          hint="Simulateur Bordeaux Métropole ; vide = posé d’office s’il est connu"
          unit="€/m²"
          inputmode="decimal"
        />
        <UiField
          id="f-p2-market"
          v-model="draft.rentalPlan.marketRent"
          label="Loyer de marché constaté"
          v-bind="meta('marketRent')"
          :error="error('marketRent')"
          hint="Médiane de 5 à 10 annonces"
          unit="€/mois HC"
          inputmode="numeric"
        />
        <UiField
          id="f-p2-demand"
          v-model="draft.rentalPlan.demand"
          as="select"
          label="Demande locative"
          v-bind="meta('demand')"
          :options="DEMAND_OPTIONS"
        />
        <UiField
          id="f-p2-coown"
          v-model="draft.rentalPlan.coOwnershipAllowsRental"
          as="select"
          label="Le règlement de copropriété autorise la location"
          v-bind="meta('coOwnershipAllowsRental')"
          :options="YES_NO_UNKNOWN"
        />
        <UiField
          id="f-p2-decency"
          v-model="draft.rentalPlan.decencyCompliant"
          as="select"
          label="Critères de décence respectés"
          v-bind="meta('decencyCompliant')"
          :options="YES_NO_UNKNOWN"
        />
        <UiField
          id="f-p2-permit"
          v-model="draft.rentalPlan.rentalPermitRequired"
          as="select"
          label="Permis de louer exigé dans le secteur"
          v-bind="meta('rentalPermitRequired')"
          :options="PERMIT_OPTIONS"
        />
        <UiField
          id="f-furniture"
          v-model="draft.furnitureValue"
          label="Mobilier pour louer meublé"
          v-bind="meta('furnitureValue')"
          :error="error('furnitureValue')"
          hint="Compté dans le coût tout compris"
          unit="€"
          inputmode="numeric"
        />
        <UiField
          id="f-p2-notes"
          v-model="draft.rentalPlan.notes"
          label="Notes location"
          v-bind="meta('notes')"
          full
          placeholder="Profil de locataire visé, atouts, points faibles…"
        />
      </div>
    </template>
  </EditableSection>
</template>
