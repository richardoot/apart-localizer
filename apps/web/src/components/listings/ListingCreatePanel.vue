<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import type {
    CriteriaMatchChanges,
    ExtractionResult,
    ListingDraft,
    ListingInput,
    ListingLinkInputRaw,
  } from '@apart/contracts'
  import {
    EXPLORATION_PORTAL_LABELS,
    listingSourceFromUrl,
    missingListingFields,
  } from '@apart/contracts'
  import SidePanel from '@/components/ui/SidePanel.vue'
  import { describeUsage } from '@/composables/useExtraction'
  import { useListingMutations } from '@/composables/useListings'
  import { useAttachLink } from '@/composables/useListingLinks'
  import { useLivePreview } from '@/composables/useLivePreview'
  import { useAssumptions } from '@/composables/useWorkspace'
  import { ApiError, api } from '@/lib/api'
  import { useDrafts } from '@/composables/useDrafts'
  import {
    emptyForm,
    formFromInput,
    formToRawInput,
    mergeExtractedInput,
    validateForm,
  } from '@/lib/listing-form'
  import type { ListingForm as ListingFormModel } from '@/lib/listing-form'
  import { parseNumberInput } from '@/lib/format'
  import { conflictListingOf, conflictText } from '@/lib/listing-links'
  import type { ConflictListing } from '@/lib/listing-links'
  import { provenanceAfterEdits } from '@/lib/provenance'
  import DuplicatesBanner from './DuplicatesBanner.vue'
  import ExtractionPane from './ExtractionPane.vue'
  import ListingForm from './ListingForm.vue'
  import MetricsPreview from './MetricsPreview.vue'
  import MissingFieldsNotice from './MissingFieldsNotice.vue'
  import RentalChecksList from './RentalChecksList.vue'

  const emit = defineEmits<{
    close: []
    created: [id: string, criteriaChanges?: CriteriaMatchChanges | null]
    /** Le membre a reconnu un doublon : ouvrir l'annonce existante. */
    open: [id: string]
  }>()

  type Tab = 'paste' | 'manual'
  const tab = ref<Tab>('paste')

  // Sans routeur (tests du panneau seul), ni partage ni brouillon.
  const query = useRoute()?.query ?? {}
  const one = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value : null
  /** Partage depuis le mobile (`/partager` → `?partage=1&url=&texte=&titre=`). */
  const shared =
    query.partage === '1'
      ? {
          url: one(query.url),
          text: one(query.texte),
          title: one(query.titre),
        }
      : null
  const sharedText = shared
    ? ([shared.text, shared.title].find(Boolean) ?? null)
    : null
  /** Brouillon reçu par e-mail à valider (`?brouillon=<id>`). */
  const draftId = one(query.brouillon)
  const draft = ref<ListingDraft | null>(null)
  const notice = ref<string | null>(null)
  const { decide, merge } = useDrafts()

  const form = ref(emptyForm())
  const errors = ref<Record<string, string>>({})
  const failure = ref<string | null>(null)
  const { values: assumptions } = useAssumptions()
  const preview = useLivePreview(form, assumptions)
  const { create } = useListingMutations()
  const attachLink = useAttachLink()
  /** Lot 18 : le refus d'une création (même lien, ou même agence et même référence). */
  const conflict = ref<ConflictListing | null>(null)

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

  /** Lot 18 : le lien de l'annonce saisie, à ajouter à une fiche existante. */
  const linkUrl = computed(() => form.value.url.trim() || null)

  /**
   * « C'est la même : ajouter ce lien » : le lien rejoint la fiche de
   * l'annonce suivie (origine « partagé depuis le téléphone » ou « à la
   * main »), avec ce qui a été lu (prix, vendeur) ; rien n'est créé. Un
   * brouillon se reconnaît comme la même annonce (`merge`).
   */
  async function attach(listingId: string): Promise<void> {
    const url = linkUrl.value
    if (!url) return
    failure.value = null
    try {
      if (draft.value) {
        await merge.mutateAsync({ id: draft.value.id, request: { listingId } })
      } else {
        const read = extraction.value?.listing ?? null
        const price = parseNumberInput(form.value.price)
        const input: ListingLinkInputRaw = {
          url,
          origin: shared ? 'share' : 'manual',
          ...(price !== null && price > 0 ? { price } : {}),
          ...(shared ? { online: true } : {}),
          ...(read && read.sellerType !== 'unknown'
            ? { sellerType: read.sellerType }
            : {}),
          ...(read?.sellerName ? { sellerName: read.sellerName } : {}),
          ...(read?.sellerReference ? { reference: read.sellerReference } : {}),
        }
        await attachLink.mutateAsync({ listingId, input })
      }
      emit('open', listingId)
    } catch (err) {
      failure.value = conflictText(
        err instanceof ApiError ? err.message : "L'ajout du lien a échoué."
      )
    }
  }

  /** « C'en est une autre : créer quand même » après un refus de même référence. */
  function createAnyway(): void {
    ignoreDuplicates.value = true
    conflict.value = null
    void save()
  }

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

  /** Sans IA : la saisie manuelle, pré-remplie avec ce que le partage a transmis. */
  function onUnavailable(): void {
    if (!shared) return
    const filled = emptyForm()
    filled.title = shared.title ?? 'Annonce partagée'
    filled.url = shared.url ?? ''
    filled.source = listingSourceFromUrl(shared.url)
    filled.description = shared.text ?? ''
    form.value = filled
    tab.value = 'manual'
    notice.value =
      "L'analyse par IA n'est pas configurée : le lien et le texte partagés sont repris, complétez la fiche."
  }

  /** Un brouillon reçu par e-mail ouvre comme une fiche extraite, doublons compris. */
  async function loadDraft(id: string): Promise<void> {
    try {
      const loaded = await api.drafts.get(id)
      draft.value = loaded
      onExtracted({
        listing: loaded.listing,
        missingFields: missingListingFields(loaded.listing),
        duplicates: loaded.duplicates,
        warnings: loaded.warnings,
        geocoded: false,
        usage: {
          model:
            loaded.extractedBy === 'ai'
              ? 'IA (alerte e-mail)'
              : loaded.extractedBy === 'claude'
                ? 'lu sur la page par Claude'
                : 'analyseur simple',
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          estimatedCostUsd: null,
          durationMs: 0,
        },
        persisted: false,
      })
      notice.value =
        loaded.origin === 'exploration'
          ? `Trouvée par Claude${loaded.portal ? ` sur ${EXPLORATION_PORTAL_LABELS[loaded.portal]}` : ''} : vérifiez la fiche avant d'enregistrer.`
          : `Reçue par e-mail${loaded.emailSubject ? ` (« ${loaded.emailSubject} »)` : ''} : vérifiez la fiche avant d'enregistrer.`
    } catch (err) {
      failure.value =
        err instanceof ApiError ? err.message : 'Brouillon introuvable.'
      tab.value = 'manual'
    }
  }

  onMounted(() => {
    if (draftId) void loadDraft(draftId)
  })

  async function dismissDraft(): Promise<void> {
    if (!draft.value) return
    await decide.mutateAsync({
      id: draft.value.id,
      decision: { status: 'dismissed' },
    })
    emit('close')
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
    conflict.value = null
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
        : ignoreDuplicates.value
          ? { ...input, ignoreDuplicates: true }
          : input
      const created = await create.mutateAsync(body)
      if (draft.value) {
        await decide.mutateAsync({
          id: draft.value.id,
          decision: { status: 'accepted', listingId: created.listing.id },
        })
      }
      emit('created', created.listing.id, created.criteriaChanges)
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "L'enregistrement a échoué."
      conflict.value =
        err instanceof ApiError && err.status === 409
          ? conflictListingOf(message)
          : null
      failure.value = conflictText(message)
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

      <p
        v-if="notice"
        class="rounded-lg bg-accent-soft px-3 py-2 text-sm"
        data-testid="create-notice"
      >
        {{ notice }}
        <button
          v-if="draft"
          type="button"
          class="ml-2 text-xs underline"
          data-testid="dismiss-draft"
          @click="dismissDraft"
        >
          Écarter ce brouillon
        </button>
      </p>

      <ExtractionPane
        v-if="tab === 'paste'"
        :initial-text="sharedText"
        :initial-url="shared?.url ?? null"
        :auto-analyze="Boolean(shared && (sharedText || shared.url))"
        @extracted="onExtracted"
        @unavailable="onUnavailable"
      />

      <template v-else>
        <div
          v-if="extraction"
          class="grid gap-2 rounded-xl border border-line px-4 py-3 text-sm"
          data-testid="extraction-summary"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p>
              <strong>{{
                draft?.extractedBy === 'parser'
                  ? 'Fiche pré-remplie par l’analyseur simple.'
                  : draft?.extractedBy === 'claude'
                    ? 'Fiche pré-remplie avec ce que Claude a lu sur la page.'
                    : "Fiche pré-remplie par l'IA."
              }}</strong>
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
          :link-url="linkUrl"
          :busy="attachLink.isPending.value || merge.isPending.value"
          @open="id => emit('open', id)"
          @ignore="ignoreDuplicates = true"
          @attach="attach"
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
        <div
          v-if="failure"
          role="alert"
          class="grid gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
          data-testid="create-failure"
        >
          <p>{{ failure }}</p>
          <div v-if="conflict" class="flex flex-wrap gap-2">
            <button
              v-if="!conflict.sameLink && linkUrl"
              type="button"
              class="min-h-9 rounded-lg border border-accent bg-surface px-3 text-xs font-semibold text-accent disabled:opacity-60"
              :disabled="attachLink.isPending.value || merge.isPending.value"
              data-action="conflict-attach"
              @click="attach(conflict.id)"
            >
              C’est la même : ajouter ce lien à « {{ conflict.title }} »
            </button>
            <button
              type="button"
              class="min-h-9 rounded-lg border border-line bg-surface px-3 text-xs text-fg"
              data-action="conflict-open"
              @click="emit('open', conflict.id)"
            >
              Ouvrir « {{ conflict.title }} »
            </button>
            <button
              v-if="!conflict.sameLink"
              type="button"
              class="min-h-9 rounded-lg border border-warn bg-surface px-3 text-xs text-warn"
              data-action="conflict-create"
              @click="createAnyway"
            >
              C’en est une autre : créer quand même
            </button>
          </div>
        </div>
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
