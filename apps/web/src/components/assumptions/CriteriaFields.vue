<script setup lang="ts">
  import { computed } from 'vue'
  import type { TargetCriterion } from '@apart/contracts'
  import type { DiscountScaleSegment } from '@apart/domain'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import { useAssumptionsDraftContext } from '@/composables/useAssumptionsDraft'
  import { CRITERIA_ERROR_KEY } from '@/lib/assumptions-form'
  import type { AssumptionsFormModel } from '@/lib/assumptions-form'
  import { changedCountLabel } from '@/lib/assumptions-summary'
  import { formatCssPercent, formatRateCompact } from '@/lib/format'
  import ChangeNote from '@/components/ui/ChangeNote.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiCheckbox from '@/components/ui/UiCheckbox.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiInput from '@/components/ui/UiInput.vue'

  /**
   * « Qu'est-ce qu'une bonne affaire pour toi ? » (lot 13) : une ligne par
   * seuil, avec sa case « prix cible » sur la même ligne (la donnée
   * `targetCriteria` d'avant, mêmes règles : le net exige son seuil, sa case
   * reste grisée tant que le seuil est vide), puis la « Marge de
   * négociation » repliée, avec l'échelle de `domain` (`discountScale`).
   */
  const {
    desktop,
    form,
    draft,
    changeOf,
    errorOf,
    readings,
    openPanels,
    changes,
    setCriterion,
  } = useAssumptionsDraftContext()

  type ThresholdField = keyof Pick<
    AssumptionsFormModel,
    | 'grossYieldThresholdPercent'
    | 'maxMonthlyEffort'
    | 'netYieldThresholdPercent'
  >

  interface CriterionRow {
    criterion: TargetCriterion
    label: string
    hint: string
    term: string
    optional?: boolean
    threshold: {
      field: ThresholdField
      id: string
      unit: string
      inputmode: 'decimal' | 'numeric'
    } | null
  }

  const ROWS: readonly CriterionRow[] = [
    {
      criterion: 'gross_yield',
      label: 'Rendement brut minimum',
      hint: 'loyer annuel ÷ coût tout compris',
      term: 'gross_yield',
      threshold: {
        field: 'grossYieldThresholdPercent',
        id: 'h-yield',
        unit: '%',
        inputmode: 'decimal',
      },
    },
    {
      criterion: 'effort',
      label: 'Effort mensuel maximum',
      hint: 'ce que tu ajoutes chaque mois au loyer perçu',
      term: 'effort',
      threshold: {
        field: 'maxMonthlyEffort',
        id: 'h-effort',
        unit: '€/mois',
        inputmode: 'numeric',
      },
    },
    {
      criterion: 'net_yield',
      label: 'Rendement net minimum',
      hint: 'après charges, taxe foncière et vacance ; vide = non utilisé',
      term: 'net_yield',
      optional: true,
      threshold: {
        field: 'netYieldThresholdPercent',
        id: 'h-net-yield',
        unit: '%',
        inputmode: 'decimal',
      },
    },
    {
      criterion: 'rent_x220',
      label: 'Repère 220 × loyer',
      hint: 'coût tout compris au plus 220 fois le loyer mensuel ; aucun seuil à saisir',
      term: 'rule_220',
      optional: true,
      threshold: null,
    },
  ]

  const checked = (criterion: TargetCriterion): boolean =>
    form.value.targetCriteria.includes(criterion)

  /** Le net ne se coche qu'avec un seuil ; coché, il reste décochable. */
  const disabled = (row: CriterionRow): boolean =>
    row.criterion === 'net_yield' &&
    form.value.netYieldThresholdPercent.trim() === '' &&
    !checked(row.criterion)

  const marketRetained = computed(() =>
    form.value.targetCriteria.includes('market')
  )

  const negotiationChanged = computed(
    () => changes.value.filter(c => c.panel === 'negotiation').length
  )
  const negotiationSummary = computed(() => {
    const n = draft.value.negotiableDiscount
    const t = draft.value.tightDiscount
    const fmt = (v: number | null): string =>
      v === null ? '—' : formatRateCompact(v)
    return desktop.value
      ? `négociable jusqu'à ${fmt(n)}, tendue jusqu'à ${fmt(t)}`
      : `${fmt(n)} / ${fmt(t)}`
  })

  const SEGMENT_CLASSES: Record<DiscountScaleSegment['kind'], string> = {
    negotiable: 'bg-good',
    tight: 'bg-warn',
    out_of_reach: 'bg-bad',
  }
  const SEGMENT_LABELS: Record<DiscountScaleSegment['kind'], string> = {
    negotiable: 'négociable',
    tight: 'tendue',
    out_of_reach: 'hors de portée',
  }

  /** Explication, unité, erreur et modification décrivent la case du seuil. */
  function thresholdDescription(row: CriterionRow): string {
    const t = row.threshold
    if (!t) return ''
    return [
      `crit-${row.criterion}-hint`,
      errorOf(t.field) ? `${t.id}-error` : null,
      changeOf(t.field) ? `${t.id}-change` : null,
    ]
      .filter(Boolean)
      .join(' ')
  }
