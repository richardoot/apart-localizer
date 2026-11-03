<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { ExtractionResult, ListingInput } from '@apart/contracts'
  import { missingListingFields } from '@apart/contracts'
  import SidePanel from '@/components/ui/SidePanel.vue'
  import { describeUsage } from '@/composables/useExtraction'
  import { useListingMutations } from '@/composables/useListings'
  import { useLivePreview } from '@/composables/useLivePreview'
  import { useAssumptions } from '@/composables/useWorkspace'
  import { ApiError } from '@/lib/api'
  import {
    emptyForm,
    formFromInput,
    formToRawInput,
    mergeExtractedInput,
    validateForm,
  } from '@/lib/listing-form'
  import type { ListingForm as ListingFormModel } from '@/lib/listing-form'
  import { provenanceAfterEdits } from '@/lib/provenance'
  import DuplicatesBanner from './DuplicatesBanner.vue'
  import ExtractionPane from './ExtractionPane.vue'
  import ListingForm from './ListingForm.vue'
  import MetricsPreview from './MetricsPreview.vue'
  import MissingFieldsNotice from './MissingFieldsNotice.vue'
  import RentalChecksList from './RentalChecksList.vue'

  const emit = defineEmits<{
    close: []
    created: [id: string]
    /** Le membre a reconnu un doublon : ouvrir l'annonce existante. */
    open: [id: string]
  }>()

  type Tab = 'paste' | 'manual'
  const tab = ref<Tab>('paste')

  const form = ref(emptyForm())
  const errors = ref<Record<string, string>>({})
  const failure = ref<string | null>(null)
  const { values: assumptions } = useAssumptions()
  const preview = useLivePreview(form, assumptions)
  const { create } = useListingMutations()

  /** Le résultat de l'extraction, et le formulaire tel qu'il l'a rempli (pour repérer les corrections). */
  const extraction = ref<ExtractionResult | null>(null)
  const extractedForm = ref<ListingFormModel | null>(null)
  const ignoreDuplicates = ref(false)

  /** La provenance courante : l'IA pour ce qui n'a pas bougé, « vous » (côté serveur) pour le reste. */
  const fieldSources = computed(() => {
    if (!extraction.value || !extractedForm.value) return null
    return provenanceAfterEdits(
      extraction.value.listing.fieldSources,
      extractedForm.value,
      form.value
    )
  })

  /** Les champs indispensables encore vides, recalculés à chaque frappe. */
  const missingPaths = computed(() => {
    if (!extraction.value) return []
    const { input } = validateForm(form.value)
    const candidate: ListingInput | null = input
      ? {
          ...extraction.value.listing,
          ...input,
          fieldSources: fieldSources.value ?? {},
        }
      : null
    const missing = candidate
      ? missingListingFields(candidate, fieldSources.value ?? {})
      : extraction.value.missingFields
    return missing.map(m =>
      m.field === 'location.addressRaw' ? 'addressRaw' : m.field
    )
  })
  const missingFields = computed(() => {
    if (!extraction.value) return []
    return extraction.value.missingFields.filter(m =>
      missingPaths.value.includes(
        m.field === 'location.addressRaw' ? 'addressRaw' : m.field
      )
    )
  })
  const visibleDuplicates = computed(() =>
    ignoreDuplicates.value ? [] : (extraction.value?.duplicates ?? [])
  )

  function onExtracted(result: ExtractionResult): void {
    extraction.value = result
    const filled = formFromInput(result.listing)
    form.value = filled
    extractedForm.value = JSON.parse(JSON.stringify(filled)) as ListingFormModel
    ignoreDuplicates.value = false
    errors.value = {}
    failure.value = null
    tab.value = 'manual'
  }

  function startOver(): void {
    extraction.value = null
    extractedForm.value = null
    form.value = emptyForm()
    errors.value = {}
    tab.value = 'paste'
  }

  async function save(): Promise<void> {
    const { input, errors: issues } = validateForm(form.value)
    errors.value = issues
    if (!input) return
    failure.value = null
    try {
      const body = extraction.value
        ? {
            ...mergeExtractedInput(
              extraction.value.listing,
              formToRawInput(form.value)
            ),
            fieldSources: fieldSources.value ?? {},
            ignoreDuplicates: ignoreDuplicates.value,
          }
        : input
      const created = await create.mutateAsync(body)
      emit('created', created.listing.id)
    } catch (err) {
      failure.value =
        err instanceof ApiError ? err.message : "L'enregistrement a échoué."
    }
  }
</script>

<template>
  <SidePanel title="Nouvelle annonce" @close="emit('close')">
    <div class="grid gap-6">
      <div
        class="flex gap-1 rounded-lg bg-surface-2 p-1 text-sm"
        role="tablist"
        aria-label="Mode de saisie"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'paste'"
          class="flex-1 rounded-md px-3 py-1.5"
          :class="
            tab === 'paste' ? 'bg-surface font-medium shadow' : 'text-muted'
          "
          @click="tab = 'paste'"
        >
          Coller une annonce
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'manual'"
          class="flex-1 rounded-md px-3 py-1.5"
          :class="
            tab === 'manual' ? 'bg-surface font-medium shadow' : 'text-muted'
          "
          @click="tab = 'manual'"
        >
          {{ extraction ? 'Fiche pré-remplie' : 'Saisie manuelle' }}
        </button>
      </div>

      <ExtractionPane v-if="tab === 'paste'" @extracted="onExtracted" />

      <template v-else>
        <div
          v-if="extraction"
          class="grid gap-2 rounded-xl border border-line px-4 py-3 text-sm"
          data-testid="extraction-summary"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p>
              <strong>Fiche pré-remplie par l'IA.</strong>
              Vérifiez chaque champ : les pastilles disent d'où vient la valeur
              et avec quelle confiance ; survolez-les pour lire l'extrait. Un
              champ que vous modifiez passe en « vous ».
            </p>
            <button
              type="button"
              class="rounded-lg border border-line px-3 py-1 text-xs"
              @click="startOver"
            >
              Recommencer
            </button>
          </div>
          <p class="text-xs text-muted" data-testid="extraction-cost">
            {{ describeUsage(extraction.usage) }}
            <template v-if="extraction.geocoded">
              · adresse géocodée (IGN)</template
            >
          </p>
          <ul
            v-if="extraction.warnings.length"
            class="list-disc pl-5 text-xs text-muted"
          >
            <li v-for="(warning, index) in extraction.warnings" :key="index">
              {{ warning }}
            </li>
          </ul>
          <MissingFieldsNotice :missing="missingFields" />
        </div>

        <DuplicatesBanner
          :duplicates="visibleDuplicates"
          @open="id => emit('open', id)"
          @ignore="ignoreDuplicates = true"
        />

        <MetricsPreview :evaluation="preview.evaluation" />
        <RentalChecksList
          v-if="preview.evaluation"
          :rental="preview.evaluation.rental"
        />
        <ListingForm
          v-model="form"
          :errors="errors"
          :field-sources="fieldSources"
          :missing="missingPaths"
        />
        <p
          v-if="failure"
          role="alert"
          class="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
        >
          {{ failure }}
        </p>
      </template>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-line px-3 py-1.5 text-sm"
          @click="emit('close')"
        >
          Annuler
        </button>
        <button
          v-if="tab === 'manual'"
          type="button"
          class="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
          :disabled="create.isPending.value"
          data-testid="save"
          @click="save"
        >
          {{ create.isPending.value ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </template>
  </SidePanel>
</template>
