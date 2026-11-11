<script setup lang="ts">
  import { computed } from 'vue'
  import type { NotaryMode } from '@apart/contracts'
  import { REFERENCE_NOTARY_PRICE } from '@apart/domain'
  import DefinitionButton from '@/components/ui/DefinitionButton.vue'
  import { useAssumptionsDraftContext } from '@/composables/useAssumptionsDraft'
  import { NOTARY_MODE_LABELS } from '@/lib/assumptions-form'
  import { changedCountLabel } from '@/lib/assumptions-summary'
  import { formatEuros, formatPercent, parseNumberInput } from '@/lib/format'
  import ChangeNote from '@/components/ui/ChangeNote.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiField from '@/components/ui/UiField.vue'
  import UiInput from '@/components/ui/UiInput.vue'

  /**
   * « Frais de notaire » (lot 13) : choix segmenté barème officiel ou taux
   * forfaitaire. En barème, un résumé (origine, taux effectif sur un prix
   * d'exemple, calculé par `@apart/domain`) et le détail replié : droits de
   * mutation, tranches d'émoluments, autres frais. En forfait, le seul taux.
   */
  const {
    form,
    changeOf,
    errorOf,
    readings,
    openPanels,
    changes,
    restoreDefaultScale,
  } = useAssumptionsDraftContext()

  const MODES: readonly NotaryMode[] = ['scale', 'rate']

  /** Postes du barème hors tranches : droits, TVA, contribution, minimum, débours. */
  const SCALE_PARAMETERS = 7

  const detailChanged = computed(
    () => changes.value.filter(c => c.panel === 'scaleDetail').length
  )

  const euros = (raw: string | undefined): string => {
    const value = parseNumberInput(raw ?? '')
    return value === null ? '…' : formatEuros(value)
  }

  /** « 6 500 à 17 000 € », « au-delà de 60 000 € » : la part du prix de la tranche. */
  function bandRange(index: number): string {
    const previous = index === 0 ? '0' : form.value.scale.bands[index - 1]?.upTo
    const current = form.value.scale.bands[index]?.upTo ?? ''
    if (current.trim() === '') return `au-delà de ${euros(previous)}`
    return `${index === 0 ? '0 €' : euros(previous)} à ${euros(current)}`
  }
</script>