</script>

<template>
  <div class="grid gap-3.5">
    <div
      class="grid overflow-hidden rounded-xl border border-line"
      role="group"
      aria-label="Seuils de la bonne affaire et critères du prix cible"
      data-testid="target-criteria"
    >
      <div
        v-for="(row, i) in ROWS"
        :key="row.criterion"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3"
        :class="[
          i > 0 ? 'border-t border-line' : '',
          row.optional ? 'bg-surface-2/50' : '',
        ]"
        :data-criterion="row.criterion"
      >
        <div
          class="grid min-w-0 basis-full gap-0.5 sm:flex-[1_1_12.5rem] sm:basis-auto"
        >
          <span class="flex items-center gap-1.5">
            <label
              v-if="row.threshold"
              :id="`crit-${row.criterion}-label`"
              :for="row.threshold.id"
              class="font-semibold"
              >{{ row.label
              }}<span v-if="row.optional" class="font-normal text-muted">
                (facultatif)</span
              ></label
            >
            <span
              v-else
              :id="`crit-${row.criterion}-label`"
              class="font-semibold"
              >{{ row.label }}</span
            >
            <DefinitionButton :term="row.term" />
          </span>
          <span :id="`crit-${row.criterion}-hint`" class="text-xs text-muted">{{
            row.hint
          }}</span>
        </div>
        <UiInput
          v-if="row.threshold"
          :id="row.threshold.id"
          v-model="form[row.threshold.field]"
          :unit="row.threshold.unit"
          :invalid="!!errorOf(row.threshold.field)"
          :changed="!!changeOf(row.threshold.field)"
          :described-by="thresholdDescription(row)"
          :inputmode="row.threshold.inputmode"
          :placeholder="row.optional ? '—' : undefined"
          autocomplete="off"
          class="min-w-0 flex-1 sm:w-36 sm:flex-none"
        />
        <UiCheckbox
          :id="`h-crit-${row.criterion}`"
          :model-value="checked(row.criterion)"
          :disabled="disabled(row)"
          :aria-labelledby="`crit-${row.criterion}-label h-crit-${row.criterion}-text`"
          :aria-describedby="
            disabled(row) ? `crit-${row.criterion}-hint` : undefined
          "
          class="shrink-0"
          :class="disabled(row) ? 'cursor-not-allowed text-muted' : ''"
          @update:model-value="
            value => setCriterion(row.criterion, value === true)
          "
        >
          <span :id="`h-crit-${row.criterion}-text`">prix cible</span>
        </UiCheckbox>
        <div
          v-if="
            (row.threshold &&
              (errorOf(row.threshold.field) ||
                changeOf(row.threshold.field))) ||
            changeOf(`targetCriteria.${row.criterion}`)
          "
          class="grid basis-full gap-0.5"
        >
          <p
            v-if="row.threshold && errorOf(row.threshold.field)"
            :id="`${row.threshold.id}-error`"
            class="text-sm font-medium text-bad"
            data-testid="field-error"
          >
            {{ errorOf(row.threshold.field) }}
          </p>
          <ChangeNote
            v-if="row.threshold"
            :id="`${row.threshold.id}-change`"
            :change="changeOf(row.threshold.field)"
          />
          <ChangeNote
            subject="prix cible"
            :change="changeOf(`targetCriteria.${row.criterion}`)"
          />
        </div>
      </div>
    </div>
    <p
      v-if="errorOf(CRITERIA_ERROR_KEY)"
      class="text-xs font-medium text-bad"
      data-testid="field-error"
    >
      Prix cible : {{ errorOf(CRITERIA_ERROR_KEY) }}
    </p>
    <p v-if="marketRetained" class="text-xs text-muted">
      Le critère « Marché (DVF) » est aussi retenu pour le prix cible ; il se
      règle en le demandant à Claude et reste tel quel ici.
    </p>

    <div class="grid gap-3">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <UiButton
          variant="ghost"
          class="px-1 text-left font-semibold text-accent"
          :icon="openPanels.negotiation ? 'chevron-down' : 'chevron-right'"
          :aria-expanded="openPanels.negotiation"
          aria-controls="negotiation-panel"
          data-testid="toggle-negotiation"
          @click="openPanels.negotiation = !openPanels.negotiation"
        >
          Marge de négociation
          <span class="font-normal text-muted">· {{ negotiationSummary }}</span>
        </UiButton>
        <DefinitionButton term="discount" />
        <span
          v-if="negotiationChanged && !openPanels.negotiation"
          class="text-xs font-semibold text-accent"
          >{{ changedCountLabel(negotiationChanged) }}</span
        >
      </div>
      <div
        v-if="openPanels.negotiation"
        id="negotiation-panel"
        class="grid gap-3.5 rounded-xl bg-surface-2/60 p-3.5"
        data-testid="negotiation-panel"
      >
        <p class="text-xs text-muted">
          La décote nécessaire pour atteindre le prix cible, comparée au prix
          affiché, classe chaque annonce.
        </p>
        <div
          v-if="readings.discountScale"
          class="grid gap-1.5"
          aria-hidden="true"
          data-testid="discount-scale"
        >
          <div class="flex h-2.5 overflow-hidden rounded-full">
            <span
              v-for="segment in readings.discountScale.segments"
              :key="segment.kind"
              class="h-full"
              :class="SEGMENT_CLASSES[segment.kind]"
              :style="{ width: formatCssPercent(segment.share) }"
            />
          </div>
          <div class="flex text-xs text-muted">
            <span
              v-for="segment in readings.discountScale.segments"
              :key="segment.kind"
              class="grid min-w-0 gap-0.5 pr-1"
              :style="{ width: formatCssPercent(segment.share) }"
            >
              <span class="tabular-nums">{{
                formatRateCompact(segment.from)
              }}</span>
              <span class="truncate">{{ SEGMENT_LABELS[segment.kind] }}</span>
            </span>
          </div>
        </div>
        <div class="grid gap-3.5 sm:grid-cols-2">
          <UiField
            id="h-negotiable"
            v-model="form.negotiableDiscountPercent"
            label="Négociable jusqu'à"
            unit="% de décote"
            inputmode="decimal"
            :change="changeOf('negotiableDiscountPercent')"
            :error="errorOf('negotiableDiscountPercent')"
          />
          <UiField
            id="h-tight"
            v-model="form.tightDiscountPercent"
            label="Tendue jusqu'à"
            unit="% de décote"
            inputmode="decimal"
            hint="au-delà : hors de portée"
            :change="changeOf('tightDiscountPercent')"
            :error="errorOf('tightDiscountPercent')"
          />
        </div>
      </div>
    </div>
  </div>
</template>