<template>
  <div class="grid gap-3.5">
    <fieldset class="grid gap-1.5">
      <legend class="sr-only">Mode de calcul des frais de notaire</legend>
      <div
        class="flex w-full gap-1 justify-self-start rounded-xl bg-surface-2 p-1 sm:w-auto"
      >
        <label
          v-for="mode in MODES"
          :key="mode"
          class="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg px-3.5 text-sm text-muted has-[:checked]:bg-surface has-[:checked]:font-semibold has-[:checked]:text-fg has-[:checked]:shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent sm:flex-none"
          :data-testid="`notary-mode-${mode}`"
        >
          <!-- Lot 22 : choix segmenté en vrais boutons radio (fieldset et légende), gardé tel quel. -->
          <input
            :id="`h-notary-mode-${mode}`"
            v-model="form.notaryMode"
            type="radio"
            name="h-notary-mode"
            :value="mode"
            class="sr-only"
          />
          {{ NOTARY_MODE_LABELS[mode] }}
        </label>
      </div>
      <ChangeNote :change="changeOf('notaryMode')" />
    </fieldset>

    <UiField
      v-if="form.notaryMode === 'rate'"
      id="h-notary"
      v-model="form.notaryRatePercent"
      class="max-w-sm"
      label="Frais de notaire"
      unit="% du prix net vendeur"
      inputmode="decimal"
      hint="net vendeur : prix affiché moins les honoraires à la charge de l'acquéreur"
      term="notary_fees"
      :change="changeOf('notaryRatePercent')"
      :error="errorOf('notaryRatePercent')"
    />

    <template v-else>
      <p
        class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm"
        data-testid="notary-scale-summary"
      >
        <span
          >Logement ancien ·
          {{ form.scale.label.trim() || 'barème personnalisé' }}</span
        >
        <span v-if="readings.scaleRate !== null" class="tabular-nums"
          >≈ {{ formatPercent(readings.scaleRate) }} sur un bien à
          {{ formatEuros(REFERENCE_NOTARY_PRICE) }}</span
        >
        <span v-else class="text-bad">barème incomplet : voir le détail</span>
      </p>
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <UiButton
          variant="ghost"
          class="px-1 text-left font-semibold text-accent"
          :icon="openPanels.scaleDetail ? 'chevron-down' : 'chevron-right'"
          :aria-expanded="openPanels.scaleDetail"
          aria-controls="scale-detail"
          data-testid="toggle-scale-detail"
          @click="openPanels.scaleDetail = !openPanels.scaleDetail"
        >
          Détail du barème
          <span class="font-normal text-muted"
            >· {{ SCALE_PARAMETERS }} paramètres et
            {{ form.scale.bands.length }} tranches</span
          >
        </UiButton>
        <DefinitionButton term="notary_fees" />
        <span
          v-if="detailChanged && !openPanels.scaleDetail"
          class="text-xs font-semibold text-accent"
          >{{ changedCountLabel(detailChanged) }}</span
        >
      </div>

      <div
        v-if="openPanels.scaleDetail"
        id="scale-detail"
        class="grid gap-3.5 rounded-xl bg-surface-2/60 p-3.5"
        data-testid="notary-scale"
      >
        <h3 class="text-sm font-semibold">Droits de mutation</h3>
        <div
          class="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]"
        >
          <UiField
            id="h-dept"
            v-model="form.scale.departmentalRatePercent"
            quiet
            label="Droit départemental"
            unit="%"
            inputmode="decimal"
            hint="5 % en Gironde depuis le 1er mai 2025 ; 4,5 % pour les primo-accédants"
            :change="changeOf('scale.departmentalRatePercent')"
            :error="errorOf('scale.departmentalRatePercent')"
          />
          <UiField
            id="h-communal"
            v-model="form.scale.communalRatePercent"
            quiet
            label="Taxe communale"
            unit="%"
            inputmode="decimal"
            :change="changeOf('scale.communalRatePercent')"
            :error="errorOf('scale.communalRatePercent')"
          />
          <UiField
            id="h-collection"
            v-model="form.scale.collectionFeeRatePercent"
            quiet
            label="Frais d'assiette"
            unit="% du droit dép."
            inputmode="decimal"
            :change="changeOf('scale.collectionFeeRatePercent')"
            :error="errorOf('scale.collectionFeeRatePercent')"
          />
        </div>

        <h3 id="bands-title" class="text-sm font-semibold">
          Émoluments du notaire, par tranche de prix
        </h3>
        <table
          class="w-full max-w-lg table-fixed text-sm tabular-nums"
          aria-labelledby="bands-title"
          aria-describedby="bands-source"
        >
          <thead>
            <tr class="text-left text-xs text-muted">
              <th scope="col" class="w-[34%] py-1.5 pr-2 font-medium">
                Tranche
              </th>
              <th scope="col" class="px-1 py-1.5 text-right font-medium">
                Jusqu'à
              </th>
              <th
                scope="col"
                class="w-[30%] py-1.5 pl-1 text-right font-medium"
              >
                Taux
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(band, index) in form.scale.bands"
              :key="index"
              class="border-t border-line align-top"
            >
              <th scope="row" class="py-2 pr-2 text-left font-normal">
                {{ index + 1 }}
                <span class="block text-xs text-muted">{{
                  bandRange(index)
                }}</span>
              </th>
              <td class="px-1 py-1.5">
                <UiInput
                  :id="`h-band-${index}-up`"
                  v-model="band.upTo"
                  unit="€"
                  inputmode="numeric"
                  autocomplete="off"
                  :placeholder="
                    index === form.scale.bands.length - 1 ? 'au-delà' : ''
                  "
                  :aria-label="`Borne supérieure de la tranche ${index + 1} en euros`"
                  :invalid="!!errorOf(`scale.bands.${index}.upTo`)"
                  :changed="!!changeOf(`scale.bands.${index}.upTo`)"
                  class="px-2.5"
                />
                <ChangeNote :change="changeOf(`scale.bands.${index}.upTo`)" />
                <p
                  v-if="errorOf(`scale.bands.${index}.upTo`)"
                  class="text-sm font-medium text-bad"
                >
                  {{ errorOf(`scale.bands.${index}.upTo`) }}
                </p>
              </td>
              <td class="py-1.5 pl-1">
                <UiInput
                  :id="`h-band-${index}-rate`"
                  v-model="band.ratePercent"
                  unit="%"
                  inputmode="decimal"
                  autocomplete="off"
                  :aria-label="`Taux de la tranche ${index + 1} en pourcentage`"
                  :invalid="!!errorOf(`scale.bands.${index}.ratePercent`)"
                  :changed="!!changeOf(`scale.bands.${index}.ratePercent`)"
                  class="px-2.5"
                />
                <ChangeNote
                  :change="changeOf(`scale.bands.${index}.ratePercent`)"
                />
                <p
                  v-if="errorOf(`scale.bands.${index}.ratePercent`)"
                  class="text-sm font-medium text-bad"
                >
                  {{ errorOf(`scale.bands.${index}.ratePercent`) }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
        <p id="bands-source" class="text-xs text-muted">
          Article A444-91 du code de commerce ; chaque taux s'applique à la part
          du prix comprise dans sa tranche, hors TVA.
        </p>

        <h3 class="text-sm font-semibold">Autres frais</h3>
        <div
          class="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]"
        >
          <UiField
            id="h-vat"
            v-model="form.scale.emolumentVatRatePercent"
            quiet
            label="TVA sur émoluments"
            unit="%"
            inputmode="decimal"
            :change="changeOf('scale.emolumentVatRatePercent')"
            :error="errorOf('scale.emolumentVatRatePercent')"
          />
          <UiField
            id="h-csi"
            v-model="form.scale.securityContributionRatePercent"
            quiet
            label="Sécurité immobilière (CSI)"
            unit="%"
            inputmode="decimal"
            :change="changeOf('scale.securityContributionRatePercent')"
            :error="errorOf('scale.securityContributionRatePercent')"
          />
          <UiField
            id="h-csi-min"
            v-model="form.scale.securityContributionMinimum"
            quiet
            label="Minimum de la CSI"
            unit="€"
            inputmode="numeric"
            :change="changeOf('scale.securityContributionMinimum')"
            :error="errorOf('scale.securityContributionMinimum')"
          />
          <UiField
            id="h-disbursements"
            v-model="form.scale.disbursements"
            quiet
            label="Débours et formalités"
            unit="€ estimés"
            inputmode="numeric"
            :change="changeOf('scale.disbursements')"
            :error="errorOf('scale.disbursements')"
          />
        </div>
        <UiField
          id="h-scale-label"
          v-model="form.scale.label"
          quiet
          align="left"
          label="Origine des valeurs"
          hint="affichée dans le résumé ; les forfaits sont des estimations (≈)"
          :change="changeOf('scale.label')"
          :error="errorOf('scale.label')"
        />
        <UiButton
          v-if="!readings.scaleIsDefault"
          variant="ghost"
          class="justify-self-start px-1 font-semibold text-accent"
          data-testid="restore-default-scale"
          @click="restoreDefaultScale"
        >
          Revenir au barème officiel
        </UiButton>
      </div>
    </template>
  </div>
</template>
